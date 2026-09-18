-- Stripe test mode, side by side with live.
--
-- The site runs on live Stripe keys. To rehearse a real purchase end to end
-- (checkout, webhook, portal account, onboarding, care plan, billing portal)
-- without moving money, an admin can switch their own browser into test mode,
-- which uses a Stripe sandbox. Everything a sandbox purchase creates is
-- stamped here, so it can never be mistaken for revenue and can be purged.
--
-- Defaults keep every existing row exactly what it was: live.

-- A Stripe id only exists in the mode that created it, so the sandbox catalog
-- gets its own columns instead of overwriting the live ids. (Going live in June
-- overwrote the test ids in place, which is why test mode stopped working.)
alter table public.products
  add column if not exists stripe_test_product_id text,
  add column if not exists stripe_test_price_id text,
  add column if not exists stripe_test_monthly_product_id text,
  add column if not exists stripe_test_monthly_price_id text;

comment on column public.products.stripe_test_price_id is
  'The one-time price in the Stripe sandbox. Live ids and sandbox ids never share a column: an id from one mode does not exist in the other.';
alter table public.orders add column if not exists livemode boolean not null default true;
alter table public.subscriptions add column if not exists livemode boolean not null default true;
alter table public.clients add column if not exists is_test boolean not null default false;

comment on column public.orders.livemode is
  'Copied from Stripe''s own livemode flag on the verified webhook event. False means a sandbox purchase: never revenue.';
comment on column public.subscriptions.livemode is
  'Copied from Stripe''s own livemode flag. False means a sandbox subscription: never counted as active revenue.';
comment on column public.clients.is_test is
  'True for an account created by a sandbox purchase. Every Stripe call for this client uses the sandbox key, and a purge removes it.';

create index if not exists orders_test_idx on public.orders (created_at desc) where not livemode;
create index if not exists subscriptions_test_idx on public.subscriptions (created_at desc) where not livemode;
create index if not exists clients_test_idx on public.clients (created_at desc) where is_test;
