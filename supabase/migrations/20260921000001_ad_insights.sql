-- Paid ads reporting, owned in our own database.
--
-- Two halves make the Ads dashboard honest:
--   1. What the ad platform says it did: spend, impressions, clicks, and the
--      results it claims. Pulled from Meta's Insights API once a day (and on
--      demand from the admin), one row per ad per day, kept for good so the
--      history survives any change of platform, token or account.
--   2. What our own site saw those visitors do: visits, leads, bookings, sales
--      and revenue, from the tables that already carry utm_* on every row.
--      Meta only ever sees the visitors who accepted the cookie banner; we see
--      all of them, so cost per lead and cost per sale come from here.
--
-- Service role only, like every table here: RLS on, no policies.

create table if not exists public.ad_insights_daily (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'meta' check (platform in ('meta', 'google', 'tiktok', 'linkedin')),
  account_id text not null,
  day date not null,
  campaign_id text not null,
  campaign_name text,
  adset_id text not null,
  adset_name text,
  ad_id text not null,
  ad_name text,
  objective text,
  currency text not null default 'CAD',
  spend numeric(12, 2) not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  clicks integer not null default 0,
  link_clicks integer not null default 0,
  landing_page_views integer not null default 0,
  -- The platform's own count of results, by the kind of result. Kept apart
  -- from our first-party numbers on purpose: they are measured differently.
  conversations integer not null default 0,
  leads integer not null default 0,
  schedules integer not null default 0,
  purchases integer not null default 0,
  purchase_value numeric(12, 2) not null default 0,
  actions jsonb,
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (platform, account_id, ad_id, day)
);

create index if not exists ad_insights_daily_day_idx on public.ad_insights_daily (platform, day desc);
create index if not exists ad_insights_daily_campaign_idx on public.ad_insights_daily (platform, campaign_id, day desc);

alter table public.ad_insights_daily enable row level security;
revoke all on public.ad_insights_daily from anon, authenticated;
comment on table public.ad_insights_daily is 'One row per ad per day as the ad platform reported it. Written by the Meta Insights sync; never by hand.';

-- Every pull, so the admin can show "last synced" and a failure is visible.
create table if not exists public.ad_sync_runs (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'meta',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  from_day date,
  to_day date,
  rows_upserted integer not null default 0,
  error text
);

alter table public.ad_sync_runs enable row level security;
revoke all on public.ad_sync_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- First-party outcomes for paid Meta traffic.
--
-- "Paid Meta" is a click that carried utm_source meta/facebook/instagram (or
-- fb/ig, Meta's own short names) AND a paid utm_medium. An organic post on the
-- same platforms has no paid medium, so it stays out. Each outcome is counted
-- in the table where it is recorded, by its own utm tags, so a lead that came
-- from an ad is counted even when the visit itself predates the range.
--
-- Returns: totals, one row per local day (gap filled, so the chart has no
-- holes), and one row per campaign.
-- ---------------------------------------------------------------------------
create or replace function public.ads_outcomes(p_from timestamptz, p_to timestamptz, p_tz text default 'America/Toronto')
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  days as (
    select d::date as day
    from generate_series(
      date_trunc('day', p_from at time zone p_tz),
      date_trunc('day', (p_to - interval '1 second') at time zone p_tz),
      interval '1 day'
    ) d
  ),
  visits as (
    select (e.created_at at time zone p_tz)::date as day, nullif(btrim(e.utm_campaign), '') as campaign, e.session_id
    from public.events e
    where e.type = 'pageview' and e.country is not null
      and e.created_at >= p_from and e.created_at < p_to
      and lower(btrim(coalesce(e.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(e.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
  ),
  leads as (
    select (l.created_at at time zone p_tz)::date as day, nullif(btrim(l.utm_campaign), '') as campaign,
           (l.booking_uid is not null) as booked
    from public.leads l
    where l.created_at >= p_from and l.created_at < p_to
      and lower(btrim(coalesce(l.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(l.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
  ),
  subs as (
    select (s.created_at at time zone p_tz)::date as day, nullif(btrim(s.utm_campaign), '') as campaign
    from public.subscribers s
    where s.created_at >= p_from and s.created_at < p_to
      and lower(btrim(coalesce(s.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(s.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
  ),
  sales as (
    -- One-time products, paid. Test-mode orders never count.
    select (coalesce(o.paid_at, o.created_at) at time zone p_tz)::date as day, nullif(btrim(o.utm_campaign), '') as campaign,
           (o.amount_total - coalesce(o.amount_refunded, 0))::numeric / 100 as revenue
    from public.orders o
    where o.status in ('paid', 'partially_refunded') and coalesce(o.livemode, true)
      and coalesce(o.paid_at, o.created_at) >= p_from and coalesce(o.paid_at, o.created_at) < p_to
      and lower(btrim(coalesce(o.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(o.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
    union all
    -- Growth plans: the setup fee paid at checkout. Care plans hang off an
    -- order that is already counted above.
    select (s.created_at at time zone p_tz)::date, nullif(btrim(s.utm_campaign), ''),
           coalesce(s.amount_total, 0)::numeric / 100
    from public.subscriptions s
    where coalesce(s.kind, 'plan') = 'plan' and s.status not in ('incomplete', 'incomplete_expired') and coalesce(s.livemode, true)
      and s.created_at >= p_from and s.created_at < p_to
      and lower(btrim(coalesce(s.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(s.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
  ),
  by_day as (
    select d.day,
      (select count(*) from visits v where v.day = d.day) as pageviews,
      (select count(distinct v.session_id) from visits v where v.day = d.day) as visits,
      (select count(*) from leads l where l.day = d.day) as leads,
      (select count(*) from leads l where l.day = d.day and l.booked) as bookings,
      (select count(*) from subs s where s.day = d.day) as subscribers,
      (select count(*) from sales s where s.day = d.day) as sales,
      (select coalesce(sum(s.revenue), 0) from sales s where s.day = d.day) as revenue
    from days d
  ),
  campaigns as (
    select c.campaign,
      (select count(distinct v.session_id) from visits v where v.campaign is not distinct from c.campaign) as visits,
      (select count(*) from leads l where l.campaign is not distinct from c.campaign) as leads,
      (select count(*) from leads l where l.campaign is not distinct from c.campaign and l.booked) as bookings,
      (select count(*) from subs s where s.campaign is not distinct from c.campaign) as subscribers,
      (select count(*) from sales s where s.campaign is not distinct from c.campaign) as sales,
      (select coalesce(sum(s.revenue), 0) from sales s where s.campaign is not distinct from c.campaign) as revenue
    from (
      select campaign from visits union select campaign from leads union select campaign from subs union select campaign from sales
    ) c
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object(
      'pageviews', coalesce(sum(pageviews), 0), 'visits', coalesce(sum(visits), 0), 'leads', coalesce(sum(leads), 0),
      'bookings', coalesce(sum(bookings), 0), 'subscribers', coalesce(sum(subscribers), 0),
      'sales', coalesce(sum(sales), 0), 'revenue', coalesce(sum(revenue), 0)) from by_day),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
      'day', to_char(day, 'YYYY-MM-DD'), 'pageviews', pageviews, 'visits', visits, 'leads', leads, 'bookings', bookings,
      'subscribers', subscribers, 'sales', sales, 'revenue', revenue) order by day), '[]'::jsonb) from by_day),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object(
      'campaign', campaign, 'visits', visits, 'leads', leads, 'bookings', bookings, 'subscribers', subscribers,
      'sales', sales, 'revenue', revenue) order by revenue desc, visits desc), '[]'::jsonb) from campaigns)
  );
$$;

revoke all on function public.ads_outcomes(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.ads_outcomes(timestamptz, timestamptz, text) to service_role;
