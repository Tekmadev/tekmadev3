-- Traffic analytics, counted in the database.
--
-- The admin used to pull the last 30 days of pageview rows into Node and count
-- them there, behind a 5000-row limit that PostgREST quietly caps at 1000. Fine
-- at 400 views a month, wrong the moment a longer range is asked for: a year of
-- traffic would be counted from its newest 1000 rows. This function does the
-- counting where the rows live and returns one small JSON document, so every
-- range (24 hours to all time) is exact and costs one round trip.
--
-- Two rules are baked in so every screen that calls this agrees:
--
--  1. Buckets are cut in the business's own timezone, not UTC. "Today" on the
--     chart is today in Hamilton, and the 24 hour view is labelled in local hours.
--  2. Rows with no country are not visitors. The country comes from Vercel's
--     edge header, which every production request carries and localhost never
--     does, so a null country means the pageview was recorded from a developer's
--     machine. (Checked 2026-09-19: every such row with a referrer had a
--     localhost referrer.) Since that date /api/track only records in production
--     and stores 'unknown' when Vercel cannot place a visitor, so this filter
--     removes old development noise and nothing else.
--
-- p_count is how many buckets to show, counting the current one: 24 hours, 30
-- days, 13 weeks, 12 months. Null means all time, from the first real pageview.
-- The window starts on a bucket boundary, so the first point is never a sliver.

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
      coalesce(nullif(btrim(e.utm_source), ''), '(direct)') as source,
      coalesce(nullif(e.path, ''), '(unknown)') as page,
      case
        when e.referrer is null or btrim(e.referrer) = '' then '(direct)'
        else coalesce(
          nullif(lower(substring(e.referrer from '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:www\.)?([^/:?#]+)')), ''),
          left(e.referrer, 80)
        )
      end as referrer_host,
      coalesce(nullif(e.device, ''), 'unknown') as device,
      e.country
    from public.events e, w
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
