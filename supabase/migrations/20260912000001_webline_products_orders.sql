-- ===========================================================================
-- Webline: one-time products, orders, and the website-only onboarding path.
--
-- * products: fixed-scope offers paid once at checkout (Webline). Prices are
--   edited in the admin and mirrored to Stripe, like `plans`.
-- * orders: one-time purchases from Stripe Checkout (mode = payment), kept in
--   step with refunds and disputes by the webhook. `subscriptions` stays the
--   record for recurring plans.
-- * onboarding_task_templates: the growth-system-only tasks are scoped to the
--   three subscription tiers, and a Webline checklist is added. An empty
--   plan_ids still means "every plan".
--
-- Conventions: uuid pks, timestamptz audit columns, text + CHECK enums, jsonb
-- for provider payloads, RLS on with no policies (server-only via service role).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id text primary key,
  name text not null,
  currency text not null default 'cad',
  -- Cents, charged once at checkout.
  amount integer not null default 0 check (amount >= 0),
  -- Optional anchor ("typical price") shown struck through on the sales page.
  compare_at_amount integer check (compare_at_amount is null or compare_at_amount >= 0),
  stripe_product_id text,
  stripe_price_id text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.products is
  'One-time, fixed-scope offers (e.g. Webline). Metadata lives in config/products.ts; this row holds the live price and Stripe ids. Server-only (RLS, no policies).';

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

insert into public.products (id, name, currency, amount, sort_order)
values ('webline', 'Webline', 'cad', 79700, 10)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id text references public.products (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,

  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  stripe_invoice_id text,

  email text,
  name text,
  phone text,
  business_name text,

  -- pending = session completed but payment still processing (async methods).
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed')),

  amount_subtotal integer,
  amount_discount integer,
  amount_tax integer,
  amount_total integer,
  amount_refunded integer not null default 0,
  currency text,

  -- card, klarna, afterpay_clearpay, affirm, link, ... as reported by Stripe.
  payment_method_type text,
  promotion_code text,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  click_ids jsonb,

  paid_at timestamptz,
  refunded_at timestamptz,
  raw jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is
  'One-time purchases from Stripe Checkout (payment mode). Written by the Stripe webhook; refunds and disputes update status. Server-only (RLS, no policies).';

create index if not exists orders_client_id_idx on public.orders (client_id);
create index if not exists orders_email_idx on public.orders (lower(email));
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_stripe_customer_idx on public.orders (stripe_customer_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

-- ---------------------------------------------------------------------------
-- Onboarding templates: scope growth-system tasks, add the Webline checklist.
-- ---------------------------------------------------------------------------

-- Tasks that only make sense for the growth system (calls, receptionist,
-- pipeline, ads, guarantee clock). Universal website tasks keep plan_ids = {}.
update public.onboarding_task_templates
set plan_ids = '{convert,grow,lets-talk}'::text[]
where plan_ids = '{}'::text[]
  and key in (
    'welcome.sign_agreement',
    'welcome.book_kickoff',
    'intake.access_gbp',
    'kickoff.call',
    'kickoff.quick_win',
    'kickoff.summary',
    'build.receptionist',
    'build.crm_pipeline',
    'build.follow_up',
    'build.booking_calendar',
    'build.review_automation',
    'build.dashboard',
    'build.mid_checkpoint',
    'review.receptionist',
    'review.live_test',
    'go_live.switch_on',
    'go_live.training',
    'go_live.clock_start',
    'optimizing.weekly_checkins',
    'optimizing.pace_review'
  );

insert into public.onboarding_task_templates
  (key, title, description, plan_ids, stage, owner, kind, required, due_offset_days, sort_order, payload)
values
  ('webline.welcome.sign_agreement', 'Review and accept your Webline agreement',
   'What we build, what you get, and when it goes live. Two minutes.',
   '{webline}', 'welcome', 'client', 'esign', true, 1, 10, '{"agreement_kind":"webline_agreement"}'),
  ('webline.intake.brief_call', 'Book a 20-minute design brief (optional)',
   'Skip it if the form said it all. Book it if you would rather talk it through.',
   '{webline}', 'intake', 'client', 'call', false, 3, 50, '{}'),
  ('webline.build.copywriting', 'Write your site copy',
   'Headlines, service pages, and FAQ, written from your intake.',
   '{webline}', 'build', 'tekmadev', 'internal', true, 6, 5, '{}'),
  ('webline.build.design_concept', 'Approve your homepage design concept',
   'You see the homepage by day 5. Love it, or tell us exactly what to change.',
   '{webline}', 'build', 'client', 'approval', true, 6, 15, '{"approval_kind":"website"}'),
  ('webline.build.seo_foundation', 'Set up SEO, GEO, and AEO foundations',
   'Metadata, schema markup, sitemap, llms.txt, FAQ markup, Search Console.',
   '{webline}', 'build', 'tekmadev', 'internal', true, 9, 25, '{}'),
  ('webline.go_live.search_submit', 'Submit to Google and Bing',
   'Sitemap submitted, indexing requested, Google Business Profile linked.',
   '{webline}', 'go_live', 'tekmadev', 'internal', true, 14, 30, '{}'),
  ('webline.go_live.handoff', 'Walkthrough video and handoff',
   'A short video of where everything lives and how to edit it. You own all of it.',
   '{webline}', 'go_live', 'tekmadev', 'internal', true, 14, 40, '{}')
on conflict (key) do nothing;
