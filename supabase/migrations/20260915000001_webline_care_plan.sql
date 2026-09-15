-- Webline Care: the required monthly hosting and maintenance plan that comes
-- with every Webline site.
--
-- Why it is a separate step and not part of the Webline checkout: Afterpay and
-- Affirm do not support subscriptions at all, and Klarna in Canada offers pay
-- in 4 on one-time payments only. A single checkout with a recurring line
-- would remove the pay-in-4 option that sells Webline. So the buyer pays the
-- one-time fee first (pay-in-4 intact), then adds a card for Webline Care in
-- the portal. Nothing is charged at that point: the first monthly charge lands
-- `monthly_trial_days` after the original purchase. The site does not go live
-- until the plan is set.

-- ---------------------------------------------------------------------------
-- products: the monthly plan's live price, next to the one-time price
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists monthly_amount integer
    check (monthly_amount is null or monthly_amount >= 0),
  add column if not exists monthly_trial_days integer not null default 30
    check (monthly_trial_days between 1 and 365),
  add column if not exists stripe_monthly_product_id text,
  add column if not exists stripe_monthly_price_id text;

comment on column public.products.monthly_amount is
  'Cents per month for the required care plan. Null means the product has no monthly plan.';
comment on column public.products.monthly_trial_days is
  'Days after the one-time purchase before the first monthly charge.';
comment on column public.products.stripe_monthly_product_id is
  'Stripe product for the care plan, kept separate from the one-time product so receipts and coupons stay distinct.';
comment on column public.products.stripe_monthly_price_id is
  'Current recurring Stripe price. Replaced (and the old one archived) when the monthly amount changes.';

update public.products set monthly_amount = 7700 where id = 'webline' and monthly_amount is null;

-- ---------------------------------------------------------------------------
-- subscriptions: tell a growth plan apart from a product's care plan
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists kind text not null default 'plan'
    check (kind in ('plan', 'care')),
  add column if not exists product_id text references public.products (id);

comment on column public.subscriptions.kind is
  'plan = a growth tier (Convert, Grow). care = the monthly plan attached to a one-time product (Webline Care).';
comment on column public.subscriptions.product_id is
  'For kind = care, the one-time product the plan belongs to.';

create index if not exists subscriptions_client_kind_idx on public.subscriptions (client_id, kind);

-- ---------------------------------------------------------------------------
-- onboarding: a `billing` task kind, and the Webline Care step
-- ---------------------------------------------------------------------------

alter table public.onboarding_task_templates drop constraint if exists onboarding_task_templates_kind_check;
alter table public.onboarding_task_templates add constraint onboarding_task_templates_kind_check
  check (kind in ('form', 'upload', 'access_grant', 'approval', 'esign', 'call', 'internal', 'checklist', 'billing'));

alter table public.onboarding_tasks drop constraint if exists onboarding_tasks_kind_check;
alter table public.onboarding_tasks add constraint onboarding_tasks_kind_check
  check (kind in ('form', 'upload', 'access_grant', 'approval', 'esign', 'call', 'internal', 'checklist', 'billing'));

-- Day 0, next to the agreement: the buyer is most motivated right after paying.
-- The description names no price, because the price is edited in the admin.
insert into public.onboarding_task_templates
  (key, title, description, plan_ids, stage, owner, kind, required, due_offset_days, sort_order, payload)
values
  ('webline.welcome.care_plan', 'Set up your hosting and care plan',
   'Add the card for your monthly hosting and care. Nothing is charged today: the first charge lands 30 days after your purchase. Your site goes live once this is set.',
   '{webline}', 'welcome', 'client', 'billing', true, 2, 12, '{"product_id":"webline"}')
on conflict (key) do nothing;

-- Webline runs already in progress get the step too, so no live build slips
-- through without a plan.
insert into public.onboarding_tasks
  (onboarding_id, client_id, template_id, key, title, description, stage, owner, kind, required, sort_order, due_at, payload)
select o.id, o.client_id, t.id, t.key, t.title, t.description, t.stage, t.owner, t.kind, t.required, t.sort_order,
       now() + interval '2 days', t.payload
from public.client_onboardings o
join public.onboarding_task_templates t on t.key = 'webline.welcome.care_plan'
where o.plan_id = 'webline'
  and o.completed_at is null
  and not exists (
    select 1 from public.onboarding_tasks x where x.onboarding_id = o.id and x.key = 'webline.welcome.care_plan'
  );
