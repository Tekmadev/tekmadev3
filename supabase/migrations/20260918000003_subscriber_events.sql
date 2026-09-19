-- Subscription history, append-only.
--
-- public.subscribers holds the CURRENT state of each address. It cannot answer
-- "when did this person consent, and when did they withdraw it?" once they
-- come back, because reactivating overwrites consented_at and clears
-- unsubscribed_at. CASL puts the burden of proving consent on the sender, and
-- our Privacy Policy promises that unsubscribe records are kept. So every
-- change of state is also written here and never edited afterwards.
--
-- The log is written by a trigger, not by application code, on purpose: the
-- unsubscribe page, the admin, a future GHL webhook and a hand-run SQL fix all
-- change public.subscribers, and none of them can forget to log.
--
-- Rows die with the subscriber (cascade). An erasure request removes the
-- history too, which is what an erasure request is for.

-- Where the CURRENT status came from: 'email_link' (our unsubscribe page),
-- 'admin', 'ghl', 'unsubscribe_page' (came back from that page), or a signup
-- source on a reactivation. Null on a first signup, where `source` says it.
alter table public.subscribers
  add column if not exists status_source text,
  add column if not exists unsubscribe_reason text;

comment on column public.subscribers.status_source is
  'Where the current status came from (email_link, admin, ghl, unsubscribe_page, or a signup source). The trigger copies it onto the history row.';
comment on column public.subscribers.unsubscribe_reason is
  'Optional answer to "why are you leaving", picked on the unsubscribe page. Cleared when they come back. Allowed keys live in config/site.ts.';

create table if not exists public.subscriber_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  type text not null check (type in ('subscribed', 'resubscribed', 'unsubscribed', 'bounced', 'complained', 'feedback')),
  source text not null,
  -- Only on 'feedback' rows.
  reason text,
  -- The policy the person agreed to. Only on rows that record consent.
  policy_version text
);

comment on table public.subscriber_events is
  'Append-only history of every newsletter subscription change. Written by the subscribers_log_event trigger. Proof of consent and of withdrawal under CASL.';

create index if not exists subscriber_events_subscriber_idx
  on public.subscriber_events (subscriber_id, created_at desc);
create index if not exists subscriber_events_type_idx
  on public.subscriber_events (type, created_at desc);

-- Server-only, like every other table here: RLS on, no policies, so only the
-- service role (which bypasses RLS) can read or write it.
alter table public.subscriber_events enable row level security;

create or replace function public.log_subscriber_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscriber_events (subscriber_id, type, source, policy_version)
    values (
      new.id,
      case when new.status = 'active' then 'subscribed' else new.status end,
      coalesce(new.status_source, new.source, 'unknown'),
      case when new.status = 'active' then new.consent_policy_version end
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.subscriber_events (subscriber_id, type, source, policy_version)
    values (
      new.id,
      case when new.status = 'active' then 'resubscribed' else new.status end,
      coalesce(new.status_source, 'unknown'),
      case when new.status = 'active' then new.consent_policy_version end
    );
  end if;

  if new.unsubscribe_reason is not null
     and new.unsubscribe_reason is distinct from old.unsubscribe_reason then
    insert into public.subscriber_events (subscriber_id, type, source, reason)
    values (new.id, 'feedback', coalesce(new.status_source, 'unknown'), new.unsubscribe_reason);
  end if;

  return new;
end;
$$;

drop trigger if exists subscribers_log_event on public.subscribers;
create trigger subscribers_log_event
  after insert or update on public.subscribers
  for each row execute function public.log_subscriber_event();

-- Backfill what the current rows can still prove. Guarded, so re-running this
-- file never writes a second copy.
insert into public.subscriber_events (created_at, subscriber_id, type, source, policy_version)
select coalesce(s.consented_at, s.created_at), s.id, 'subscribed', s.source, s.consent_policy_version
from public.subscribers s
where not exists (select 1 from public.subscriber_events e where e.subscriber_id = s.id);

insert into public.subscriber_events (created_at, subscriber_id, type, source)
select s.unsubscribed_at, s.id, 'unsubscribed', coalesce(s.status_source, 'unknown')
from public.subscribers s
where s.unsubscribed_at is not null
  and not exists (
    select 1 from public.subscriber_events e
    where e.subscriber_id = s.id and e.type = 'unsubscribed'
  );
