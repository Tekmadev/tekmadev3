-- Ads for the admin app (GET /api/admin/v1/ads).
--
-- Two gaps the app's Ads screen needs filled, next to what ads_platform_summary()
-- and ads_outcomes() already return:
--
--   1. A campaign's status (active, paused, archived). The Insights edge reports
--      delivery, never status, so the Meta sync (lib/meta-ads.ts) now also reads
--      the account's campaigns and keeps their status here. Best effort: a sync
--      that cannot read statuses still saves its insights, and the API falls back
--      to "delivered in the last two days" for a campaign with no row here.
--
--   2. Every ad that spent in a window with its campaign id (ads_platform_summary
--      keeps the top 25 and only the campaign name), and the site's own outcomes
--      per ad. The site records the ad through utm_content (Meta's dynamic
--      {{ad.name}} or {{ad.id}}), so outcomes are grouped by utm_campaign and
--      utm_content. "Paid Meta" is the same rule as ads_outcomes(): utm_source
--      meta, facebook, instagram, fb or ig with a paid utm_medium; test-mode
--      sales never count.
--
-- Service role only, like every table here: RLS on, no policies.

create table if not exists public.ad_campaigns (
  platform text not null default 'meta' check (platform in ('meta', 'google', 'tiktok', 'linkedin')),
  account_id text not null,
  campaign_id text not null,
  name text,
  -- What the owner set: ACTIVE, PAUSED, DELETED, ARCHIVED.
  status text,
  -- What Meta says is happening: ACTIVE, PAUSED, DELETED, ARCHIVED, IN_PROCESS, WITH_ISSUES.
  effective_status text,
  synced_at timestamptz not null default now(),
  primary key (platform, account_id, campaign_id)
);

alter table public.ad_campaigns enable row level security;
revoke all on public.ad_campaigns from anon, authenticated;

comment on table public.ad_campaigns is
  'One row per ad platform campaign with its current status, written by the Meta sync. Insights rows carry delivery only; this carries status.';

-- Both tables predate the migrations folder. The Stripe webhook and /api/track
-- already write utm_content, so these are no-ops on the live database; they
-- only make a rebuilt database match.
alter table public.events add column if not exists utm_content text;
alter table public.subscriptions add column if not exists utm_content text;

create or replace function public.ads_breakdown(
  p_from_day date,
  p_to_day date,
  p_from timestamptz,
  p_to timestamptz,
  p_platform text default 'meta'
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  rows as (
    select * from public.ad_insights_daily
    where platform = p_platform and day >= p_from_day and day <= p_to_day
  ),
  ads as (
    select ad_id,
           (array_agg(campaign_id order by day desc))[1] as campaign_id,
           (array_agg(ad_name order by day desc))[1] as ad_name,
           sum(spend) as spend, sum(impressions) as impressions, sum(link_clicks) as link_clicks
    from rows
    group by ad_id
    having sum(spend) > 0
  ),
  visits as (
    select nullif(btrim(e.utm_campaign), '') as campaign, nullif(btrim(e.utm_content), '') as content, e.session_id
    from public.events e
    where e.type = 'pageview' and e.country is not null
      and e.created_at >= p_from and e.created_at < p_to
      and lower(btrim(coalesce(e.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(e.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
  ),
  leads as (
    select nullif(btrim(l.utm_campaign), '') as campaign, nullif(btrim(l.utm_content), '') as content,
           (l.booking_uid is not null) as booked
    from public.leads l
    where l.created_at >= p_from and l.created_at < p_to
      and lower(btrim(coalesce(l.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(l.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
  ),
  sales as (
    select nullif(btrim(o.utm_campaign), '') as campaign, nullif(btrim(o.utm_content), '') as content,
           (o.amount_total - coalesce(o.amount_refunded, 0))::numeric / 100 as revenue
    from public.orders o
    where o.status in ('paid', 'partially_refunded') and coalesce(o.livemode, true)
      and coalesce(o.paid_at, o.created_at) >= p_from and coalesce(o.paid_at, o.created_at) < p_to
      and lower(btrim(coalesce(o.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(o.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
    union all
    select nullif(btrim(s.utm_campaign), ''), nullif(btrim(s.utm_content), ''),
           coalesce(s.amount_total, 0)::numeric / 100
    from public.subscriptions s
    where coalesce(s.kind, 'plan') = 'plan' and s.status not in ('incomplete', 'incomplete_expired') and coalesce(s.livemode, true)
      and s.created_at >= p_from and s.created_at < p_to
      and lower(btrim(coalesce(s.utm_source, ''))) in ('meta', 'facebook', 'instagram', 'fb', 'ig')
      and lower(btrim(coalesce(s.utm_medium, ''))) in ('paid', 'cpc', 'ppc', 'paid_social', 'paidsocial', 'ads', 'ad', 'social_paid')
  ),
  v as (select campaign, content, count(distinct session_id) as visits from visits group by 1, 2),
  l as (select campaign, content, count(*) as leads, count(*) filter (where booked) as bookings from leads group by 1, 2),
  s as (select campaign, content, count(*) as sales, coalesce(sum(revenue), 0) as revenue from sales group by 1, 2),
  keys as (
    select campaign, content from v
    union select campaign, content from l
    union select campaign, content from s
  ),
  site_ads as (
    select k.campaign, k.content,
           coalesce(v.visits, 0) as visits, coalesce(l.leads, 0) as leads, coalesce(l.bookings, 0) as bookings,
           coalesce(s.sales, 0) as sales, coalesce(s.revenue, 0) as revenue
    from keys k
    left join v on v.campaign is not distinct from k.campaign and v.content is not distinct from k.content
    left join l on l.campaign is not distinct from k.campaign and l.content is not distinct from k.content
    left join s on s.campaign is not distinct from k.campaign and s.content is not distinct from k.content
    where k.content is not null
  )
  select jsonb_build_object(
    'ads', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ad_id', a.ad_id, 'campaign_id', a.campaign_id, 'ad_name', a.ad_name,
        'spend', a.spend, 'impressions', a.impressions, 'link_clicks', a.link_clicks
      ) order by a.spend desc, a.ad_id), '[]'::jsonb)
      from ads a
    ),
    'site_ads', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'campaign', x.campaign, 'content', x.content, 'visits', x.visits, 'leads', x.leads,
        'bookings', x.bookings, 'sales', x.sales, 'revenue', x.revenue
      ) order by x.visits desc, x.content), '[]'::jsonb)
      from site_ads x
    )
  );
$$;

comment on function public.ads_breakdown(date, date, timestamptz, timestamptz, text) is
  'Every ad that spent between two report days (with its campaign id), and the site''s paid-Meta outcomes per utm_campaign and utm_content in an instant window. Used by the admin app''s Ads screen.';

revoke all on function public.ads_breakdown(date, date, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.ads_breakdown(date, date, timestamptz, timestamptz, text) to service_role;
