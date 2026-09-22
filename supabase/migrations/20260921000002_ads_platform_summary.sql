-- What the ad platform reported, summed in the database: totals, per day, per
-- campaign and per ad, for one window. Summing here keeps the page fast and
-- clear of PostgREST's 1000-row cap as the history grows.
create or replace function public.ads_platform_summary(p_from date, p_to date, p_platform text default 'meta')
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rows as (
    select * from public.ad_insights_daily
    where platform = p_platform and day >= p_from and day <= p_to
  ),
  totals as (
    select
      coalesce(sum(spend), 0) as spend, coalesce(sum(impressions), 0) as impressions, coalesce(sum(reach), 0) as reach,
      coalesce(sum(clicks), 0) as clicks, coalesce(sum(link_clicks), 0) as link_clicks,
      coalesce(sum(landing_page_views), 0) as landing_page_views, coalesce(sum(conversations), 0) as conversations,
      coalesce(sum(leads), 0) as leads, coalesce(sum(schedules), 0) as schedules, coalesce(sum(purchases), 0) as purchases,
      coalesce(sum(purchase_value), 0) as purchase_value,
      (select currency from rows order by day desc limit 1) as currency,
      count(distinct ad_id) as ads, count(distinct campaign_id) as campaigns,
      min(day) as first_day, max(day) as last_day
    from rows
  ),
  days as (
    select day, sum(spend) as spend, sum(impressions) as impressions, sum(link_clicks) as link_clicks,
           sum(conversations) as conversations, sum(leads) as leads, sum(purchases) as purchases
    from rows group by day order by day
  ),
  campaigns as (
    select campaign_id,
           (array_agg(campaign_name order by day desc))[1] as campaign_name,
           (array_agg(objective order by day desc))[1] as objective,
           sum(spend) as spend, sum(impressions) as impressions, sum(link_clicks) as link_clicks,
           sum(landing_page_views) as landing_page_views, sum(conversations) as conversations,
           sum(leads) as leads, sum(schedules) as schedules, sum(purchases) as purchases, sum(purchase_value) as purchase_value,
           min(day) as first_day, max(day) as last_day
    from rows group by campaign_id order by sum(spend) desc
  ),
  ads as (
    select ad_id,
           (array_agg(ad_name order by day desc))[1] as ad_name,
           (array_agg(adset_name order by day desc))[1] as adset_name,
           (array_agg(campaign_name order by day desc))[1] as campaign_name,
           sum(spend) as spend, sum(impressions) as impressions, sum(link_clicks) as link_clicks,
           sum(conversations) as conversations, sum(leads) as leads, sum(purchases) as purchases
    from rows group by ad_id order by sum(spend) desc limit 25
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'days', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from days d),
    'campaigns', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from campaigns c),
    'ads', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from ads a)
  );
$$;

revoke all on function public.ads_platform_summary(date, date, text) from public, anon, authenticated;
grant execute on function public.ads_platform_summary(date, date, text) to service_role;
