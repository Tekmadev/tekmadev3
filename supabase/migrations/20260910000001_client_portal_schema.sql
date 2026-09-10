-- Client portal + onboarding spine.
--
-- One account (`clients`) per paying business, its people (`client_members`,
-- backed by Supabase Auth), and everything onboarding produces: runs, tasks,
-- intake answers, delegated-access registry, uploaded assets, deliverable
-- approvals, agreements, the booked-call guarantee counter, an immutable
-- activity trail, and a log of every message we send them.
--
-- Conventions match the rest of the schema: uuid pks, timestamptz audit
-- columns, text + CHECK for enums, jsonb for flexible fields, RLS on with no
-- policies (server-only through the service role), table comments.

-- ---------------------------------------------------------------------------
-- Shared trigger (already exists from the blog migration; idempotent).
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- clients: the account.
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,

  business_name text not null,
  legal_name text,
  website_url text,
  primary_email text not null,
  primary_phone text,
  industry text,
  service_area text,
  timezone text not null default 'America/Toronto',
  address jsonb not null default '{}'::jsonb,

  -- Lifecycle. pending = paid/created but nobody has signed in yet.
  status text not null default 'pending'
    check (status in ('pending', 'onboarding', 'live', 'paused', 'churned')),

  -- Commercial. plan_id mirrors the tier id (convert / grow / lets-talk);
  -- subscriptions.client_id points back here for the Stripe record.
  plan_id text,
  stripe_customer_id text unique,

  -- The Tekmadev call that closed them, when we know it.
  lead_id uuid references public.leads (id) on delete set null,

  -- Guarantee terms are per client so custom deals are data, not code.
  guarantee_eligible boolean not null default false,
  guarantee_target integer not null default 30,
  guarantee_window_days integer not null default 60,
  guarantee_count_rule text not null default 'booked'
    check (guarantee_count_rule in ('booked', 'showed')),
  guarantee_status text not null default 'not_started'
    check (guarantee_status in ('not_started', 'running', 'met', 'extended', 'waived', 'not_eligible')),
  guarantee_started_at timestamptz,
  guarantee_met_at timestamptz,

  -- Milestones.
  live_at timestamptz,
  churned_at timestamptz,

  -- Ops.
  assigned_strategist text,
  internal_notes text,
  settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.clients is
  'Client accounts (one per paying business). Guarantee terms live per row. Server-only (RLS, no policies).';

create index if not exists clients_status_idx on public.clients (status) where deleted_at is null;
create index if not exists clients_plan_idx on public.clients (plan_id);
create index if not exists clients_primary_email_idx on public.clients (lower(primary_email));

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- Link Stripe records to the account.
alter table public.subscriptions
  add column if not exists client_id uuid references public.clients (id) on delete set null;
create index if not exists subscriptions_client_id_idx on public.subscriptions (client_id);

-- ---------------------------------------------------------------------------
-- client_members: people who can sign in to a client's portal.
-- ---------------------------------------------------------------------------
create table if not exists public.client_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email text not null,
  name text,
  title text,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  status text not null default 'invited'
    check (status in ('invited', 'active', 'disabled')),
  notifications jsonb not null default '{"email": true}'::jsonb,
  invited_by text,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, email)
);

comment on table public.client_members is
  'Portal users per client, backed by auth.users. A person may belong to several clients. Server-only (RLS, no policies).';

create index if not exists client_members_user_idx on public.client_members (user_id);
create index if not exists client_members_email_idx on public.client_members (lower(email));

drop trigger if exists client_members_set_updated_at on public.client_members;
create trigger client_members_set_updated_at
  before update on public.client_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_onboardings: one run per onboarding (initial, upgrade, re-onboarding).
-- ---------------------------------------------------------------------------
create table if not exists public.client_onboardings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null default 'initial'
    check (kind in ('initial', 'upgrade', 'reonboarding')),
  plan_id text,
  stage text not null default 'welcome'
    check (stage in ('welcome', 'intake', 'kickoff', 'build', 'review', 'go_live', 'optimizing', 'complete')),
  stage_entered_at timestamptz not null default now(),
  kickoff_at timestamptz,
  target_live_date date,
  live_at timestamptz,
  blocked boolean not null default false,
  blocked_reason text,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_onboardings is
  'Onboarding runs. A client can have several (initial, then an upgrade). Server-only (RLS, no policies).';

create index if not exists client_onboardings_client_idx on public.client_onboardings (client_id);
create index if not exists client_onboardings_stage_idx on public.client_onboardings (stage) where completed_at is null;

drop trigger if exists client_onboardings_set_updated_at on public.client_onboardings;
create trigger client_onboardings_set_updated_at
  before update on public.client_onboardings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- onboarding_task_templates: the master checklist (editable in the admin).
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_task_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text,
  -- Empty = every plan. Otherwise the tier ids this task applies to.
  plan_ids text[] not null default '{}'::text[],
  stage text not null
    check (stage in ('welcome', 'intake', 'kickoff', 'build', 'review', 'go_live', 'optimizing')),
  owner text not null default 'client'
    check (owner in ('client', 'tekmadev')),
  kind text not null default 'checklist'
    check (kind in ('form', 'upload', 'access_grant', 'approval', 'esign', 'call', 'internal', 'checklist')),
  required boolean not null default true,
  due_offset_days integer,
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_task_templates is
  'Master onboarding checklist. Instantiated into onboarding_tasks per run. Server-only (RLS, no policies).';

drop trigger if exists onboarding_task_templates_set_updated_at on public.onboarding_task_templates;
create trigger onboarding_task_templates_set_updated_at
  before update on public.onboarding_task_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- onboarding_tasks: the instantiated checklist per run.
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.client_onboardings (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  template_id uuid references public.onboarding_task_templates (id) on delete set null,
  key text not null,
  title text not null,
  description text,
  stage text not null
    check (stage in ('welcome', 'intake', 'kickoff', 'build', 'review', 'go_live', 'optimizing')),
  owner text not null default 'client'
    check (owner in ('client', 'tekmadev')),
  kind text not null default 'checklist'
    check (kind in ('form', 'upload', 'access_grant', 'approval', 'esign', 'call', 'internal', 'checklist')),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'waiting_on_client', 'done', 'skipped', 'blocked')),
  required boolean not null default true,
  sort_order integer not null default 0,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (onboarding_id, key)
);

comment on table public.onboarding_tasks is
  'Per-run onboarding checklist. Drives the portal tracker and the admin board. Server-only (RLS, no policies).';

create index if not exists onboarding_tasks_client_idx on public.onboarding_tasks (client_id);
create index if not exists onboarding_tasks_onboarding_idx on public.onboarding_tasks (onboarding_id, sort_order);
create index if not exists onboarding_tasks_open_idx on public.onboarding_tasks (owner, status) where status not in ('done', 'skipped');

drop trigger if exists onboarding_tasks_set_updated_at on public.onboarding_tasks;
create trigger onboarding_tasks_set_updated_at
  before update on public.onboarding_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_intakes: versioned intake answers.
-- ---------------------------------------------------------------------------
create table if not exists public.client_intakes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  onboarding_id uuid references public.client_onboardings (id) on delete set null,
  version integer not null default 1,
  schema_version text not null default '1',
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'reviewed')),
  submitted_at timestamptz,
  submitted_by text,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, version)
);

comment on table public.client_intakes is
  'Intake form answers as versioned JSON (schema_version tracks the form shape). Server-only (RLS, no policies).';

create index if not exists client_intakes_client_idx on public.client_intakes (client_id, version desc);

drop trigger if exists client_intakes_set_updated_at on public.client_intakes;
create trigger client_intakes_set_updated_at
  before update on public.client_intakes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_access_grants: delegated access registry. NEVER stores credentials.
-- ---------------------------------------------------------------------------
create table if not exists public.client_access_grants (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  task_id uuid references public.onboarding_tasks (id) on delete set null,
  provider text not null
    check (provider in (
      'google_business_profile', 'google_ads', 'google_analytics', 'google_search_console', 'google_tag_manager',
      'meta_business', 'meta_ads', 'instagram', 'tiktok_ads', 'linkedin',
      'domain_dns', 'website_hosting', 'phone_carrier', 'calendar', 'crm', 'email_provider', 'other'
    )),
  label text,
  account_identifier text,
  method text not null default 'partner_invite'
    check (method in ('partner_invite', 'manager_role', 'delegated', 'dns_records', 'api_connection', 'other')),
  status text not null default 'pending_client'
    check (status in ('requested', 'pending_client', 'client_says_done', 'granted', 'verified', 'revoked', 'not_applicable')),
  requested_at timestamptz not null default now(),
  client_marked_done_at timestamptz,
  granted_at timestamptz,
  verified_at timestamptz,
  verified_by text,
  revoked_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_access_grants is
  'Registry of delegated/partner access per client. Credentials are never stored here or anywhere. Server-only (RLS, no policies).';

create index if not exists client_access_grants_client_idx on public.client_access_grants (client_id);

drop trigger if exists client_access_grants_set_updated_at on public.client_access_grants;
create trigger client_access_grants_set_updated_at
  before update on public.client_access_grants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_assets: files in the private `client-assets` storage bucket.
-- ---------------------------------------------------------------------------
create table if not exists public.client_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  onboarding_id uuid references public.client_onboardings (id) on delete set null,
  task_id uuid references public.onboarding_tasks (id) on delete set null,
  kind text not null default 'other'
    check (kind in ('logo', 'photo', 'brand_guide', 'document', 'video', 'other')),
  bucket text not null default 'client-assets',
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  caption text,
  uploaded_by text,
  uploaded_by_type text not null default 'client'
    check (uploaded_by_type in ('client', 'admin', 'system')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.client_assets is
  'Uploaded client files (logo, photos, brand guide). Objects live in the private client-assets bucket. Server-only (RLS, no policies).';

create index if not exists client_assets_client_idx on public.client_assets (client_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- client_approvals: deliverables the client signs off on.
-- ---------------------------------------------------------------------------
create table if not exists public.client_approvals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  onboarding_id uuid references public.client_onboardings (id) on delete set null,
  task_id uuid references public.onboarding_tasks (id) on delete set null,
  kind text not null default 'other'
    check (kind in ('website', 'receptionist_script', 'ad_creative', 'landing_page', 'follow_up_sequence', 'social_content', 'other')),
  title text not null,
  description text,
  preview_url text,
  attachments jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'changes_requested', 'superseded')),
  requested_by text,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_approvals is
  'Versioned deliverable approvals (website, scripts, creative). Server-only (RLS, no policies).';

create index if not exists client_approvals_client_idx on public.client_approvals (client_id, status);

drop trigger if exists client_approvals_set_updated_at on public.client_approvals;
create trigger client_approvals_set_updated_at
  before update on public.client_approvals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_agreements: service agreement / order form acceptance records.
-- ---------------------------------------------------------------------------
create table if not exists public.client_agreements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  task_id uuid references public.onboarding_tasks (id) on delete set null,
  kind text not null default 'service_agreement'
    check (kind in ('service_agreement', 'order_form', 'guarantee_terms', 'dpa', 'other')),
  title text not null,
  version text not null,
  document_url text,
  content_hash text,
  status text not null default 'sent'
    check (status in ('draft', 'sent', 'viewed', 'signed', 'declined', 'expired', 'superseded')),
  signature_method text not null default 'click_accept'
    check (signature_method in ('click_accept', 'docusign', 'manual', 'other')),
  sent_at timestamptz not null default now(),
  viewed_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signer_email text,
  signer_title text,
  -- Acceptance evidence: user id, user agent, version hash, timestamp. No raw IP.
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_agreements is
  'Agreement acceptance records with click-accept evidence. Server-only (RLS, no policies).';

create index if not exists client_agreements_client_idx on public.client_agreements (client_id, status);

drop trigger if exists client_agreements_set_updated_at on public.client_agreements;
create trigger client_agreements_set_updated_at
  before update on public.client_agreements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_booked_calls: the guarantee counter.
-- ---------------------------------------------------------------------------
create table if not exists public.client_booked_calls (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  external_id text,
  source text not null default 'manual'
    check (source in ('receptionist', 'web_form', 'calendar', 'missed_call_textback', 'ads', 'chat', 'manual', 'import', 'other')),
  contact_name text,
  contact_phone text,
  contact_email text,
  service_requested text,
  booked_at timestamptz not null default now(),
  booked_for timestamptz,
  status text not null default 'booked'
    check (status in ('booked', 'confirmed', 'showed', 'no_show', 'cancelled', 'rescheduled')),
  qualified boolean not null default true,
  disqualified_reason text
    check (disqualified_reason is null or disqualified_reason in ('spam', 'duplicate', 'out_of_area', 'wrong_service', 'fake', 'other')),
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, external_id)
);

comment on table public.client_booked_calls is
  'Every booked call per client, with qualification. Source of truth for the 30-in-60 guarantee. Server-only (RLS, no policies).';

create index if not exists client_booked_calls_client_idx on public.client_booked_calls (client_id, booked_at desc);

drop trigger if exists client_booked_calls_set_updated_at on public.client_booked_calls;
create trigger client_booked_calls_set_updated_at
  before update on public.client_booked_calls
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_activity: immutable timeline.
-- ---------------------------------------------------------------------------
create table if not exists public.client_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  actor_type text not null default 'system'
    check (actor_type in ('client', 'admin', 'system')),
  actor_email text,
  event text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  -- client = shown in the portal timeline; internal = admin only.
  visibility text not null default 'internal'
    check (visibility in ('internal', 'client')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.client_activity is
  'Append-only audit trail per client (stage changes, tasks, approvals, access, invites). Server-only (RLS, no policies).';

create index if not exists client_activity_client_idx on public.client_activity (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- client_notifications: every message we send a client (or show in-app).
-- ---------------------------------------------------------------------------
create table if not exists public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  member_id uuid references public.client_members (id) on delete set null,
  channel text not null default 'in_app'
    check (channel in ('email', 'sms', 'in_app')),
  template_key text,
  subject text,
  body text,
  action_url text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'failed', 'read')),
  provider text,
  provider_message_id text,
  error text,
  sent_at timestamptz,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.client_notifications is
  'Log of client-facing messages (email/SMS/in-app) with delivery status. Server-only (RLS, no policies).';

create index if not exists client_notifications_client_idx on public.client_notifications (client_id, created_at desc);
create index if not exists client_notifications_unread_idx on public.client_notifications (member_id) where channel = 'in_app' and read_at is null;

-- ---------------------------------------------------------------------------
-- RLS: on, no policies. All access is through the service role on the server.
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.client_onboardings enable row level security;
alter table public.onboarding_task_templates enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.client_intakes enable row level security;
alter table public.client_access_grants enable row level security;
alter table public.client_assets enable row level security;
alter table public.client_approvals enable row level security;
alter table public.client_agreements enable row level security;
alter table public.client_booked_calls enable row level security;
alter table public.client_activity enable row level security;
alter table public.client_notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for client uploads (50 MB per object).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-assets', 'client-assets', false, 52428800)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: the default onboarding checklist. Edit in the admin, not here.
-- ---------------------------------------------------------------------------
insert into public.onboarding_task_templates
  (key, title, description, plan_ids, stage, owner, kind, required, due_offset_days, sort_order, payload)
values
  -- Welcome (day 0)
  ('welcome.sign_agreement', 'Review and accept your service agreement',
   'Locks in what we deliver, what counts as a booked call, and when your guarantee clock starts.',
   '{}', 'welcome', 'client', 'esign', true, 1, 10, '{"agreement_kind":"service_agreement"}'),
  ('welcome.book_kickoff', 'Book your kickoff call',
   'A 45-minute working session. We walk your business, present the audit, and set everything up live.',
   '{}', 'welcome', 'client', 'call', true, 2, 20, '{}'),

  -- Intake (day 0-1)
  ('intake.business_profile', 'Tell us about your business',
   'Your services, your ideal customer, your service area, hours, and how leads reach you today.',
   '{}', 'intake', 'client', 'form', true, 2, 10, '{"form":"intake"}'),
  ('intake.brand_assets', 'Upload your logo and photos',
   'Your logo, a few photos of your team and your work, and any brand guide you have.',
   '{}', 'intake', 'client', 'upload', true, 3, 20, '{"kinds":["logo","photo","brand_guide"]}'),
  ('intake.access_gbp', 'Give us manager access to your Google Business Profile',
   'We manage it for you. You stay the owner, we get added as a manager.',
   '{}', 'intake', 'client', 'access_grant', true, 3, 30, '{"provider":"google_business_profile"}'),
  ('intake.access_domain', 'Domain access for your website',
   'We point your domain at your new site. A few DNS records, or delegated access if you prefer.',
   '{}', 'intake', 'client', 'access_grant', true, 3, 40, '{"provider":"domain_dns"}'),
  ('intake.access_meta', 'Meta Business partner access',
   'Lets us run your Facebook and Instagram ads from our agency account. You keep ownership.',
   '{grow,lets-talk}', 'intake', 'client', 'access_grant', true, 3, 50, '{"provider":"meta_business"}'),
  ('intake.access_google_ads', 'Google Ads manager access',
   'Lets us run your Google Ads from our manager account. You keep ownership.',
   '{grow,lets-talk}', 'intake', 'client', 'access_grant', true, 3, 60, '{"provider":"google_ads"}'),

  -- Kickoff (day 1-3)
  ('kickoff.call', 'Kickoff call and audit readout',
   'Discovery, audit results, the offer we will run, brand voice, and live access setup.',
   '{}', 'kickoff', 'tekmadev', 'call', true, 3, 10, '{}'),
  ('kickoff.quick_win', 'Turn on missed-call text-back',
   'Every missed call gets an instant text reply from day two, before the full build is live.',
   '{}', 'kickoff', 'tekmadev', 'internal', true, 2, 20, '{}'),
  ('kickoff.summary', 'Send the written kickoff summary',
   'Scope, booked-call definition, target go-live date, and the client to-do list.',
   '{}', 'kickoff', 'tekmadev', 'internal', true, 3, 30, '{}'),

  -- Build (day 3-10)
  ('build.website', 'Build the website (SEO and AI search ready)', null, '{}', 'build', 'tekmadev', 'internal', true, 8, 10, '{}'),
  ('build.receptionist', 'Script and train the AI receptionist', null, '{}', 'build', 'tekmadev', 'internal', true, 7, 20, '{}'),
  ('build.crm_pipeline', 'Set up the CRM, inbox, and pipeline board', null, '{}', 'build', 'tekmadev', 'internal', true, 6, 30, '{}'),
  ('build.follow_up', 'Build the 12-touch follow-up sequence', null, '{}', 'build', 'tekmadev', 'internal', true, 7, 40, '{}'),
  ('build.booking_calendar', 'Connect the booking calendar', null, '{}', 'build', 'tekmadev', 'internal', true, 6, 50, '{}'),
  ('build.review_automation', 'Set up review requests', null, '{}', 'build', 'tekmadev', 'internal', true, 8, 60, '{}'),
  ('build.dashboard', 'Configure the client dashboard and attribution', null, '{}', 'build', 'tekmadev', 'internal', true, 9, 70, '{}'),
  ('build.ads', 'Build Google and Meta ad campaigns', null, '{grow,lets-talk}', 'build', 'tekmadev', 'internal', true, 9, 80, '{}'),
  ('build.funnels', 'Build funnels and landing pages', null, '{grow,lets-talk}', 'build', 'tekmadev', 'internal', true, 9, 90, '{}'),
  ('build.social', 'Set up social posting', null, '{grow,lets-talk}', 'build', 'tekmadev', 'internal', true, 9, 100, '{}'),
  ('build.email_sms', 'Build email and SMS campaigns', null, '{grow,lets-talk}', 'build', 'tekmadev', 'internal', true, 9, 110, '{}'),
  ('build.payments', 'Set up payments and invoicing', null, '{grow,lets-talk}', 'build', 'tekmadev', 'internal', false, 10, 120, '{}'),
  ('build.mid_checkpoint', 'Mid-build checkpoint with the client',
   'A short call or loom so nothing is a surprise at review.',
   '{}', 'build', 'tekmadev', 'call', true, 7, 130, '{}'),

  -- Review (day 10-12)
  ('review.website', 'Approve your website', 'Copy, design, and the pages we built.', '{}', 'review', 'client', 'approval', true, 11, 10, '{"approval_kind":"website"}'),
  ('review.receptionist', 'Approve your AI receptionist', 'How it greets, qualifies, and books.', '{}', 'review', 'client', 'approval', true, 11, 20, '{"approval_kind":"receptionist_script"}'),
  ('review.ads', 'Approve your ad creative', null, '{grow,lets-talk}', 'review', 'client', 'approval', true, 11, 30, '{"approval_kind":"ad_creative"}'),
  ('review.live_test', 'Full live test',
   'Place a real call, book a test appointment, confirm follow-ups fire and land in the pipeline.',
   '{}', 'review', 'tekmadev', 'internal', true, 12, 40, '{}'),

  -- Go live (day 12-14)
  ('go_live.publish', 'Point DNS and publish the website', null, '{}', 'go_live', 'tekmadev', 'internal', true, 13, 10, '{}'),
  ('go_live.switch_on', 'Switch everything on', 'Receptionist live, follow-ups on, ads on for Grow.', '{}', 'go_live', 'tekmadev', 'internal', true, 14, 20, '{}'),
  ('go_live.training', 'Dashboard and closing training',
   'How to work the pipeline and close the booked calls we are about to send.',
   '{}', 'go_live', 'tekmadev', 'call', true, 14, 30, '{}'),
  ('go_live.clock_start', 'Confirm the go-live date in writing',
   'The guarantee clock starts today. Recorded on the account.',
   '{}', 'go_live', 'tekmadev', 'internal', true, 14, 40, '{}'),

  -- Optimizing (day 14-74)
  ('optimizing.weekly_checkins', 'Weekly check-ins scheduled', null, '{}', 'optimizing', 'tekmadev', 'call', true, 21, 10, '{}'),
  ('optimizing.pace_review', 'Guarantee pace review at day 30', 'Escalate if behind pace on booked calls.', '{}', 'optimizing', 'tekmadev', 'internal', true, 44, 20, '{}')
on conflict (key) do nothing;
