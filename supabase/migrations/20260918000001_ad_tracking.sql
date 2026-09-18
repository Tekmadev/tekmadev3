-- Advertising conversion tracking (Meta), consent-gated.
--
-- The public site shows a cookie banner. Nothing below is written for a
-- visitor who declines: no context row, so no server-side conversion either.
--
-- ad_contexts holds what a later server-side event needs to be attributed to
-- an ad click: the platform's own browser ids, plus IP and user agent. A Cal
-- or Stripe webhook has no browser, so it looks the context up instead of
-- carrying these values through third-party metadata.

create table if not exists public.ad_contexts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  platform text not null default 'meta' check (platform in ('meta')),
  consent_marketing boolean not null default true,
  consent_version text,
  fbp text,
  fbc text,
  client_ip text,
  client_user_agent text,
  landing_url text,
  country text,
  booking_uid text
);

comment on table public.ad_contexts is
  'Browser context of a visitor who accepted advertising cookies: the ad platform ids, IP and user agent needed to attribute a later server-side conversion. A row exists only with consent. Purged after 90 days.';
comment on column public.ad_contexts.booking_uid is
  'Set by the browser when a Cal booking completes, so the Cal webhook can find the context for that booking.';

create index if not exists ad_contexts_created_at_idx on public.ad_contexts (created_at);
create unique index if not exists ad_contexts_booking_uid_idx on public.ad_contexts (booking_uid) where booking_uid is not null;

alter table public.ad_contexts enable row level security;

-- One row per conversion we tried to report, with the outcome, so "did Meta
-- get that booking?" has an answer. The unique index is our own guard against
-- reporting the same conversion twice.

create table if not exists public.ad_conversion_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  platform text not null default 'meta' check (platform in ('meta')),
  event_name text not null,
  event_id text not null,
  context_id uuid references public.ad_contexts (id) on delete set null,
  matched_on text[] not null default '{}',
  value numeric,
  currency text,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  http_status integer,
  response jsonb,
  is_test boolean not null default false
);

comment on table public.ad_conversion_events is
  'One row per conversion we tried to report to an ad platform from the server, with the outcome. No contact details are stored here: matched_on lists which identifier types were sent (em, ph, fbp, fbc), never their values.';

create unique index if not exists ad_conversion_events_dedupe_idx
  on public.ad_conversion_events (platform, event_name, event_id);
create index if not exists ad_conversion_events_created_at_idx on public.ad_conversion_events (created_at desc);

alter table public.ad_conversion_events enable row level security;
