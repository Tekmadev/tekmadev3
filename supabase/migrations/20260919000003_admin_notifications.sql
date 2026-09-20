-- The admin notification center.
--
-- One inbox for everything the owner and staff should know about: a lead
-- booked, money in, money at risk, a client waiting on us, a system that
-- quietly stopped working. The owner asked for this to live in the admin, not
-- in email, and to be built so a mobile app can read the same data later. So
-- the rows are self-describing (stable event key, category, severity, the
-- entity they are about, a deep link, a structured payload) and nothing about
-- them depends on how the web admin happens to render them.
--
-- Shape:
--   admin_notifications        one row per real-world event, shared by all staff
--   admin_notification_reads   who has read what (per user)
--   admin_notification_state   per user "everything before this is read" watermark,
--                              so Mark all read is one write, not one per row
--   admin_notification_prefs   per user, per category: muted in the inbox, and
--                              whether a future mobile app should push it
--
-- Users are Supabase auth user ids, never admins.id: owners named in the
-- ADMIN_EMAILS env have no admins row.

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Stable machine name, dot notation: lead.booked, order.paid. Never rename one;
  -- a mobile client will switch on these. The catalogue lives in lib/admin-notify.ts.
  event_key text not null,
  category text not null
    check (category in ('leads', 'sales', 'billing', 'clients', 'audience', 'team', 'system')),
  severity text not null default 'info'
    check (severity in ('info', 'success', 'warning', 'critical')),
  -- 'owner' rows (money, security) are hidden from managers.
  audience text not null default 'staff' check (audience in ('staff', 'owner')),

  title text not null,
  body text,
  -- Path inside the admin, for example /admin/clients/<id>. Never a full URL.
  action_url text,

  entity_type text,
  entity_id text,
  client_id uuid references public.clients(id) on delete set null,

  actor_type text not null default 'system'
    check (actor_type in ('system', 'visitor', 'client', 'staff', 'stripe')),
  actor_label text,

  -- "Someone has to do something": verify an access grant, chase a failed
  -- payment. Stays in the Needs action list until resolved, read or not.
  needs_action boolean not null default false,
  resolved_at timestamptz,
  resolved_by text,

  -- Sandbox purchases and test accounts. Hidden unless asked for, and purged
  -- with the rest of the test data.
  is_test boolean not null default false,

  -- Idempotency. Webhooks retry and people double click; the same real-world
  -- event must never produce two rows. Unique, and NULLs never collide, so
  -- events with no natural key simply leave it empty.
  dedupe_key text unique,

  -- Structured payload for clients that want more than title and body:
  -- amounts in cents, currency, emails, Stripe ids, scores.
  data jsonb not null default '{}'::jsonb
);

comment on table public.admin_notifications is
  'Admin inbox: one row per real-world event worth telling staff about. Written through lib/admin-notify.ts (never throws, idempotent on dedupe_key) and by the subscriber trigger below.';

create index if not exists admin_notifications_created_idx
  on public.admin_notifications (created_at desc);
create index if not exists admin_notifications_category_idx
  on public.admin_notifications (category, created_at desc);
create index if not exists admin_notifications_open_idx
  on public.admin_notifications (created_at desc) where needs_action and resolved_at is null;
create index if not exists admin_notifications_client_idx
  on public.admin_notifications (client_id, created_at desc) where client_id is not null;
create index if not exists admin_notifications_test_idx
  on public.admin_notifications (created_at desc) where is_test;

create table if not exists public.admin_notification_reads (
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists admin_notification_reads_user_idx
  on public.admin_notification_reads (user_id);

create table if not exists public.admin_notification_state (
  user_id uuid primary key,
  -- Everything created at or before this moment counts as read for this user.
  read_all_before timestamptz not null default '-infinity',
  -- When the user last opened the bell, for a "new since you looked" hint.
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_notification_prefs (
  user_id uuid not null,
  category text not null
    check (category in ('leads', 'sales', 'billing', 'clients', 'audience', 'team', 'system')),
  -- Muted categories stay in the full list but never count as unread.
  muted boolean not null default false,
  -- Reserved for the mobile app: whether this category may send a push.
  push boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

-- Server only, like every other table here.
alter table public.admin_notifications enable row level security;
alter table public.admin_notification_reads enable row level security;
alter table public.admin_notification_state enable row level security;
alter table public.admin_notification_prefs enable row level security;

-- ---------------------------------------------------------------------------
-- Reading. "Unread" is an anti-join plus a watermark plus muted categories,
-- which PostgREST filters cannot express, so the inbox is read through two
-- functions. Both take the viewer explicitly: the caller is the service role,
-- so auth.uid() is not available.
-- ---------------------------------------------------------------------------

create or replace function public.admin_notification_list(
  p_user uuid,
  p_is_owner boolean,
  p_filter text default 'all',       -- all | unread | action
  p_category text default null,
  p_include_test boolean default false,
  p_before timestamptz default null, -- keyset cursor: rows older than this
  p_limit integer default 30
)
returns table (
  id uuid,
  created_at timestamptz,
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
  is_read boolean
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
    n.id, n.created_at, n.event_key, n.category, n.severity, n.title, n.body, n.action_url,
    n.entity_type, n.entity_id, n.client_id, n.actor_type, n.actor_label,
    n.needs_action, n.resolved_at, n.resolved_by, n.is_test, n.data,
    (n.created_at <= st.watermark or r.notification_id is not null) as is_read
  from public.admin_notifications n
  cross join st
  left join public.admin_notification_reads r
    on r.notification_id = n.id and r.user_id = p_user
  where (p_is_owner or n.audience = 'staff')
    and (p_include_test or not n.is_test)
    and (p_category is null or n.category = p_category)
    and (p_before is null or n.created_at < p_before)
    and (
      p_filter = 'all'
      or (p_filter = 'unread' and n.created_at > st.watermark and r.notification_id is null)
      or (p_filter = 'action' and n.needs_action and n.resolved_at is null)
    )
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100);
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
  with st as (
    select coalesce(
      (select s.read_all_before from public.admin_notification_state s where s.user_id = p_user),
      '-infinity'::timestamptz
    ) as watermark
  ),
  visible as (
    select n.*
    from public.admin_notifications n
    where (p_is_owner or n.audience = 'staff') and not n.is_test
  )
  select jsonb_build_object(
    -- Muted categories never count as unread. They still show in the list.
    'unread', (
      select count(*)
      from visible n
      cross join st
      where n.created_at > st.watermark
        and not exists (
          select 1 from public.admin_notification_reads r
          where r.notification_id = n.id and r.user_id = p_user
        )
        and not exists (
          select 1 from public.admin_notification_prefs p
          where p.user_id = p_user and p.category = n.category and p.muted
        )
    ),
    'needs_action', (select count(*) from visible n where n.needs_action and n.resolved_at is null),
    'critical_unread', (
      select count(*)
      from visible n
      cross join st
      where n.severity = 'critical'
        and n.created_at > st.watermark
        and not exists (
          select 1 from public.admin_notification_reads r
          where r.notification_id = n.id and r.user_id = p_user
        )
    )
  );
$$;

revoke execute on function public.admin_notification_list(uuid, boolean, text, text, boolean, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.admin_notification_list(uuid, boolean, text, text, boolean, timestamptz, integer) to service_role;
revoke execute on function public.admin_notification_summary(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_notification_summary(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Newsletter changes. subscriber_events is already written by a trigger, so
-- that every path (the unsubscribe page, the admin, a future CRM webhook, a
-- hand-run SQL fix) leaves a record. The inbox hangs off the same trigger chain
-- for the same reason: no code path can change a subscription without staff
-- hearing about it.
-- ---------------------------------------------------------------------------

create or replace function public.notify_admin_subscriber_event()
returns trigger
language plpgsql
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
    -- The one reason that is a compliance signal, not a preference.
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
    event_key, category, severity, title, body, action_url,
    entity_type, entity_id, actor_type, actor_label, needs_action, dedupe_key, data
  ) values (
    'subscriber.' || new.type,
    'audience',
    v_severity,
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
  -- The subscription change is the thing that matters. Never let the inbox break it.
  return new;
end;
$$;

drop trigger if exists subscriber_events_notify_admin on public.subscriber_events;
create trigger subscriber_events_notify_admin
  after insert on public.subscriber_events
  for each row execute function public.notify_admin_subscriber_event();
