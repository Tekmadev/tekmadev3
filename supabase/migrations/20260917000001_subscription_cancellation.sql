-- Cancellation state on subscriptions, written by the Stripe webhook.
--
-- The customer portal cancels at period end, so a cancelled plan stays
-- `active` in Stripe until the paid period runs out. Until now the portal and
-- the admin showed such a plan as if it would renew. The truth was in `raw`,
-- but nothing should have to dig through Stripe's payload to answer "is this
-- ending, and when".

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancel_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_feedback text,
  add column if not exists cancellation_comment text;

comment on column public.subscriptions.cancel_at_period_end is
  'True while the plan is scheduled to end when the paid period does. Status stays active until then.';
comment on column public.subscriptions.cancel_at is
  'When the plan ends, if a specific end has been scheduled (Stripe cancel_at).';
comment on column public.subscriptions.canceled_at is
  'When the cancellation was requested, not when the plan ends.';
comment on column public.subscriptions.ended_at is
  'When the plan actually stopped, if it has.';
comment on column public.subscriptions.cancellation_reason is
  'Why Stripe ended it: cancellation_requested, payment_failed, payment_disputed, canceled_by_retention_policy.';
comment on column public.subscriptions.cancellation_feedback is
  'The option the customer picked in the portal: too_expensive, missing_features, switched_service, unused, customer_service, too_complex, low_quality, other.';
comment on column public.subscriptions.cancellation_comment is
  'Free text the customer left when cancelling, if any.';

create index if not exists subscriptions_ending_idx
  on public.subscriptions (cancel_at_period_end, current_period_end)
  where cancel_at_period_end;

-- Backfill from the stored Stripe payload so existing rows are right on day one.
update public.subscriptions
set
  cancel_at_period_end = coalesce((raw ->> 'cancel_at_period_end')::boolean, false),
  cancel_at = to_timestamp((raw ->> 'cancel_at')::bigint),
  canceled_at = to_timestamp((raw ->> 'canceled_at')::bigint),
  ended_at = to_timestamp((raw ->> 'ended_at')::bigint),
  cancellation_reason = raw -> 'cancellation_details' ->> 'reason',
  cancellation_feedback = raw -> 'cancellation_details' ->> 'feedback',
  cancellation_comment = raw -> 'cancellation_details' ->> 'comment'
where raw is not null;
