-- Site settings: the few switches the owner flips from the admin, not from code.
--
-- First use: whether checkout charges GST/HST. Stripe Tax can be ready in the
-- Stripe account (it is shared with another project) long before the owner
-- decides THIS site should start adding tax to what buyers pay, so the decision
-- is recorded here, per mode, with who made it and when.
--
-- Service role only, like every other table: RLS on, no policies.

create table if not exists public.site_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;

comment on table public.site_settings is 'Owner-controlled switches read by the site at request time. One row per setting.';

-- Off in both modes until the owner turns it on.
insert into public.site_settings (key, value, updated_by)
values ('sales_tax', '{"live": false, "test": false}'::jsonb, 'migration')
on conflict (key) do nothing;
