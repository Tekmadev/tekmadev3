-- Traffic sources that say where a visit really came from.
--
-- "Source" used to be the utm_source tag or nothing, so 96% of traffic read as
-- "(direct)": a visit from a Google search or an Instagram bio link without a
-- tag was lumped in with someone typing the address. Now a missing tag falls
-- back to the referring site, the big ones are folded into one name each
-- (google.com, google.ca and www.google.com are all "google"), and our own
-- pages and the return trip from Stripe checkout no longer pose as sources.
-- A tagged link still wins, because a tag is a deliberate statement of origin.
-- The Referrers list is unchanged: it stays the raw, unfolded view.

create or replace function public.traffic_analytics(
  p_bucket text default 'day',
  p_count integer default 30,
  p_tz text default 'America/Toronto',
  p_limit integer default 10
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      b.bucket,
      ('1 ' || b.bucket)::interval as step,
      now() as to_ts,
      (now() at time zone p_tz) as now_local
    from (
      select case when p_bucket in ('hour', 'day', 'week', 'month') then p_bucket else 'day' end as bucket
    ) b
  ),
  win as (
    select
      p.*,
      case
        when p_count is null then date_trunc(
          p.bucket,
          coalesce(
            (select min(e.created_at) from public.events e where e.type = 'pageview' and e.country is not null),
            p.to_ts
          ) at time zone p_tz
        )
        else date_trunc(p.bucket, p.now_local) - (greatest(p_count, 1) - 1) * p.step
      end as from_local
    from params p
  ),
  w as (
    select win.*, (win.from_local at time zone p_tz) as from_ts from win
  ),
  ev as (
    select
      e.created_at,
      e.session_id,
      case
        when nullif(btrim(e.utm_source), '') is not null then lower(btrim(e.utm_source))
        when r.host is null then '(direct)'
        -- Our own pages, and the trip back from checkout, are not where a visitor came from.
        when r.host in ('tekmadev.com', 'account.tekmadev.com', 'localhost', 'checkout.stripe.com') then '(direct)'
        when r.host ~ '(^|\.)gemini\.google\.com$' then 'gemini'
        when r.host ~ '(^|\.)google\.[a-z.]+$' then 'google'
        when r.host ~ '(^|\.)bing\.com$' then 'bing'
        when r.host ~ '(^|\.)duckduckgo\.com$' then 'duckduckgo'
        when r.host ~ '(^|\.)(chatgpt\.com|openai\.com)$' then 'chatgpt.com'
        when r.host ~ '(^|\.)perplexity\.ai$' then 'perplexity'
        when r.host ~ '(^|\.)(facebook\.com|fb\.com)$' then 'facebook'
        when r.host ~ '(^|\.)instagram\.com$' then 'instagram'
        when r.host ~ '(^|\.)linkedin\.com$' or r.host = 'lnkd.in' then 'linkedin'
        when r.host ~ '(^|\.)(twitter\.com|x\.com)$' or r.host = 't.co' then 'x'
        when r.host ~ '(^|\.)youtube\.com$' or r.host = 'youtu.be' then 'youtube'
        when r.host ~ '(^|\.)reddit\.com$' then 'reddit'
        else r.host
      end as source,
      coalesce(nullif(e.path, ''), '(unknown)') as page,
      case
        when e.referrer is null or btrim(e.referrer) = '' then '(direct)'
        else coalesce(r.host, left(e.referrer, 80))
      end as referrer_host,
      coalesce(nullif(e.device, ''), 'unknown') as device,
      e.country
    from public.events e
    cross join w
    cross join lateral (
      select nullif(lower(substring(e.referrer from '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:www\.)?([^/:?#]+)')), '') as host
    ) r
    where e.type = 'pageview'
      and e.country is not null
      and e.created_at >= w.from_ts
      and e.created_at < w.to_ts
  ),
  -- The window of the same length just before this one, for "up or down".
  prev as (
    select count(*) as total,
           count(distinct e.session_id) + count(*) filter (where e.session_id is null) as visits
    from public.events e, w
    where p_count is not null
      and e.type = 'pageview'
      and e.country is not null
      and e.created_at >= w.from_ts - (w.to_ts - w.from_ts)
      and e.created_at < w.from_ts
  ),
  counted as (
    select date_trunc(w.bucket, ev.created_at at time zone p_tz) as b, count(*) as n
    from ev, w
    group by 1
  ),
  series as (
    select g.b, coalesce(c.n, 0) as n
    from w
    cross join lateral generate_series(w.from_local, date_trunc(w.bucket, w.now_local), w.step) as g(b)
    left join counted c on c.b = g.b
  )
  select jsonb_build_object(
    'bucket', (select bucket from w),
    'from', (select from_ts from w),
    'to', (select to_ts from w),
    'total', (select count(*) from ev),
    'visits', (select count(distinct session_id) + count(*) filter (where session_id is null) from ev),
    'prev_total', (select case when p_count is null then null else total end from prev),
    'prev_visits', (select case when p_count is null then null else visits end from prev),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('t', to_char(s.b, 'YYYY-MM-DD"T"HH24:MI:SS'), 'n', s.n) order by s.b), '[]'::jsonb)
      from series s
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
      from (select source as label, count(*) as n from ev group by 1 order by 2 desc, 1 limit greatest(p_limit, 1)) x
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
      from (select page as label, count(*) as n from ev group by 1 order by 2 desc, 1 limit greatest(p_limit, 1)) x
    ),
    'referrers', (
      select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
      from (select referrer_host as label, count(*) as n from ev group by 1 order by 2 desc, 1 limit greatest(p_limit, 1)) x
    ),
    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
      from (select device as label, count(*) as n from ev group by 1 order by 2 desc, 1 limit greatest(p_limit, 1)) x
    ),
    'countries', (
      select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
      from (select country as label, count(*) as n from ev group by 1 order by 2 desc, 1 limit greatest(p_limit, 1)) x
    )
  );
$$;

comment on function public.traffic_analytics(text, integer, text, integer) is
  'All traffic numbers for the admin in one call: totals, the previous window, a gap-filled series and the top lists. Buckets are cut in p_tz. Rows without a country (development traffic) are excluded.';

-- Server only. The admin calls it with the service role; nobody else needs it.
revoke execute on function public.traffic_analytics(text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.traffic_analytics(text, integer, text, integer) to service_role;
