-- ===========================================================================
-- Self-serve portal accounts.
--
-- Anyone can create a portal account (email + password, or Google) before
-- paying. They exist as a client with status = 'lead' and a `leads` row
-- (source = 'portal_signup') so the funnel view stays in one place. A paid
-- checkout later finds the same account (client_reference_id, Stripe
-- customer, or email) and turns it into an onboarding automatically.
-- ===========================================================================

alter table public.clients drop constraint if exists clients_status_check;
alter table public.clients
  add constraint clients_status_check
  check (status in ('lead', 'pending', 'onboarding', 'live', 'paused', 'churned'));

-- How the account came to exist.
alter table public.clients
  add column if not exists source text not null default 'admin'
    check (source in ('admin', 'stripe', 'self_serve', 'import'));

comment on column public.clients.source is
  'How the account came to exist: admin (added by staff), stripe (paid checkout), self_serve (signed up on the portal), import.';

update public.clients set source = 'stripe' where created_by = 'system' and source = 'admin';

create index if not exists clients_source_idx on public.clients (source);
create index if not exists leads_email_idx on public.leads (lower(email));
