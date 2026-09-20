-- Admin notification center, hardened after an adversarial review on the day it
-- was built, before it reached production code. What changed and why:
--
--  1. Repeats count instead of vanishing. A burst key (one row per hour for
--     "checkout is failing") used to swallow the second failure, even when the
--     first had already been dealt with. A repeat now bumps `occurrences`,
--     moves the row back to the top, reopens it and makes it unread again.
--  2. One definition of "unread", shared by the list and the counts. Muted
--     categories used to be excluded from the badge but not from the Unread
--     tab, so the badge said 0 while the tab listed twelve bold rows.
--  3. Writes respect the viewer. A manager could resolve or mark read an
--     owner-only row if they learned its id. Reads and resolves now go through
--     functions that apply the same visibility rule as the list.
--  4. Paging cannot skip rows. The cursor is (last_occurred_at, id), not a bare
--     timestamp, so rows written in one statement with the same clock value are
--     never dropped at a page boundary.
--  5. Mark all read uses the database clock and what the viewer actually saw,
--     and never moves backwards.
--  6. The newsletter trigger writes owner-only rows (managers cannot open the
--     Email page, so they should not read subscriber addresses in the bell),
--     says so in the logs when it fails instead of failing silently, and no
--     longer depends on who the caller is.
--  7. action_url can only ever be a path inside the admin.

alter table public.admin_notifications
  add column if not exists occurrences integer not null default 1,
  add column if not exists last_occurred_at timestamptz not null default now();

update public.admin_notifications set last_occurred_at = created_at where last_occurred_at <> created_at and occurrences = 1;

comment on column public.admin_notifications.occurrences is
  'How many times this burst key fired. Above 1 means the same problem happened again inside its window.';
comment on column public.admin_notifications.last_occurred_at is
  'When it last happened. The inbox sorts and pages by this, so a repeat resurfaces.';

alter table public.admin_notifications drop constraint if exists admin_notifications_action_url_check;
alter table public.admin_notifications
  add constraint admin_notifications_action_url_check
  check (action_url is null or action_url ~ '^/admin([/?#]|$)');

drop index if exists public.admin_notification_reads_user_idx;
drop index if exists public.admin_notifications_created_idx;
create index if not exists admin_notifications_recent_idx
  on public.admin_notifications (last_occurred_at desc, id desc);

-- The old list signature is replaced, not overloaded.
drop function if exists public.admin_notification_list(uuid, boolean, text, text, boolean, timestamptz, integer);

create or replace function public.admin_notification_list(
  p_user uuid,
  p_is_owner boolean,
  p_filter text default 'all',          -- all | unread | action
  p_category text default null,
  p_include_test boolean default false,
  p_before timestamptz default null,     -- keyset cursor, with p_before_id
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
  with st as (
    select coalesce(
      (select s.read_all_before from public.admin_notification_state s where s.user_id = p_user),
      '-infinity'::timestamptz
    ) as watermark
  )
  select
    n.id, n.created_at, n.last_occurred_at, n.occurrences, n.event_key, n.category, n.severity,
    n.title, n.body, n.action_url, n.entity_type, n.entity_id, n.client_id, n.actor_type, n.actor_label,
    n.needs_action, n.resolved_at, n.resolved_by, n.is_test, n.data,
    (n.last_occurred_at <= st.watermark or r.notification_id is not null) as is_read,
    coalesce(p.muted, false) as is_muted
  from public.admin_notifications n
  cross join st
  left join public.admin_notification_reads r
    on r.notification_id = n.id and r.user_id = p_user
  left join public.admin_notification_prefs p
    on p.user_id = p_user and p.category = n.category
  where (p_is_owner or n.audience = 'staff')
    -- Test rows are an owner tool. A manager never sees them, whatever they ask for.
    and ((p_include_test and p_is_owner) or not n.is_test)
    and (p_category is null or n.category = p_category)
    and (
      p_before is null
      or (n.last_occurred_at, n.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
    and (
      p_filter = 'all'
      or (
        p_filter = 'unread'
        and n.last_occurred_at > st.watermark
        and r.notification_id is null
        and not coalesce(p.muted, false)
      )
      or (p_filter = 'action' and n.needs_action and n.resolved_at is null)
    )
  order by n.last_occurred_at desc, n.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
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
  -- No shared CTE: Postgres would materialize it, copying every row (payload
  -- included) on each poll. Written out, each count can use its own index.
  select jsonb_build_object(
    'unread', (
      select count(*)
      from public.admin_notifications n
      where (p_is_owner or n.audience = 'staff')
        and not n.is_test
        and n.last_occurred_at > coalesce(
          (select s.read_all_before from public.admin_notification_state s where s.user_id = p_user),
          '-infinity'::timestamptz)
        and not exists (
          select 1 from public.admin_notification_reads r
          where r.notification_id = n.id and r.user_id = p_user)
        and not exists (
          select 1 from public.admin_notification_prefs p
          where p.user_id = p_user and p.category = n.category and p.muted)
    ),
    'needs_action', (
      select count(*)
      from public.admin_notifications n
      where (p_is_owner or n.audience = 'staff')
        and not n.is_test
        and n.needs_action and n.resolved_at is null
    ),
    -- Same rule as unread, narrowed to critical, so it can never exceed it.
    'critical_unread', (
      select count(*)
      from public.admin_notifications n
      where (p_is_owner or n.audience = 'staff')
        and not n.is_test
        and n.severity = 'critical'
        and n.last_occurred_at > coalesce(
          (select s.read_all_before from public.admin_notification_state s where s.user_id = p_user),
          '-infinity'::timestamptz)
        and not exists (
          select 1 from public.admin_notification_reads r
          where r.notification_id = n.id and r.user_id = p_user)
        and not exists (
          select 1 from public.admin_notification_prefs p
          where p.user_id = p_user and p.category = n.category and p.muted)
    )
  );
$$;

-- Mark specific rows read, but only rows this viewer is allowed to see. Ids that
-- do not exist or are not visible are skipped instead of failing the batch.
create or replace function public.admin_notification_mark_read(
  p_user uuid,
  p_is_owner boolean,
  p_ids uuid[]
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.admin_notification_reads (notification_id, user_id)
  select n.id, p_user
  from public.admin_notifications n
  where n.id = any(p_ids)
    and (p_is_owner or n.audience = 'staff')
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Mark all read up to what the viewer has actually been shown. The database
-- clock decides, and the watermark never moves backwards.
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
  insert into public.admin_notification_state (user_id, read_all_before, updated_at)
  values (p_user, v_mark, now())
  on conflict (user_id) do update
    set read_all_before = greatest(public.admin_notification_state.read_all_before, excluded.read_all_before),
        updated_at = now();
  return v_mark;
end;
$$;

-- First sight of a new viewer: start them at "now", so a manager added next
-- year does not open the admin to a year of unread history.
create or replace function public.admin_notification_seed_viewer(p_user uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.admin_notification_state (user_id, read_all_before, updated_at)
  values (p_user, now(), now())
  on conflict (user_id) do nothing;
$$;

-- Close or reopen a "needs action" row, if this viewer may see it.
create or replace function public.admin_notification_resolve(
  p_id uuid,
  p_is_owner boolean,
  p_resolved boolean,
  p_by text
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.admin_notifications n
  set resolved_at = case when p_resolved then now() else null end,
      resolved_by = case when p_resolved then p_by else null end
  where n.id = p_id
    and n.needs_action
    and (p_is_owner or n.audience = 'staff');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The same burst happened again: count it, resurface it, reopen it, and make it
-- unread for everyone. Called only for burst keys, never for idempotency keys:
-- a retried delivery of one payment is the same event, not a repeat.
create or replace function public.admin_notification_bump(p_key text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.admin_notifications n
  set occurrences = n.occurrences + 1,
      last_occurred_at = now(),
      resolved_at = null,
      resolved_by = null
  where n.dedupe_key = p_key
  returning n.id into v_id;
  if v_id is not null then
    delete from public.admin_notification_reads r where r.notification_id = v_id;
  end if;
  return v_id;
end;
$$;

-- The problem went away by itself (the card was retried and worked, staff
-- verified the access): close the open rows about it, so Needs action only ever
-- lists things that still need someone.
create or replace function public.admin_notification_resolve_open(
  p_events text[],
  p_entity_id text default null,
  p_client uuid default null,
  p_by text default 'system'
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_entity_id is null and p_client is null then
    return 0;
  end if;
  update public.admin_notifications n
  set resolved_at = now(), resolved_by = p_by
  where n.event_key = any(p_events)
    and n.needs_action and n.resolved_at is null
    and (p_entity_id is null or n.entity_id = p_entity_id)
    and (p_client is null or n.client_id = p_client);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_notification_list(uuid, boolean, text, text, boolean, timestamptz, uuid, integer)',
    'public.admin_notification_summary(uuid, boolean)',
    'public.admin_notification_mark_read(uuid, boolean, uuid[])',
    'public.admin_notification_mark_all_read(uuid, timestamptz)',
    'public.admin_notification_seed_viewer(uuid)',
    'public.admin_notification_resolve(uuid, boolean, boolean, text)',
    'public.admin_notification_bump(text)',
    'public.admin_notification_resolve_open(text[], text, uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- Newsletter trigger: owner-only rows, a logged failure, and no dependence on
-- the caller's role.
create or replace function public.notify_admin_subscriber_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_title text;
  v_severity text := 'info';
  v_needs_action boolean := false;
begin
  select s.email into v_email from public.subscribers s where s.id = new.subscriber_id;
  if v_email is null then
    return new;
  end if;

  if new.type = 'subscribed' then
    v_title := 'New newsletter subscriber: ' || v_email;
    v_severity := 'success';
  elsif new.type = 'resubscribed' then
    v_title := v_email || ' came back to the newsletter';
    v_severity := 'success';
  elsif new.type = 'unsubscribed' then
    v_title := v_email || ' unsubscribed';
  elsif new.type = 'bounced' then
    v_title := 'Emails to ' || v_email || ' are bouncing';
    v_severity := 'warning';
  elsif new.type = 'complained' then
    v_title := v_email || ' marked an email as spam';
    v_severity := 'warning';
  elsif new.type = 'feedback' then
    if new.reason = 'never_signed_up' then
      v_title := v_email || ' says they never signed up';
      v_severity := 'warning';
      v_needs_action := true;
    else
      v_title := v_email || ' said why they left: ' || replace(coalesce(new.reason, 'other'), '_', ' ');
    end if;
  else
    return new;
  end if;

  insert into public.admin_notifications (
    event_key, category, severity, audience, title, body, action_url,
    entity_type, entity_id, actor_type, actor_label, needs_action, dedupe_key, data
  ) values (
    'subscriber.' || new.type,
    'audience',
    v_severity,
    -- The Email page is owner only, so its notifications are too.
    'owner',
    v_title,
    'Source: ' || replace(new.source, '_', ' '),
    '/admin/email',
    'subscriber',
    new.subscriber_id::text,
    case when new.source = 'admin' then 'staff' else 'visitor' end,
    v_email,
    v_needs_action,
    'subevt:' || new.id::text,
    jsonb_build_object('email', v_email, 'source', new.source, 'reason', new.reason)
  )
  on conflict (dedupe_key) do nothing;

  return new;
exception when others then
  -- The subscription change is what matters, so the inbox never blocks it. But
  -- say so: a swallowed error with no trace is how a feature dies unnoticed.
  raise warning 'notify_admin_subscriber_event failed: % %', sqlstate, sqlerrm;
  return new;
end;
$$;

revoke execute on function public.notify_admin_subscriber_event() from public, anon, authenticated;
