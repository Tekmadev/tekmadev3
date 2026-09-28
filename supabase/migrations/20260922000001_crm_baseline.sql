-- ===========================================================================
-- CRM baseline: write down the four tables that were never in a migration,
-- then fix two indexes. The status_source vocabulary is pinned separately in
-- 20260922000003, which has to wait until the code that writes it is deployed.
--
-- public.subscribers, public.email_campaigns and public.email_events were
-- created by hand in the Supabase dashboard and public.leads was only ever
-- altered here (20260912000002 adds an index to it and assumes it exists), so
-- this directory cannot rebuild any of them. The next migration attaches
-- triggers to public.subscribers and public.leads. A trigger on a table whose
-- definition lives nowhere is not shippable: the next person to read this
-- directory would have no way to know what the trigger fires on, and a rebuilt
-- database would not have the columns the trigger reads.
--
-- So everything below is `if not exists` or guarded, transcribed from the live
-- database column by column, and changes NOTHING on production apart from the
-- two new indexes at the end. Re-running the
-- whole file is a no-op. Constraint names are the Postgres defaults for the
-- inline forms used here, which is exactly what is live, so a rebuilt database
-- gets the same names a hand-built one has.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- public.subscribers: newsletter list, first-party, 25 columns.
-- ---------------------------------------------------------------------------

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null,
  status text not null default 'active'
    check (status in ('active', 'unsubscribed', 'bounced', 'complained')),
  source text not null default 'footer',
  name text,
  -- public_id is the id that goes out in email tracking URLs. unsubscribe_token
  -- is the one that can act. They are separate columns so a tracking pixel can
  -- never carry the token that unsubscribes someone.
  public_id uuid not null default gen_random_uuid(),
  unsubscribe_token uuid not null default gen_random_uuid(),
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  country text,
  device text,
  consent_policy_version text,
  consented_at timestamptz,
  unsubscribed_at timestamptz,
  ghl_synced_at timestamptz,
  raw jsonb,
  status_source text,
  unsubscribe_reason text
);

-- Unique indexes, not unique constraints. That is what is live: pg_constraint
-- holds only the primary key and the status check for this table. Written the
-- other way, a rebuilt database would grow three constraints production does
-- not have, under names that already belong to indexes.
create unique index if not exists subscribers_email_key
  on public.subscribers (lower(email));
create unique index if not exists subscribers_public_id_key
  on public.subscribers (public_id);
create unique index if not exists subscribers_unsub_token_key
  on public.subscribers (unsubscribe_token);
create index if not exists subscribers_created_idx
  on public.subscribers (created_at desc);
create index if not exists subscribers_status_idx
  on public.subscribers (status);

alter table public.subscribers enable row level security;

comment on table public.subscribers is
  'Newsletter subscribers captured first-party from the site footer. Server-only (RLS, no policies).';

-- ---------------------------------------------------------------------------
-- public.leads: booked calls, calculator submissions and portal signups, with
-- the attribution that came in with them. 20 columns.
-- ---------------------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'cal_booking',
  status text,
  name text,
  -- Nullable and not unique. The Cal webhook writes whatever casing the
  -- attendee typed, so nothing downstream may treat this as an identity.
  email text,
  phone text,
  -- The one real-world key on this table: one row per booking, so a reschedule
  -- or a cancellation updates the booking instead of adding a second lead.
  booking_uid text unique,
  booking_start timestamptz,
  booking_end timestamptz,
  event_type text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  click_ids jsonb,
  referrer text,
  landing_page text,
  raw jsonb
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (email);
create index if not exists leads_utm_source_idx on public.leads (utm_source);

alter table public.leads enable row level security;

comment on table public.leads is
  'Booked calls / leads with traffic attribution. Server-only (RLS, no policies).';

-- ---------------------------------------------------------------------------
-- public.email_campaigns: one row per marketing email we send. 10 columns.
-- ---------------------------------------------------------------------------

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key text not null,
  name text not null,
  subject text,
  template text,
  description text,
  active boolean not null default true,
  -- Running totals kept beside the events so the Email page does not count a
  -- million rows to draw one number.
  open_count bigint not null default 0,
  click_count bigint not null default 0
);

-- Again an index and not a constraint, matching live: the name looks like the
-- one Postgres would pick for `key text unique`, but pg_constraint does not
-- have it.
create unique index if not exists email_campaigns_key_key
  on public.email_campaigns (key);

alter table public.email_campaigns enable row level security;

comment on table public.email_campaigns is
  'Marketing email campaigns. GHL sends; we track first-party opens/clicks. Server-only (RLS, no policies).';

-- ---------------------------------------------------------------------------
-- public.email_events: one row per open or click. 10 columns.
--
-- Created after public.subscribers because of the foreign key below.
-- ---------------------------------------------------------------------------

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Only these two. A bounce or a complaint cannot be recorded here at all: it
  -- has to move public.subscribers.status, which is what fires the consent
  -- history trigger.
  type text not null check (type in ('open', 'click')),
  -- No foreign key to public.email_campaigns.key, deliberately: an engagement
  -- row outlives the campaign record it came from.
  campaign_key text,
  -- Set null, not cascade: an erased subscriber must not take the aggregate
  -- engagement numbers with them.
  subscriber_id uuid references public.subscribers (id) on delete set null,
  url text,
  link_label text,
  device text,
  country text,
  referrer text
);

create index if not exists email_events_campaign_idx on public.email_events (campaign_key);
create index if not exists email_events_created_idx on public.email_events (created_at desc);
create index if not exists email_events_subscriber_idx on public.email_events (subscriber_id);
create index if not exists email_events_type_idx on public.email_events (type);

alter table public.email_events enable row level security;

comment on table public.email_events is
  'One row per first-party email open (pixel) or click (redirect). No raw IP. Server-only (RLS, no policies).';

-- ---------------------------------------------------------------------------
-- Index fix 1: the lower(email) index on public.leads that never got created.
--
-- 20260912000002_self_serve_leads.sql:27 declared
-- `create index if not exists leads_email_idx on public.leads (lower(email))`,
-- but an index called leads_email_idx already existed on the RAW email column.
-- `if not exists` matches on the NAME, not on the definition, so Postgres saw
-- the name, skipped the statement, and reported success. Verified against the
-- live database: leads_email_idx is btree (email). The expression index has
-- never existed, so every case-insensitive lead lookup is a sequential scan.
--
-- Editing that old migration would fix nothing (the name still matches and it
-- still skips) and dropping the raw-column index would break the callers that
-- filter on it. A NEW name is the only re-runnable fix.
-- ---------------------------------------------------------------------------

create index if not exists leads_email_lower_idx on public.leads (lower(email));

-- ---------------------------------------------------------------------------
-- Index fix 2: a plain email index on public.subscribers.
--
-- subscribers_email_key is UNIQUE (lower(email)), an EXPRESSION index. The
-- planner can only use it for a predicate written the same way, and
-- addSubscriber filters `.eq("email", ...)` on the raw column, so today every
-- subscribe and every lookup by address sequentially scans the table. Every
-- writer normalizes the address before it gets here, so a plain index on the
-- column is the correct shape and the unique expression index still guards
-- against a duplicate that differs only in case.
-- ---------------------------------------------------------------------------

create index if not exists subscribers_email_plain_idx on public.subscribers (email);
