-- Staff management and commission credit (owner decisions 2026-10-03).
--
-- Tekmadev is hiring cold outreachers as Staff. This adds what the admin API
-- needs for them (docs/admin-api/staff.md):
--
--   1. Pausing access: admins.paused_at / paused_by. A paused person cannot
--      sign in to the web admin or the app and gets no pushes; nothing is
--      deleted and resuming restores everything (lib/admin.ts resolveRole).
--   2. Who found and who booked a lead: leads.found_by (added it by hand),
--      leads.booked_by and booked_at (first moved it to booked, or logged the
--      booking). Filled by the admin API; found_by is backfilled below.
--   3. Credit for a client: client_credits, one row per person and role
--      (finder, booker, other) with a share of 100. Copied from the lead when a
--      client is created from it, using the default split in site_settings
--      'commission'; owners and managers edit them. No money yet: the shares
--      are what a commission will be computed from later.
--   4. The scoreboard: admin_api_staff_activity() counts per person, and
--      admin_api_staff_credits() lists credit rows, for GET /team/activity and
--      GET /me/activity.
--
-- clients.lead_id (client_portal_schema: references leads, on delete set
-- null) already links a client to the lead it came from, so no new column is
-- needed for that; only an index.
--
-- Needs 20261003000004_lead_outreach.sql (leads.assigned_to, follow_up_at,
-- lead_touches) for the scoreboard functions. Everything is additive and safe
-- to run twice. RLS is on with no policies (service role only), like every
-- other table, and the functions are executable by service_role only.

do $$
begin
  if to_regclass('public.admins') is null then
    raise exception 'public.admins does not exist: create the staff table first';
  end if;
  if to_regclass('public.lead_touches') is null then
    raise exception 'public.lead_touches does not exist: apply 20261003000004_lead_outreach.sql first';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Pausing access
-- ---------------------------------------------------------------------------

alter table public.admins
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by text;

comment on column public.admins.paused_at is
  'When an owner or manager paused this person''s access. Null: active. Paused people cannot sign in to the web admin or the app and get no pushes; nothing else changes.';
comment on column public.admins.paused_by is 'Email of who paused them. Null when active.';

-- ---------------------------------------------------------------------------
-- 2. Who found and who booked a lead
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists found_by text,
  add column if not exists booked_by text,
  add column if not exists booked_at timestamptz;

comment on column public.leads.found_by is
  'Email of the team member who found this lead and added it by hand. Null for leads that came in on their own. Their credit role: finder.';
comment on column public.leads.booked_by is
  'Email of the team member who first moved this lead to booked or logged the booking. Null when nobody did (a calendar booking on its own). Their credit role: booker.';
comment on column public.leads.booked_at is 'When booked_by booked it.';

create index if not exists leads_found_by_idx on public.leads (lower(found_by), created_at) where found_by is not null;
create index if not exists leads_booked_by_idx on public.leads (lower(booked_by), booked_at) where booked_by is not null;
create index if not exists lead_touches_by_idx on public.lead_touches (lower(by_email), created_at);

-- Leads added by hand before found_by existed: who added it (the app wrote
-- form.added_by), else who logged the first touch, else who owns it. Only rows
-- that get a value are written. Each write also re-queues that lead's CRM
-- contact upsert (the leads trigger), which is harmless: there are few
-- outreach leads so far and an upsert of an existing contact changes nothing.
update public.leads l
set found_by = v.email
from (
  select
    l2.id,
    lower(btrim(coalesce(
      nullif(btrim(l2.form ->> 'added_by'), ''),
      (select nullif(btrim(t.by_email), '') from public.lead_touches t where t.lead_id = l2.id order by t.created_at, t.id limit 1),
      nullif(btrim(l2.assigned_to), '')
    ))) as email
  from public.leads l2
  where l2.source = 'outreach' and l2.found_by is null
) v
where l.id = v.id and v.email is not null;

-- ---------------------------------------------------------------------------
-- 3. Credit for a client
-- ---------------------------------------------------------------------------

-- Looking a client up by the lead it came from (one lead, one client).
create index if not exists clients_lead_idx on public.clients (lead_id) where lead_id is not null;

create table if not exists public.client_credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- Lowercased email of the team member. No foreign key: credit stays with a
  -- client after the person leaves the team.
  staff_email text not null check (staff_email = lower(btrim(staff_email)) and staff_email <> ''),
  role text not null check (role in ('finder', 'booker', 'other')),
  -- Percent of the credit for this client. A client's rows total exactly 100
  -- (or there are none: nobody gets credit), which the admin API checks and
  -- admin_api_set_client_credits enforces.
  share numeric(5, 2) not null check (share >= 0 and share <= 100),
  -- Email of who last set this row (a person, or 'lead' for the default split).
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, staff_email, role)
);

create index if not exists client_credits_staff_idx on public.client_credits (staff_email);

alter table public.client_credits enable row level security;
revoke all on public.client_credits from anon, authenticated;

comment on table public.client_credits is
  'Who gets credit for winning a client: one row per person and role (finder, booker, other), shares totalling 100. Edits are logged as client_activity "credits.updated". Server only (RLS, no policies).';

-- The default split when a client is created from a lead. The finder and the
-- booker share it; the same person in both roles gets both shares (100); when
-- only one of them is known they get 100; nobody known means no credit.
insert into public.site_settings (key, value, updated_by)
values ('commission', '{"finder": 50, "booker": 50}'::jsonb, 'migration')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------------

-- Replaces a client's credits with p_credits ([{ "email", "role", "share" }])
-- in one transaction: rows not in the list go, the rest are inserted or get
-- their new share. Rows whose share did not change keep updated_at and
-- updated_by. Afterwards the client's shares must total 0 or 100, or nothing
-- is written. With p_only_if_empty, a client that already has credits is left
-- alone and the answer is false (the default split never overwrites an edit).
create or replace function public.admin_api_set_client_credits(
  p_client_id uuid,
  p_credits jsonb,
  p_by text,
  p_only_if_empty boolean default false
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_list jsonb := coalesce(p_credits, '[]'::jsonb);
  v_total numeric;
begin
  if jsonb_typeof(v_list) <> 'array' then
    raise exception 'credits must be a JSON array' using errcode = '22023';
  end if;

  -- One writer at a time per client.
  perform 1 from public.clients c where c.id = p_client_id for update;
  if not found then
    raise exception 'client % does not exist', p_client_id using errcode = 'P0002';
  end if;

  if p_only_if_empty and exists (select 1 from public.client_credits cc where cc.client_id = p_client_id) then
    return false;
  end if;

  delete from public.client_credits cc
  where cc.client_id = p_client_id
    and not exists (
      select 1
      from jsonb_array_elements(v_list) x
      where lower(btrim(x ->> 'email')) = cc.staff_email and x ->> 'role' = cc.role
    );

  insert into public.client_credits as cc (client_id, staff_email, role, share, updated_by)
  select p_client_id, lower(btrim(x ->> 'email')), x ->> 'role', (x ->> 'share')::numeric, p_by
  from jsonb_array_elements(v_list) x
  on conflict (client_id, staff_email, role) do update
    set share = excluded.share,
        updated_by = case when cc.share is distinct from excluded.share then excluded.updated_by else cc.updated_by end,
        updated_at = case when cc.share is distinct from excluded.share then now() else cc.updated_at end;

  select coalesce(sum(cc.share), 0) into v_total from public.client_credits cc where cc.client_id = p_client_id;
  if v_total <> 0 and v_total <> 100 then
    raise exception 'credits for client % total %, not 100', p_client_id, v_total using errcode = '23514';
  end if;
  return true;
end;
$$;

-- The scoreboard: one row per email in p_emails (lowercased), zeros included.
--   leads_found       leads they added by hand (found_by), created since p_since
--   touches_*         touches they logged since p_since, by kind
--   follow_ups_*      leads assigned to them with a follow-up today (from
--                     p_day_start to p_day_end) or before today (overdue),
--                     whatever the range
--   calls_booked      leads they booked (booked_by), booked since p_since
--   clients_won       their credit shares / 100 over clients created since
--                     p_since (1.5 = one whole client and a half), test and
--                     trashed clients left out
--   clients_helped    distinct clients where they changed or added a task,
--                     logged a call or wrote a note or an update since p_since
--                     (test clients left out)
-- p_since null means all time.
create or replace function public.admin_api_staff_activity(
  p_emails text[],
  p_since timestamptz,
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns table (
  email text,
  leads_found bigint,
  touches_call bigint,
  touches_email bigint,
  touches_dm bigint,
  touches_meeting bigint,
  touches_other bigint,
  follow_ups_due_today bigint,
  follow_ups_overdue bigint,
  calls_booked bigint,
  clients_won numeric,
  clients_helped bigint
)
language sql
stable
set search_path = ''
as $$
  with people as (
    select distinct lower(btrim(e)) as email
    from unnest(coalesce(p_emails, '{}'::text[])) as e
    where btrim(coalesce(e, '')) <> ''
  ),
  found as (
    select lower(l.found_by) as email, count(*) as n
    from public.leads l
    where l.found_by is not null
      and lower(l.found_by) in (select p.email from people p)
      and (p_since is null or l.created_at >= p_since)
    group by 1
  ),
  touched as (
    select
      lower(t.by_email) as email,
      count(*) filter (where t.kind = 'call') as call,
      count(*) filter (where t.kind = 'email') as email_n,
      count(*) filter (where t.kind = 'dm') as dm,
      count(*) filter (where t.kind = 'meeting') as meeting,
      count(*) filter (where t.kind not in ('call', 'email', 'dm', 'meeting')) as other
    from public.lead_touches t
    where lower(t.by_email) in (select p.email from people p)
      and (p_since is null or t.created_at >= p_since)
    group by 1
  ),
  follow as (
    select
      lower(l.assigned_to) as email,
      count(*) filter (where l.follow_up_at >= p_day_start) as due_today,
      count(*) filter (where l.follow_up_at < p_day_start) as overdue
    from public.leads l
    where l.assigned_to is not null
      and l.follow_up_at is not null
      and l.follow_up_at < p_day_end
      and lower(l.assigned_to) in (select p.email from people p)
    group by 1
  ),
  booked as (
    select lower(l.booked_by) as email, count(*) as n
    from public.leads l
    where l.booked_by is not null
      and lower(l.booked_by) in (select p.email from people p)
      and (p_since is null or l.booked_at >= p_since)
    group by 1
  ),
  won as (
    select cc.staff_email as email, sum(cc.share) / 100 as n
    from public.client_credits cc
    join public.clients c on c.id = cc.client_id
    where cc.staff_email in (select p.email from people p)
      and not coalesce(c.is_test, false)
      and c.deleted_at is null
      and (p_since is null or c.created_at >= p_since)
    group by 1
  ),
  helped as (
    select lower(a.actor_email) as email, count(distinct a.client_id) as n
    from public.client_activity a
    join public.clients c on c.id = a.client_id
    where a.actor_type = 'admin'
      and a.actor_email is not null
      and lower(a.actor_email) in (select p.email from people p)
      and a.event in ('task.status_changed', 'task.created', 'call.added', 'note', 'update.sent')
      and not coalesce(c.is_test, false)
      and (p_since is null or a.created_at >= p_since)
    group by 1
  )
  select
    p.email,
    coalesce(f.n, 0)::bigint,
    coalesce(t.call, 0)::bigint,
    coalesce(t.email_n, 0)::bigint,
    coalesce(t.dm, 0)::bigint,
    coalesce(t.meeting, 0)::bigint,
    coalesce(t.other, 0)::bigint,
    coalesce(fu.due_today, 0)::bigint,
    coalesce(fu.overdue, 0)::bigint,
    coalesce(b.n, 0)::bigint,
    round(coalesce(w.n, 0), 2)::numeric,
    coalesce(h.n, 0)::bigint
  from people p
  left join found f on f.email = p.email
  left join touched t on t.email = p.email
  left join follow fu on fu.email = p.email
  left join booked b on b.email = p.email
  left join won w on w.email = p.email
  left join helped h on h.email = p.email
  order by p.email;
$$;

-- Credit rows of these people over clients created since p_since (null: all
-- time), newest client first, test and trashed clients left out.
create or replace function public.admin_api_staff_credits(p_emails text[], p_since timestamptz)
returns table (
  staff_email text,
  client_id uuid,
  business_name text,
  role text,
  share numeric,
  won_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select cc.staff_email, cc.client_id, c.business_name, cc.role, cc.share, c.created_at
  from public.client_credits cc
  join public.clients c on c.id = cc.client_id
  where cc.staff_email in (select lower(btrim(e)) from unnest(coalesce(p_emails, '{}'::text[])) as e)
    and not coalesce(c.is_test, false)
    and c.deleted_at is null
    and (p_since is null or c.created_at >= p_since)
  order by c.created_at desc, c.id, array_position(array['finder', 'booker', 'other'], cc.role), cc.staff_email;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_api_set_client_credits(uuid, jsonb, text, boolean)',
    'public.admin_api_staff_activity(text[], timestamptz, timestamptz, timestamptz)',
    'public.admin_api_staff_credits(text[], timestamptz)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
