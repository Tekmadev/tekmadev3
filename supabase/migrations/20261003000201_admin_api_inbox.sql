-- Admin API v1: the Inbox and push delivery for the Android admin app
-- (app/api/admin/v1/notifications, lib/admin-api/notifications, lib/admin-api/push).
--
-- What this adds, and why:
--
--  1. Mark as unread. The web inbox only ever marks rows read: a per-user
--     watermark (admin_notification_state.read_all_before) plus per-row reads.
--     A row under the watermark cannot be made unread without an exception,
--     so admin_notification_unreads holds one. There is still one definition
--     of read, used by the web admin and the app alike:
--
--       read = no unread mark AND (last_occurred_at <= watermark OR a read row)
--
--  2. Roles narrower than manager. Staff may read some categories only
--     (lib/admin-api/permissions.ts), so the API functions take the categories
--     the caller may read. Audience and test rules are unchanged: owner-audience
--     rows are for owners, test rows are for owners who ask for them.
--
--  3. The summary can count test rows when an owner asks for them (?test=1),
--     so the header matches the rows on screen.
--
--  4. Resolving keeps the first resolver: a second "Mark as handled" on a row
--     that is already resolved changes nothing.
--
--  5. admin_push_tickets keeps the Expo push ticket ids until their receipts
--     are read (receipts expire after 24 hours), so a phone that uninstalled
--     the app (DeviceNotRegistered) is removed from admin_devices.
--
--  6. admin_api_top_links counts Home's "Top tracking links (30d)" in Postgres.
--
-- The web functions keep their signatures and their answers. List, summary,
-- mark read and mark all read now honour unread marks, and there are none
-- until the app writes one, so the web admin behaves exactly as before.
--
-- Depends on 20260919000003, 20260919000004 (the inbox) and 20261003000003
-- (admin_devices).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.admin_notification_unreads (
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists admin_notification_unreads_user_idx
  on public.admin_notification_unreads (user_id);

comment on table public.admin_notification_unreads is
  'Rows a staff member marked unread on purpose. Wins over the read-all watermark and over a read row until they read it again.';

alter table public.admin_notification_unreads enable row level security;
revoke all on public.admin_notification_unreads from anon, authenticated;

create table if not exists public.admin_push_tickets (
  -- The Expo push ticket id.
  id text primary key,
  device_id uuid not null references public.admin_devices(id) on delete cascade,
  -- admin_notifications.id as text, or 'test' for POST /notifications/test-push.
  notification_id text not null,
  -- 2 for the one resend with a shorter body after MessageTooBig.
  attempt smallint not null default 1 check (attempt in (1, 2)),
  created_at timestamptz not null default now()
);
create index if not exists admin_push_tickets_created_idx
  on public.admin_push_tickets (created_at);

comment on table public.admin_push_tickets is
  'Expo push tickets waiting for their receipt (checked about 15 minutes after sending, gone after 24 hours). Server only.';

alter table public.admin_push_tickets enable row level security;
revoke all on public.admin_push_tickets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- The inbox for one viewer. p_categories null means every category the
-- audience rule allows (the web admin); the API passes the caller's
-- categories. p_ids narrows to given rows (a detail, or the rows a mutation
-- changed). An owner's test rows need p_include_test.
create or replace function public.admin_api_notification_list(
  p_user uuid,
  p_is_owner boolean,
  p_categories text[] default null,
  p_filter text default 'all',          -- all | unread | action
  p_category text default null,
  p_include_test boolean default false,
  p_before timestamptz default null,     -- keyset cursor, with p_before_id
  p_before_id uuid default null,
  p_limit integer default 30,
  p_ids uuid[] default null
)
returns table (
  id uuid,
  created_at timestamptz,
  last_occurred_at timestamptz,
  occurrences integer,
  event_key text,
  category text,
  severity text,
  title text,
  body text,
  action_url text,
  entity_type text,
  entity_id text,
  client_id uuid,
  actor_type text,
  actor_label text,
  needs_action boolean,
  resolved_at timestamptz,
  resolved_by text,
  is_test boolean,
  data jsonb,
  is_read boolean,
  is_muted boolean
)
language sql
stable
set search_path = ''
as $$
  select
    v.id, v.created_at, v.last_occurred_at, v.occurrences, v.event_key, v.category, v.severity,
    v.title, v.body, v.action_url, v.entity_type, v.entity_id, v.client_id, v.actor_type, v.actor_label,
    v.needs_action, v.resolved_at, v.resolved_by, v.is_test, v.data, v.is_read, v.is_muted
  from (
    select
      n.id, n.created_at, n.last_occurred_at, n.occurrences, n.event_key, n.category, n.severity,
      n.title, n.body, n.action_url, n.entity_type, n.entity_id, n.client_id, n.actor_type, n.actor_label,
      n.needs_action, n.resolved_at, n.resolved_by, n.is_test, n.data,
      (u.notification_id is null and (n.last_occurred_at <= st.watermark or r.notification_id is not null)) as is_read,
      coalesce(p.muted, false) as is_muted
    from public.admin_notifications n
    cross join (
      select coalesce(
        (select s.read_all_before from public.admin_notification_state s where s.user_id = p_user),
        '-infinity'::timestamptz
      ) as watermark
    ) st
    left join public.admin_notification_reads r
      on r.notification_id = n.id and r.user_id = p_user
    left join public.admin_notification_unreads u
      on u.notification_id = n.id and u.user_id = p_user
    left join public.admin_notification_prefs p
      on p.user_id = p_user and p.category = n.category
    where (p_is_owner or n.audience = 'staff')
      and (p_categories is null or n.category = any(p_categories))
      -- Test rows are an owner tool. Nobody else sees them, whatever they ask for.
      and ((p_include_test and p_is_owner) or not n.is_test)
      and (p_ids is null or n.id = any(p_ids))
      and (p_category is null or n.category = p_category)
      and (
        p_before is null
        or (n.last_occurred_at, n.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
  ) v
  where p_filter = 'all'
    -- Unread matches the count: quiet categories are left out.
    or (p_filter = 'unread' and not v.is_read and not v.is_muted)
    or (p_filter = 'action' and v.needs_action and v.resolved_at is null)
  order by v.last_occurred_at desc, v.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 501);
$$;

-- The badge counts for one viewer. Unread and critical unread leave out quiet
-- categories; needs action counts open rows whether quiet or not. Unread is
-- split in two disjoint parts so each can use its own index: rows above the
-- watermark that were never read or marked, and rows marked unread on purpose.
create or replace function public.admin_api_notification_summary(
  p_user uuid,
  p_is_owner boolean,
  p_categories text[] default null,
  p_include_test boolean default false
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'unread', (
      select count(*)
      from public.admin_notifications n
      where (p_is_owner or n.audience = 'staff')
        and (p_categories is null or n.category = any(p_categories))
        and ((p_include_test and p_is_owner) or not n.is_test)
        and n.last_occurred_at > coalesce(
          (select s.read_all_before from public.admin_notification_state s where s.user_id = p_user),
          '-infinity'::timestamptz)
        and not exists (
          select 1 from public.admin_notification_reads r
          where r.notification_id = n.id and r.user_id = p_user)
        and not exists (
          select 1 from public.admin_notification_unreads u
          where u.notification_id = n.id and u.user_id = p_user)
        and not exists (
          select 1 from public.admin_notification_prefs p
          where p.user_id = p_user and p.category = n.category and p.muted)
    ) + (
      select count(*)
      from public.admin_notification_unreads u
      join public.admin_notifications n on n.id = u.notification_id
      where u.user_id = p_user
        and (p_is_owner or n.audience = 'staff')
        and (p_categories is null or n.category = any(p_categories))
        and ((p_include_test and p_is_owner) or not n.is_test)
        and not exists (
          select 1 from public.admin_notification_prefs p
          where p.user_id = p_user and p.category = n.category and p.muted)
    ),
    'needs_action', (
      select count(*)
      from public.admin_notifications n
      where (p_is_owner or n.audience = 'staff')
        and (p_categories is null or n.category = any(p_categories))
        and ((p_include_test and p_is_owner) or not n.is_test)
        and n.needs_action and n.resolved_at is null
    ),
    -- Same rule as unread, narrowed to critical, so it can never exceed it.
    'critical_unread', (
      select count(*)
      from public.admin_notifications n
      where (p_is_owner or n.audience = 'staff')
        and (p_categories is null or n.category = any(p_categories))
        and ((p_include_test and p_is_owner) or not n.is_test)
        and n.severity = 'critical'
        and n.last_occurred_at > coalesce(
          (select s.read_all_before from public.admin_notification_state s where s.user_id = p_user),
          '-infinity'::timestamptz)
        and not exists (
          select 1 from public.admin_notification_reads r
          where r.notification_id = n.id and r.user_id = p_user)
        and not exists (
          select 1 from public.admin_notification_unreads u
          where u.notification_id = n.id and u.user_id = p_user)
        and not exists (
          select 1 from public.admin_notification_prefs p
          where p.user_id = p_user and p.category = n.category and p.muted)
    ) + (
      select count(*)
      from public.admin_notification_unreads u
      join public.admin_notifications n on n.id = u.notification_id
      where u.user_id = p_user
        and (p_is_owner or n.audience = 'staff')
        and (p_categories is null or n.category = any(p_categories))
        and ((p_include_test and p_is_owner) or not n.is_test)
        and n.severity = 'critical'
        and not exists (
          select 1 from public.admin_notification_prefs p
          where p.user_id = p_user and p.category = n.category and p.muted)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

-- Mark rows read for this viewer, only rows they may see (an owner's test
-- rows included). Unknown or hidden ids are skipped, not fatal.
create or replace function public.admin_api_notification_mark_read(
  p_user uuid,
  p_is_owner boolean,
  p_categories text[],
  p_ids uuid[]
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with visible as (
    select n.id
    from public.admin_notifications n
    where n.id = any(p_ids)
      and (p_is_owner or n.audience = 'staff')
      and (p_categories is null or n.category = any(p_categories))
      and (p_is_owner or not n.is_test)
  ),
  cleared as (
    delete from public.admin_notification_unreads u
    using visible v
    where u.notification_id = v.id and u.user_id = p_user
  )
  insert into public.admin_notification_reads (notification_id, user_id)
  select v.id, p_user from visible v
  on conflict (notification_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Mark rows unread for this viewer, only rows they may see.
create or replace function public.admin_api_notification_mark_unread(
  p_user uuid,
  p_is_owner boolean,
  p_categories text[],
  p_ids uuid[]
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with visible as (
    select n.id
    from public.admin_notifications n
    where n.id = any(p_ids)
      and (p_is_owner or n.audience = 'staff')
      and (p_categories is null or n.category = any(p_categories))
      and (p_is_owner or not n.is_test)
  ),
  forgotten as (
    delete from public.admin_notification_reads r
    using visible v
    where r.notification_id = v.id and r.user_id = p_user
  )
  insert into public.admin_notification_unreads (notification_id, user_id)
  select v.id, p_user from visible v
  on conflict (notification_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Mark all read up to what the viewer was shown (p_seen, capped by the
-- database clock). Returns how many rows the viewer can see became read
-- (an owner's test rows included). The watermark never moves backwards, and
-- unread marks up to the mark are cleared.
create or replace function public.admin_api_notification_read_all(
  p_user uuid,
  p_is_owner boolean,
  p_categories text[],
  p_seen timestamptz default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_mark timestamptz := least(coalesce(p_seen, now()), now());
  v_watermark timestamptz;
  v_count integer;
begin
  select coalesce(
    (select s.read_all_before from public.admin_notification_state s where s.user_id = p_user),
    '-infinity'::timestamptz
  ) into v_watermark;

  select count(*) into v_count
  from public.admin_notifications n
  where n.last_occurred_at <= v_mark
    and (p_is_owner or n.audience = 'staff')
    and (p_categories is null or n.category = any(p_categories))
    and (p_is_owner or not n.is_test)
    and (
      exists (
        select 1 from public.admin_notification_unreads u
        where u.notification_id = n.id and u.user_id = p_user)
      or (
        n.last_occurred_at > v_watermark
        and not exists (
          select 1 from public.admin_notification_reads r
          where r.notification_id = n.id and r.user_id = p_user)
      )
    );

  delete from public.admin_notification_unreads u
  using public.admin_notifications n
  where u.user_id = p_user
    and n.id = u.notification_id
    and n.last_occurred_at <= v_mark;

  insert into public.admin_notification_state (user_id, read_all_before, updated_at)
  values (p_user, v_mark, now())
  on conflict (user_id) do update
    set read_all_before = greatest(public.admin_notification_state.read_all_before, excluded.read_all_before),
        updated_at = now();

  return v_count;
end;
$$;

-- Close or reopen a needs-action row the viewer may see, and mark it read for
-- them. Answers 'missing' (unknown or hidden), 'not_actionable' or 'ok'.
-- Resolving a row that is already resolved keeps the first resolver.
create or replace function public.admin_api_notification_resolve(
  p_user uuid,
  p_is_owner boolean,
  p_categories text[],
  p_id uuid,
  p_resolved boolean,
  p_by text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_needs boolean;
begin
  select n.needs_action into v_needs
  from public.admin_notifications n
  where n.id = p_id
    and (p_is_owner or n.audience = 'staff')
    and (p_categories is null or n.category = any(p_categories))
    and (p_is_owner or not n.is_test)
  for update;
  if not found then
    return 'missing';
  end if;
  if not v_needs then
    return 'not_actionable';
  end if;

  if p_resolved then
    update public.admin_notifications n
    set resolved_at = now(), resolved_by = p_by
    where n.id = p_id and n.resolved_at is null;
  else
    update public.admin_notifications n
    set resolved_at = null, resolved_by = null
    where n.id = p_id;
  end if;

  -- Dealing with it counts as having read it.
  delete from public.admin_notification_unreads u
  where u.notification_id = p_id and u.user_id = p_user;
  insert into public.admin_notification_reads (notification_id, user_id)
  values (p_id, p_user)
  on conflict (notification_id, user_id) do nothing;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- The web admin's functions, same signatures, now honouring unread marks
-- ---------------------------------------------------------------------------

create or replace function public.admin_notification_list(
  p_user uuid,
  p_is_owner boolean,
  p_filter text default 'all',
  p_category text default null,
  p_include_test boolean default false,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  created_at timestamptz,
  last_occurred_at timestamptz,
  occurrences integer,
  event_key text,
  category text,
  severity text,
  title text,
  body text,
  action_url text,
  entity_type text,
  entity_id text,
  client_id uuid,
  actor_type text,
  actor_label text,
  needs_action boolean,
  resolved_at timestamptz,
  resolved_by text,
  is_test boolean,
  data jsonb,
  is_read boolean,
  is_muted boolean
)
language sql
stable
set search_path = ''
as $$
  select l.id, l.created_at, l.last_occurred_at, l.occurrences, l.event_key, l.category, l.severity,
    l.title, l.body, l.action_url, l.entity_type, l.entity_id, l.client_id, l.actor_type, l.actor_label,
    l.needs_action, l.resolved_at, l.resolved_by, l.is_test, l.data, l.is_read, l.is_muted
  from public.admin_api_notification_list(
    p_user, p_is_owner, null, p_filter, p_category, p_include_test, p_before, p_before_id,
    least(greatest(coalesce(p_limit, 30), 1), 100), null
  ) l;
$$;

create or replace function public.admin_notification_summary(
  p_user uuid,
  p_is_owner boolean
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.admin_api_notification_summary(p_user, p_is_owner, null, false);
$$;

create or replace function public.admin_notification_mark_read(
  p_user uuid,
  p_is_owner boolean,
  p_ids uuid[]
)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  return public.admin_api_notification_mark_read(p_user, p_is_owner, null, p_ids);
end;
$$;

create or replace function public.admin_notification_mark_all_read(
  p_user uuid,
  p_seen timestamptz default null
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_mark timestamptz := least(coalesce(p_seen, now()), now());
begin
  delete from public.admin_notification_unreads u
  using public.admin_notifications n
  where u.user_id = p_user
    and n.id = u.notification_id
    and n.last_occurred_at <= v_mark;

  insert into public.admin_notification_state (user_id, read_all_before, updated_at)
  values (p_user, v_mark, now())
  on conflict (user_id) do update
    set read_all_before = greatest(public.admin_notification_state.read_all_before, excluded.read_all_before),
        updated_at = now();
  return v_mark;
end;
$$;

-- ---------------------------------------------------------------------------
-- Home (GET /overview): top tracking links
-- ---------------------------------------------------------------------------

-- Visits per short link since p_since (the start of the 30 Toronto days the
-- traffic block covers), busiest first. Counted in Postgres: PostgREST caps an
-- answer at 1000 rows, so counting click rows in Node would undercount a busy
-- month. Deleted links are left out (nothing to open), and so are links with
-- no visit in the window.
create or replace function public.admin_api_top_links(
  p_since timestamptz,
  p_limit integer default 10
)
returns table (
  id text,
  slug text,
  label text,
  visits integer
)
language sql
stable
set search_path = ''
as $$
  select l.id::text, l.slug, l.label, count(*)::integer
  from public.link_clicks c
  join public.links l on l.id = c.link_id
  where c.created_at >= p_since
  group by l.id, l.slug, l.label
  order by count(*) desc, l.slug asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- Server only, like every other function here
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_api_notification_list(uuid, boolean, text[], text, text, boolean, timestamptz, uuid, integer, uuid[])',
    'public.admin_api_notification_summary(uuid, boolean, text[], boolean)',
    'public.admin_api_notification_mark_read(uuid, boolean, text[], uuid[])',
    'public.admin_api_notification_mark_unread(uuid, boolean, text[], uuid[])',
    'public.admin_api_notification_read_all(uuid, boolean, text[], timestamptz)',
    'public.admin_api_notification_resolve(uuid, boolean, text[], uuid, boolean, text)',
    'public.admin_notification_list(uuid, boolean, text, text, boolean, timestamptz, uuid, integer)',
    'public.admin_notification_summary(uuid, boolean)',
    'public.admin_notification_mark_read(uuid, boolean, uuid[])',
    'public.admin_notification_mark_all_read(uuid, timestamptz)',
    'public.admin_api_top_links(timestamptz, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
