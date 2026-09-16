-- ===========================================================================
-- Lead magnets.
--
-- One table behind every gated tool, calculator and download on the site.
-- A magnet is identified by its slug; config/lead-magnets.ts owns the copy and
-- lib/<magnet>.ts owns the maths. What someone answered and what we showed
-- them are kept as jsonb, so adding the next magnet needs no migration.
--
-- `score` is the single number worth ranking on, normalized per magnet (for
-- the revenue leak calculator: dollars leaking per month), so the admin can
-- sort the hottest leads without digging through jsonb.
--
-- Consent is recorded per submission, not inferred. Asking for a report is an
-- inquiry; joining the newsletter is a separate, explicit opt-in, and
-- consent_marketing is the record of which one happened.
-- ===========================================================================

create table if not exists public.lead_magnet_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Which magnet, as a slug from config/lead-magnets.ts.
  magnet text not null,

  -- Who.
  email text not null,
  name text,
  company text,
  phone text,

  -- What they told us and what we told them.
  answers jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  score numeric,

  -- Consent trail.
  consent_marketing boolean not null default false,
  consent_policy_version text,

  -- Attribution, same shape as public.subscribers.
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  country text,
  device text,

  -- Downstream delivery.
  ghl_synced_at timestamptz,
  emailed_at timestamptz,
  lead_id uuid references public.leads (id) on delete set null
);

comment on table public.lead_magnet_submissions is
  'Every gated tool or download submission. One row per submit, including repeat submits by the same person: the sequence of answers is itself signal.';
comment on column public.lead_magnet_submissions.magnet is
  'Slug of the lead magnet, from config/lead-magnets.ts. Deliberately unconstrained so a new magnet ships without a migration.';
comment on column public.lead_magnet_submissions.score is
  'The one number worth ranking on, normalized per magnet. Revenue leak calculator: dollars leaking per month.';
comment on column public.lead_magnet_submissions.consent_marketing is
  'True only when the person explicitly ticked the newsletter opt-in. Requesting the report itself is an inquiry, not consent to ongoing marketing.';

create index if not exists lead_magnet_submissions_magnet_idx
  on public.lead_magnet_submissions (magnet, created_at desc);
create index if not exists lead_magnet_submissions_email_idx
  on public.lead_magnet_submissions (lower(email));
create index if not exists lead_magnet_submissions_score_idx
  on public.lead_magnet_submissions (score desc nulls last);

-- Service-role only, like every other operational table here. No policies, so
-- anon and authenticated clients can read nothing.
alter table public.lead_magnet_submissions enable row level security;
