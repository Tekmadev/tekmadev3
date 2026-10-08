-- Demo requests (owner request 2026-10-05, docs/admin-api/demos.md).
--
-- Salespeople (staff) find clients through outreach, ads and face to face.
-- Some want to see a demo website first, mostly for Webline. A salesperson
-- asks for one with the business details, an owner or manager builds it and
-- adds the link, and the salesperson shows it to the client:
--
--   requested -> building -> ready -> shown      (ready -> building: rework)
--   requested | building | ready -> cancelled    (shown and cancelled are closed)
--
--   demo_requests        one row per request, for a client or a lead (or both:
--                        when a lead becomes a client its requests get the
--                        client id and keep the lead id)
--   demo_request_events  who did what and when: created, edited, status,
--                        builder, link (oldest first by id)
--
-- The admin API (lib/admin-api/demos) is the only reader and writer, through
-- the service role, for the app and the web admin alike. Who may do what is
-- in lib/admin-api/permissions.ts (demos.view, demos.request, demos.manage).
--
-- client_id follows the client: a client is only ever trashed (deleted_at),
-- but the test data purge really deletes test clients, and their demo
-- requests go with them, like every other table that belongs to a client.
-- lead_id is set null when a lead is deleted, which the target check refuses
-- for a request that only has the lead: cancel or move that request first.
--
-- Additive only: two new tables, their indexes and their updated_at trigger.
-- Nothing existing changes. Safe to run twice. RLS is on with no policies
-- (service role only), like every other table.

do $$
begin
  if to_regclass('public.clients') is null then
    raise exception 'public.clients does not exist: apply 20260910000001_client_portal_schema.sql first';
  end if;
  if to_regclass('public.leads') is null then
    raise exception 'public.leads does not exist: create the leads table first';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'public.set_updated_at() does not exist: apply 20260905000001_blog_schema.sql first';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Requests
-- ---------------------------------------------------------------------------

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'requested'
    check (status in ('requested', 'building', 'ready', 'shown', 'cancelled')),

  -- Who the demo is for. At least one is set (demo_requests_target).
  client_id uuid references public.clients (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,

  -- The business, as the salesperson typed it.
  business_name text not null check (char_length(btrim(business_name)) between 1 and 120),
  -- Kind of business: "Plumber", "Hair salon".
  business_type text not null check (char_length(btrim(business_type)) between 1 and 80),
  -- City or area served.
  area text not null check (char_length(btrim(area)) between 1 and 120),
  -- What they sell or do.
  offer text not null check (char_length(btrim(offer)) between 1 and 1000),
  -- Current website or social links, free text.
  website text check (website is null or char_length(website) <= 500),
  -- Logo and brand colours, free text.
  brand text check (brand is null or char_length(brand) <= 500),
  -- Who their customers are.
  customers text check (customers is null or char_length(customers) <= 500),
  -- What the client wants to see in the demo.
  wants text check (wants is null or char_length(wants) <= 2000),
  -- When it is needed (a Toronto calendar date).
  needed_by date,

  -- The builder's side.
  demo_url text check (demo_url is null or (char_length(demo_url) <= 2000 and demo_url ~* '^https://[^[:space:]]+$')),
  -- Lowercased email of the team member building it. No foreign key: the
  -- record stays when someone leaves the team.
  builder_email text check (builder_email is null or (builder_email = lower(btrim(builder_email)) and builder_email <> '')),
  -- Note from the builder to the salesperson.
  builder_note text check (builder_note is null or char_length(builder_note) <= 1000),

  -- Lowercased email of the team member who asked.
  requested_by text not null check (requested_by = lower(btrim(requested_by)) and requested_by <> ''),
  -- For a test client: hidden from roles without test data, like the client.
  is_test boolean not null default false,
  -- sha256 of the create request, so a retry with the same idempotency key
  -- and a different body is refused instead of answered with this row.
  request_hash text check (request_hash is null or char_length(request_hash) <= 128),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- When it last became ready, was shown, was cancelled.
  ready_at timestamptz,
  shown_at timestamptz,
  cancelled_at timestamptz,

  constraint demo_requests_target check (client_id is not null or lead_id is not null),
  -- A ready or shown demo always has its link.
  constraint demo_requests_link check (status not in ('ready', 'shown') or demo_url is not null)
);

-- The list: newest first, filtered by status, by who asked, by client or lead.
create index if not exists demo_requests_created_idx on public.demo_requests (created_at desc, id desc);
create index if not exists demo_requests_status_idx on public.demo_requests (status, created_at desc);
create index if not exists demo_requests_requested_by_idx on public.demo_requests (requested_by, created_at desc);
create index if not exists demo_requests_client_idx on public.demo_requests (client_id, created_at desc) where client_id is not null;
create index if not exists demo_requests_lead_idx on public.demo_requests (lead_id, created_at desc) where lead_id is not null;

drop trigger if exists demo_requests_set_updated_at on public.demo_requests;
create trigger demo_requests_set_updated_at
  before update on public.demo_requests
  for each row execute function public.set_updated_at();

alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from anon, authenticated;

comment on table public.demo_requests is
  'Demo website requests: a salesperson asks for a demo for a client or a lead, an owner or manager builds it, the salesperson shows it. Written by the admin API (lib/admin-api/demos). Server only (RLS, no policies).';
comment on column public.demo_requests.lead_id is
  'The lead it was asked for. When the lead becomes a client, client_id is filled in and lead_id stays.';

-- ---------------------------------------------------------------------------
-- 2. History
-- ---------------------------------------------------------------------------

create table if not exists public.demo_request_events (
  -- Identity, so events written in the same moment keep their order.
  id bigint generated always as identity primary key,
  demo_id uuid not null references public.demo_requests (id) on delete cascade,
  type text not null check (type in ('created', 'edited', 'status', 'builder', 'link')),
  -- Lowercased email of who did it.
  by_email text not null check (by_email = lower(btrim(by_email)) and by_email <> ''),
  -- Before and after: the status, the builder's email or the demo link. Null for created and edited.
  from_value text check (from_value is null or char_length(from_value) <= 2000),
  to_value text check (to_value is null or char_length(to_value) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists demo_request_events_demo_idx on public.demo_request_events (demo_id, id);

alter table public.demo_request_events enable row level security;
revoke all on public.demo_request_events from anon, authenticated;

comment on table public.demo_request_events is
  'What happened to a demo request and who did it (created, edited, status, builder, link). Server only (RLS, no policies).';
