-- Two-way CRM sync: the identity spine, the two queues, and the enqueue triggers.
--
-- Nothing in this file calls anything. It records intent so a worker can act
-- later: every outbound push becomes a public.crm_outbox row inside the same
-- transaction as the write that caused it, and every inbound delivery becomes a
-- public.crm_inbox row before anyone interprets it. Losing a lead or an
-- unsubscribe would take losing a committed Postgres row.
--
-- Triggers enqueue, not application code, because there is no choke point to
-- put that code in: app/admin/(dashboard)/email/actions.ts writes
-- public.subscribers directly and bypasses lib/subscribers-data.ts entirely. A
-- trigger fires inside the writer's transaction, so one piece of code covers
-- the unsubscribe page, the admin, the inbound webhook and a hand-run SQL fix.
-- Same argument the repo already made at 20260918000003_subscriber_events.sql:9.
--
-- An outbox row names a SUBJECT, never a desired state. The worker reads
-- current truth the instant before it calls out, so a job queued an hour ago
-- cannot apply an hour-old opinion: replays and out-of-order deliveries
-- converge instead of flapping a person's consent back and forth.
--
-- This file is inert on deploy. The owner switch is seeded with every leg off,
-- so public.crm_outbound_enabled() reads false and the triggers return without
-- enqueueing anything. No statement here depends on a vendor value.
--
-- Service role only, like every table here: RLS on, no policies, so only the
-- service role (which bypasses RLS) can read or write any of it.

-- ---------------------------------------------------------------------------
-- 1. The identity spine.
--
-- Email is the identity, normalised once into email_key, because that is the
-- only field both sides always have. Deliberately NO foreign key to
-- public.subscribers: deleteSubscriberAction hard-deletes and
-- public.subscriber_events cascades away with it, and this row has to OUTLIVE
-- that. Without it a surviving contact on their side resurrects, on the next
-- inbound event, someone who asked to be forgotten. The row holds only the
-- email key and CRM state: no name, no attribution, no calculator answers,
-- which is what makes keeping it compatible with an erasure request rather
-- than in tension with one.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  email_key text not null unique,            -- lower(btrim(email)). The identity.
  email text not null,
  ghl_contact_id text unique,                -- null until the first upsert succeeds
  ghl_location_id text,
  -- What we last knew their side to hold. The polarity is inverted from
  -- intuition and this is the only place it is written down: 'active' means DND
  -- is ON, that is SUPPRESSED. 'inactive' means contactable. 'permanent' is
  -- terminal (hard bounce, spam complaint, carrier opt-out) and needs a
  -- contact-initiated opt-in to clear, so we never try to clear it.
  ghl_dnd_email text not null default 'unknown'
    check (ghl_dnd_email in ('unknown', 'inactive', 'active', 'permanent')),
  ghl_dnd_code text,
  ghl_dnd_at timestamptz,                    -- occurred-at of the newest applied change
  ghl_tags text[] not null default '{}'::text[],
  synced_at timestamptz,
  reconciled_at timestamptz,
  last_trace_id text,
  erased_at timestamptz,                     -- tombstone; survives a hard delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The reconciler's cursor: oldest first, never-checked first, so a pass that
-- runs out of Vercel budget resumes exactly where it stopped.
create index if not exists crm_contacts_reconcile_idx
  on public.crm_contacts (reconciled_at nulls first);

alter table public.crm_contacts enable row level security;
revoke all on public.crm_contacts from anon, authenticated;
comment on table public.crm_contacts is
  'Email-keyed identity spine between our tables and the CRM, plus the last known state of their side. Outlives a deleted subscriber on purpose: erased_at is the tombstone that stops a surviving contact recreating someone who asked to be forgotten.';

-- ---------------------------------------------------------------------------
-- 2. The outbox: one row per outbound intent.
--
-- payload carries only facts that are NOT derivable from the subject at send
-- time, such as which tag this job is about. It never carries the desired DND
-- state, because the worker recomputes that from public.subscribers just before
-- it calls, which is what makes a replay a no-op instead of a regression.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in
    ('contact.upsert', 'dnd.set', 'tags.add', 'tags.remove', 'contact.erase')),
  -- The whole idempotency story. Coalescing for profile pushes, transition
  -- scoped for consent, per real-world event for event tags. See design
  -- section 9 and the key each trigger below builds.
  idem_key text not null unique,
  email_key text not null,
  subject_type text not null check (subject_type in
    ('subscriber', 'lead', 'lead_magnet_submission', 'client', 'admin')),
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in
    ('pending', 'sending', 'done', 'noop', 'failed', 'dead', 'discarded')),
  -- 1 = consent. A suppression jumps ahead of every profile push in the queue,
  -- because a late unsubscribe is a compliance failure and a late name change
  -- is nothing.
  priority smallint not null default 5,
  attempts integer not null default 0,
  revision integer not null default 1,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  last_http_status integer,
  ghl_trace_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Partial, because the due set stays small while done and noop rows pile up
-- for good as the audit trail.
create index if not exists crm_outbox_due_idx
  on public.crm_outbox (priority, created_at)
  where status in ('pending', 'failed');
-- Finds rows a timed-out function abandoned in 'sending'.
create index if not exists crm_outbox_sending_idx
  on public.crm_outbox (locked_at) where status = 'sending';
-- The contact inspector on /admin/crm: everything we ever sent about a person.
create index if not exists crm_outbox_email_idx on public.crm_outbox (email_key, created_at);
-- The dead-letter panel, newest first.
create index if not exists crm_outbox_dead_idx
  on public.crm_outbox (updated_at desc) where status = 'dead';

alter table public.crm_outbox enable row level security;
revoke all on public.crm_outbox from anon, authenticated;
comment on table public.crm_outbox is
  'Durable queue of outbound CRM intents, enqueued by trigger inside the transaction that caused them. A row names a subject, never a desired state: the worker reads current truth at send time.';

-- ---------------------------------------------------------------------------
-- 3. The inbox: one row per inbound delivery, written before it is understood.
--
-- The route acknowledges as soon as this row is committed and processes
-- afterwards, so their delivery-success rate never depends on how long our
-- Supabase writes take. Their retries are therefore not our retry mechanism:
-- ours is a row left 'pending', 'failed' or 'unmapped' that the cron sweeps,
-- which is strictly stronger than depending on the sender.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_inbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,   -- their webhookId, else a content hash
  event_type text not null,
  location_id text,
  ghl_contact_id text,
  email_key text,
  occurred_at timestamptz,           -- their own timestamp, for staleness
  -- Always stored, verified or not. The signing docs are demonstrably stale,
  -- so kept evidence beats guessing later about what actually arrived.
  payload jsonb not null,
  headers jsonb,
  signature_ok boolean not null default false,
  status text not null default 'pending' check (status in
    ('pending', 'processing', 'applied', 'ignored', 'stale', 'failed', 'dead',
     'unverified', 'unmapped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- 'unmapped' is due work, not a dead end: it means an appointment arrived for a
-- location the owner has not mapped yet, and it must apply the moment he does.
create index if not exists crm_inbox_due_idx
  on public.crm_inbox (next_attempt_at)
  where status in ('pending', 'failed', 'unmapped');
create index if not exists crm_inbox_recent_idx on public.crm_inbox (received_at desc);

alter table public.crm_inbox enable row level security;
revoke all on public.crm_inbox from anon, authenticated;
comment on table public.crm_inbox is
  'Every inbound CRM webhook delivery, raw, stored before it is interpreted and kept whether or not the signature verified. The cron retries rows left pending, failed or unmapped.';

-- ---------------------------------------------------------------------------
-- 4. Location mapping.
--
-- A separate table rather than a column on public.clients, because it carries
-- two things a column cannot. qualifying_calendar_ids answers the guarantee's
-- own wording ("schedules through the system we built"), and a custom deal is
-- data, not code. is_agency keeps Tekmadev's own sales bookings out of the
-- client appointment feed, which otherwise silently inflates a client's count.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_locations (
  ghl_location_id text primary key,
  client_id uuid references public.clients (id) on delete set null,
  label text,
  -- When non-empty, only appointments on these calendars count toward the
  -- guarantee. Empty means every calendar counts.
  qualifying_calendar_ids text[] not null default '{}'::text[],
  is_agency boolean not null default false,   -- Tekmadev's own sales location
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_locations enable row level security;
revoke all on public.crm_locations from anon, authenticated;
comment on table public.crm_locations is
  'Maps a CRM sub-account to the client it belongs to, plus which calendars count toward that client guarantee. is_agency marks our own sales sub-account so its bookings never reach a client appointment feed.';

-- ---------------------------------------------------------------------------
-- 5. Run log, mirroring public.ad_sync_runs so /admin/crm can show "last synced"
-- and so a failure is visible instead of silent. Written through one finish()
-- closure per pass, the pattern at lib/meta-ads.ts:160, which is what stops a
-- crashed pass leaving a row stuck on 'running' for good.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_sync_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('outbox', 'inbox', 'reconcile', 'backfill', 'probe')),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual', 'inline')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- 'partial' is its own outcome: a pass that ran out of Vercel budget did real
  -- work and is not an error, and calling it 'ok' would hide a growing backlog.
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'error')),
  claimed integer not null default 0,
  done integer not null default 0,
  -- Counted apart from done so the admin can see how much traffic the
  -- send-time state compare saves, and so a reconcile can tell "we checked and
  -- agreed" from "we never tried".
  noop integer not null default 0,
  failed integer not null default 0,
  dead integer not null default 0,
  corrected integer not null default 0,
  api_calls integer not null default 0,
  error text
);

alter table public.crm_sync_runs enable row level security;
revoke all on public.crm_sync_runs from anon, authenticated;
comment on table public.crm_sync_runs is
  'One row per outbox, inbox, reconcile, backfill or probe pass. Opened at the start and always closed through the same finish() closure, so a crashed pass is visible rather than stuck on running.';

-- ---------------------------------------------------------------------------
-- 6. The owner switch: three surfaces, not seven and not one.
--
-- Outbound has to be live before the inbound marketplace app even exists.
-- Inbound can suppress addresses, so it deserves a switch the owner can pull in
-- one click without stopping outbound. Reconcile can suppress in bulk, so it
-- deserves a third. health stays 'unverified' until the probe passes, and the
-- gate refuses to sync while it reads that way, so nothing arms on a guess.
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value, updated_by)
values ('crm_sync',
  '{"outbound": false, "inbound": false, "reconcile": false, "health": "unverified"}'::jsonb,
  'migration')
on conflict (key) do nothing;

-- crm_fields caches the custom field ids their API assigns, so the bootstrap is
-- one call per deploy instead of one per job. crm_probe holds the last probe
-- result, including which lookup endpoint a Private Integration Token was
-- actually allowed to use.
insert into public.site_settings (key, value, updated_by)
values ('crm_fields', '{}'::jsonb, 'migration'),
       ('crm_probe',  '{}'::jsonb, 'migration')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. The enqueue guard.
--
-- Gating exists so years of rows do not accumulate before the owner arms
-- anything. Pre-existing rows are not lost by it: the backfill drives from
-- public.subscribers and public.leads directly and is needed regardless.
-- ---------------------------------------------------------------------------
create or replace function public.crm_outbound_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select value into v from public.site_settings where key = 'crm_sync';
  -- Missing, unreadable or malformed: enqueue anyway. A durable row costs
  -- nothing and can be discarded; a lost lead cannot be recovered at all.
  if v is null then
    return true;
  end if;
  return coalesce((v->>'outbound')::boolean, false);
exception when others then
  return true;
end;
$$;

revoke all on function public.crm_outbound_enabled() from public, anon, authenticated;
grant execute on function public.crm_outbound_enabled() to service_role;

-- ---------------------------------------------------------------------------
-- 8. The shared enqueue. Every trigger below funnels through this one function,
-- so the erasure check and the priority rule exist in exactly one place.
-- ---------------------------------------------------------------------------
create or replace function public.crm_enqueue(
  p_kind text,
  p_idem_key text,
  p_email_key text,
  p_subject_type text,
  p_subject_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_email_key is null or p_email_key = '' then
    return;
  end if;

  -- An erased person is never re-created. This is the single check that makes
  -- the tombstone on public.crm_contacts worth keeping: without it the next
  -- signup, reconcile or inbound event quietly rebuilds the contact.
  if exists (select 1 from public.crm_contacts c
             where c.email_key = p_email_key and c.erased_at is not null) then
    return;
  end if;

  -- The spine row must exist before the job does, or the worker has nowhere to
  -- record the contact id it learns.
  insert into public.crm_contacts (email_key, email)
  values (p_email_key, p_email_key)
  on conflict (email_key) do nothing;

  insert into public.crm_outbox
    (kind, idem_key, email_key, subject_type, subject_id, payload, priority)
  values
    (p_kind, p_idem_key, p_email_key, p_subject_type, p_subject_id,
     coalesce(p_payload, '{}'::jsonb),
     case when p_kind = 'dnd.set' then 1 else 5 end)
  on conflict (idem_key) do update
    -- A row already in 'sending' is left alone: a worker is holding it, and
    -- that worker recomputes the desired state at send time anyway, so the new
    -- intent is already covered by the call in flight.
    set status = case when crm_outbox.status in ('done', 'noop', 'failed', 'dead', 'discarded')
                      then 'pending' else crm_outbox.status end,
        attempts = case when crm_outbox.status in ('done', 'noop', 'failed', 'dead', 'discarded')
                        then 0 else crm_outbox.attempts end,
        revision = crm_outbox.revision + 1,
        next_attempt_at = now(),
        payload = coalesce(excluded.payload, crm_outbox.payload),
        updated_at = now();
end;
$$;

revoke all on function public.crm_enqueue(text, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.crm_enqueue(text, text, text, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 9. The three enqueue triggers.
--
-- Every one of them ends in "exception when others then raise warning; return
-- new", for the reason spelled out at
-- 20260919000004_admin_notifications_hardening.sql:341. THE OUTBOX MUST NEVER
-- BLOCK A SIGNUP OR AN UNSUBSCRIBE. A person clicking unsubscribe cannot be
-- shown an error because a queue table was unhappy. But the failure is said out
-- loud, because a swallowed error with no trace is how a feature dies
-- unnoticed, and a swallowed enqueue is recovered by reconciliation. That is
-- exactly why reconciliation is not optional.
-- ---------------------------------------------------------------------------

create or replace function public.crm_enqueue_from_subscriber()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  k := lower(btrim(coalesce(new.email, '')));
  if k = '' then
    return new;
  end if;
  if not public.crm_outbound_enabled() then
    return new;
  end if;

  -- Coalescing key: only the latest profile state matters, so ten edits in a
  -- minute are one row and one call.
  perform public.crm_enqueue('contact.upsert', 'contact.upsert:' || k, k,
                             'subscriber', new.id, '{}'::jsonb);

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    -- Transition-scoped: each distinct destination status is its own job, so a
    -- flip back is a different key and cannot collapse into the flip out.
    perform public.crm_enqueue('dnd.set', 'dnd.email:' || k || ':' || new.status, k,
                               'subscriber', new.id, '{}'::jsonb);
    -- The newsletter tag is THE consent tag: every marketing audience filters
    -- on it, and this trigger is the only thing in the system allowed to write
    -- it, derived from public.subscribers.status and nothing else. A calculator
    -- submission is an inquiry, not consent, so it can never produce this tag.
    if new.status = 'active' then
      perform public.crm_enqueue('tags.add', 'tags.add:' || k || ':newsletter', k,
                                 'subscriber', new.id, '{"tag":"newsletter"}'::jsonb);
    else
      perform public.crm_enqueue('tags.remove', 'tags.remove:' || k || ':newsletter', k,
                                 'subscriber', new.id, '{"tag":"newsletter"}'::jsonb);
    end if;
  end if;

  return new;
exception when others then
  raise warning 'crm enqueue (subscriber %) failed: % %', new.id, sqlstate, sqlerrm;
  return new;
end;
$$;

drop trigger if exists subscribers_crm_enqueue on public.subscribers;
create trigger subscribers_crm_enqueue
  after insert or update on public.subscribers
  for each row execute function public.crm_enqueue_from_subscriber();

revoke all on function public.crm_enqueue_from_subscriber() from public, anon, authenticated;
grant execute on function public.crm_enqueue_from_subscriber() to service_role;

create or replace function public.crm_enqueue_from_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v_scope text;
begin
  -- public.leads.email is nullable and never normalised on the way in: the Cal
  -- webhook writes Cal's own casing verbatim at app/api/webhooks/cal/route.ts:112.
  -- No email means no identity, so there is nothing to enqueue.
  k := lower(btrim(coalesce(new.email, '')));
  if k = '' then
    return new;
  end if;
  if not public.crm_outbound_enabled() then
    return new;
  end if;

  perform public.crm_enqueue('contact.upsert', 'contact.upsert:' || k, k,
                             'lead', new.id, '{}'::jsonb);

  -- Event tags record something that happened, so their keys are scoped to the
  -- real-world event rather than coalesced. The booking uid is that event for a
  -- Cal booking, which is what makes a reschedule its own job instead of a
  -- replay of the original. Rows with no booking fall back to the row id.
  v_scope := coalesce(nullif(btrim(coalesce(new.booking_uid, '')), ''), new.id::text);

  -- Only on a real change. Cal retries a delivery and the route upserts on
  -- booking_uid, so an unchanged redelivery must not reset a finished tag job
  -- back to pending and spend a call re-applying a tag that is already there.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.source = 'cal_booking' then
      if new.status in ('booked', 'rescheduled') then
        perform public.crm_enqueue('tags.add',
          'tags.add:' || k || ':booked-call:' || v_scope, k,
          'lead', new.id, '{"tag":"booked-call"}'::jsonb);
      elsif new.status = 'cancelled' then
        perform public.crm_enqueue('tags.add',
          'tags.add:' || k || ':booking-cancelled:' || v_scope, k,
          'lead', new.id, '{"tag":"booking-cancelled"}'::jsonb);
        -- The call is off the calendar, so the tag that drives reminder
        -- workflows has to come off with it or the person gets reminded about a
        -- meeting that is not happening.
        perform public.crm_enqueue('tags.remove',
          'tags.remove:' || k || ':booked-call:' || v_scope, k,
          'lead', new.id, '{"tag":"booked-call"}'::jsonb);
      end if;
    elsif new.source = 'lead_magnet' then
      perform public.crm_enqueue('tags.add',
        'tags.add:' || k || ':lead-magnet:' || v_scope, k,
        'lead', new.id, '{"tag":"lead-magnet"}'::jsonb);
      -- Which tool, as its own tag, because each tool gets its own follow-up
      -- workflow on their side and the revenue leak one branches on the dollar
      -- figure. The slug is REVENUE_LEAK_SLUG in config/lead-magnets.ts, carried
      -- on the lead row by lib/lead-magnet-data.ts. A tool with no tag of its own
      -- still gets the general lead-magnet tag above.
      if new.raw->>'magnet' = 'revenue-leak-calculator' then
        perform public.crm_enqueue('tags.add',
          'tags.add:' || k || ':lead-magnet-revenue-leak:' || v_scope, k,
          'lead', new.id, '{"tag":"lead-magnet-revenue-leak"}'::jsonb);
      end if;
    elsif new.source = 'portal_signup' then
      perform public.crm_enqueue('tags.add',
        'tags.add:' || k || ':portal-signup:' || v_scope, k,
        'lead', new.id, '{"tag":"portal-signup"}'::jsonb);
    end if;
  end if;

  return new;
exception when others then
  raise warning 'crm enqueue (lead %) failed: % %', new.id, sqlstate, sqlerrm;
  return new;
end;
$$;

drop trigger if exists leads_crm_enqueue on public.leads;
create trigger leads_crm_enqueue
  after insert or update on public.leads
  for each row execute function public.crm_enqueue_from_lead();

revoke all on function public.crm_enqueue_from_lead() from public, anon, authenticated;
grant execute on function public.crm_enqueue_from_lead() to service_role;

create or replace function public.crm_enqueue_from_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v_plan text;
begin
  -- A sandbox purchase never reaches the CRM. Test clients are created by the
  -- admin-only Stripe test mode, and there is no way to tell one apart once it
  -- is a contact on their side, so it must not become one.
  if new.is_test then
    return new;
  end if;

  k := lower(btrim(coalesce(new.primary_email, '')));
  if k = '' then
    return new;
  end if;
  if not public.crm_outbound_enabled() then
    return new;
  end if;

  perform public.crm_enqueue('contact.upsert', 'contact.upsert:' || k, k,
                             'client', new.id, '{}'::jsonb);

  -- Becoming a client happens once per row, so the row id is the event.
  if tg_op = 'INSERT' then
    perform public.crm_enqueue('tags.add', 'tags.add:' || k || ':client:' || new.id::text, k,
                               'client', new.id, '{"tag":"client"}'::jsonb);
  end if;

  -- Going live is the moment onboarding nudges start on their side. Once per
  -- row: a client paused and brought back is the same client going live again,
  -- and the key scoped to the row keeps that a no-op instead of a second nudge.
  if new.status = 'live' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    perform public.crm_enqueue('tags.add', 'tags.add:' || k || ':client-live:' || new.id::text, k,
                               'client', new.id, '{"tag":"client-live"}'::jsonb);
  end if;

  -- The plan is carried as data, not baked into the tag name, because the
  -- products table is the source of truth for what plans exist and this
  -- migration must not hold a second copy of that list.
  v_plan := nullif(btrim(coalesce(new.plan_id, '')), '');
  if v_plan is not null and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id) then
    perform public.crm_enqueue('tags.add',
      'tags.add:' || k || ':plan-' || v_plan || ':' || new.id::text, k,
      'client', new.id, jsonb_build_object('tag', 'plan', 'plan', v_plan));
  end if;

  return new;
exception when others then
  raise warning 'crm enqueue (client %) failed: % %', new.id, sqlstate, sqlerrm;
  return new;
end;
$$;

drop trigger if exists clients_crm_enqueue on public.clients;
create trigger clients_crm_enqueue
  after insert or update on public.clients
  for each row execute function public.crm_enqueue_from_client();

revoke all on function public.crm_enqueue_from_client() from public, anon, authenticated;
grant execute on function public.crm_enqueue_from_client() to service_role;

-- ---------------------------------------------------------------------------
-- 10. The claim functions. This is what makes "never double-applied" true under
-- concurrent workers and timed-out Vercel functions, rather than merely likely.
-- ---------------------------------------------------------------------------
create or replace function public.crm_outbox_claim(p_worker text, p_limit int)
returns setof public.crm_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with cand as (
    select o.id, o.email_key, o.priority, o.created_at
      from public.crm_outbox o
     where ((o.status in ('pending', 'failed') and o.next_attempt_at <= now())
        -- A function that timed out mid-send left the row in 'sending' with
        -- nobody holding it. Reclaim it: every handler is idempotent at their
        -- end, so re-sending is safe and never sending is not.
        or (o.status = 'sending' and o.locked_at < now() - interval '5 minutes'))
       -- Nobody else is mid-send for this person. The distinct-on below keeps
       -- one pass to one job per contact, but an inline nudge and the cron run
       -- concurrently, and two live calls for one email can race each other
       -- into creating the contact twice on their side. A held job blocks only
       -- its own person, and only until it finishes or goes stale.
       and not exists (
         select 1 from public.crm_outbox h
          where h.email_key = o.email_key
            and h.status = 'sending'
            and h.locked_at >= now() - interval '5 minutes'
            and h.id <> o.id
       )
     order by o.priority, o.created_at
     limit greatest(p_limit * 5, 25)
       -- Overfetch first, because the dedupe below discards rows, and lock here
       -- because FOR UPDATE cannot coexist with DISTINCT in one subquery. Two
       -- stages is not style, it is the only shape Postgres allows.
       for update skip locked
  ), picked as (
    -- One job per contact per pass: strict FIFO per person, full parallelism
    -- across people, and no two workers ever holding the same contact, which is
    -- what stops a profile push and a suppression racing each other.
    select distinct on (c.email_key) c.id, c.priority, c.created_at
      from cand c
     order by c.email_key, c.priority, c.created_at
  ), capped as (
    select p.id from picked p order by p.priority, p.created_at limit p_limit
  )
  update public.crm_outbox o
     set status = 'sending', locked_at = now(), locked_by = p_worker,
         attempts = o.attempts + 1, updated_at = now()
   where o.id in (select id from capped)
  returning o.*;
end;
$$;

revoke all on function public.crm_outbox_claim(text, integer) from public, anon, authenticated;
grant execute on function public.crm_outbox_claim(text, integer) to service_role;

create or replace function public.crm_inbox_claim(p_worker text, p_limit int)
returns setof public.crm_inbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- p_worker is accepted for symmetry with crm_outbox_claim and is deliberately
  -- unused: an inbox row records a delivery that already arrived, so there is no
  -- locked_by to write and no outbound call a worker name would help trace.
  return query
  with cand as (
    select i.id
      from public.crm_inbox i
     -- signature_ok on both branches, not left to the status alone. An unsigned
     -- delivery is stored as 'unverified' and nothing claims that status today,
     -- but a status is one UPDATE away from changing (an admin retry, a hand-run
     -- fix), and this endpoint can suppress arbitrary addresses: a forged
     -- unsubscribe must be unappliable, not merely unscheduled.
     where i.signature_ok
       and ((i.status in ('pending', 'failed', 'unmapped') and i.next_attempt_at <= now())
         or (i.status = 'processing' and i.locked_at < now() - interval '5 minutes'))
     -- Oldest delivery first, and no per-key dedupe: inbound events are applied
     -- in arrival order and the handlers are monotone, so two events about one
     -- contact in one pass converge rather than fight.
     order by i.received_at
     limit p_limit
       for update skip locked
  )
  update public.crm_inbox i
     set status = 'processing', locked_at = now(), attempts = i.attempts + 1
   where i.id in (select id from cand)
  returning i.*;
end;
$$;

revoke all on function public.crm_inbox_claim(text, integer) from public, anon, authenticated;
grant execute on function public.crm_inbox_claim(text, integer) to service_role;
