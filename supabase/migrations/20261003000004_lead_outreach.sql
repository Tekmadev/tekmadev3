-- Outreach on leads: leads added by hand, every touch logged, a follow-up date
-- and who owns the lead.
--
-- The admin app lets owners, managers and staff work leads (lib/admin-api/
-- permissions.ts: leads.create, leads.update, leads.outreach). A lead found by
-- outreach is a normal leads row with source = 'outreach'.
--
-- public.leads has no CHECK on source in this schema (crm_baseline mirrors
-- what is live), so 'outreach' is already allowed. If a CHECK on source does
-- exist in some database, it is replaced by one that keeps every value in use
-- plus the known codes and 'outreach'.
--
-- Additive and nullable: safe to apply before or after the code that uses it.

alter table public.leads
  add column if not exists follow_up_at timestamptz,
  add column if not exists assigned_to text;

comment on column public.leads.follow_up_at is 'When someone should next contact this lead. Null: no follow-up planned.';
comment on column public.leads.assigned_to is 'Email of the staff member who owns this lead. Null: unassigned.';

create index if not exists leads_follow_up_idx on public.leads (follow_up_at) where follow_up_at is not null;
create index if not exists leads_assigned_to_idx on public.leads (lower(assigned_to)) where assigned_to is not null;

do $$
declare
  c record;
  v_values text;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.leads'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* '\msource\M'
  loop
    execute format('alter table public.leads drop constraint %I', c.conname);

    select string_agg(quote_literal(v), ', ' order by v) into v_values
    from (
      select distinct source as v from public.leads where source is not null
      union
      select unnest(array['cal_booking', 'grow', 'lead_magnet', 'portal_signup', 'outreach'])
    ) s;

    execute format('alter table public.leads add constraint %I check (source in (%s))', c.conname, v_values);
  end loop;
end
$$;

-- One row per touch: a call, an email, a DM, a meeting.
create table if not exists public.lead_touches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- Email of the staff member who made the touch.
  by_email text not null,
  kind text not null check (kind in ('call', 'email', 'dm', 'meeting', 'other')),
  -- Short result in their words ("Left a voicemail", "Wants a quote").
  outcome text check (outcome is null or char_length(outcome) <= 200),
  note text check (note is null or char_length(note) <= 5000),
  created_at timestamptz not null default now()
);

create index if not exists lead_touches_lead_idx on public.lead_touches (lead_id, created_at desc);

alter table public.lead_touches enable row level security;
revoke all on public.lead_touches from anon, authenticated;

comment on table public.lead_touches is
  'Outreach touches on a lead (call, email, dm, meeting, other) with who made them. Server only (RLS, no policies).';
