-- Tag /grow leads in the CRM.
--
-- The /grow form (config/grow.ts, 20260928000001_grow_lead_form.sql) writes
-- leads with source 'grow', and crm_enqueue_from_lead() had no branch for that
-- source. Two things went missing because of it:
--
--   1. The lead reached the CRM as a contact with no tag, so nothing on their
--      side could start the speed-to-lead workflow, which is the whole point of
--      the form.
--   2. A booking made from /grow/welcome UPDATES the grow row rather than
--      inserting a cal_booking one, and a later cancellation lands on that same
--      row, so the person who booked never got tmd-booked-call and the reminder
--      workflow never ran for them.
--
-- This replaces the function with one more branch. Every existing source
-- (cal_booking, lead_magnet with its revenue leak sub-tag, portal_signup)
-- behaves exactly as 20260922000002_crm_sync.sql wrote it, with the same keys
-- and the same payloads. `create or replace` keeps the leads_crm_enqueue
-- trigger, the owner and the grants as they are; the revoke and grant are
-- restated below only so this file reads the same as the original.
--
-- APPLY THIS ONLY AFTER THE CODE WITH `growForm` IN CRM_TAGS (lib/crm/tags.ts)
-- IS DEPLOYED. The worker resolves the "grow-form" slug through that vocabulary,
-- and a tags.add job for a slug the deployed code does not know goes straight
-- to 'dead' as an unrecognised payload, which nothing retries. While the
-- outbound switch is off the trigger enqueues nothing at all, so applying it
-- early is harmless today; the order matters from the day the switch goes on.
--
-- Order: 20260928000001 first (the worker's contact profile now selects its
-- columns, so the code must never run against a table without them), then
-- deploy, then this file.

create or replace function public.crm_enqueue_from_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v_scope text;
begin
  -- public.leads.email is nullable and never normalised on the way in: the Cal
  -- webhook writes Cal's own casing verbatim at app/api/webhooks/cal/route.ts:112.
  -- No email means no identity, so there is nothing to enqueue.
  k := lower(btrim(coalesce(new.email, '')));
  if k = '' then
    return new;
  end if;
  if not public.crm_outbound_enabled() then
    return new;
  end if;

  perform public.crm_enqueue('contact.upsert', 'contact.upsert:' || k, k,
                             'lead', new.id, '{}'::jsonb);

  -- Event tags record something that happened, so their keys are scoped to the
  -- real-world event rather than coalesced. The booking uid is that event for a
  -- Cal booking, which is what makes a reschedule its own job instead of a
  -- replay of the original. Rows with no booking fall back to the row id.
  v_scope := coalesce(nullif(btrim(coalesce(new.booking_uid, '')), ''), new.id::text);

  -- Only on a real change. Cal retries a delivery and the route upserts on
  -- booking_uid, so an unchanged redelivery must not reset a finished tag job
  -- back to pending and spend a call re-applying a tag that is already there.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.source = 'cal_booking' then
      if new.status in ('booked', 'rescheduled') then
        perform public.crm_enqueue('tags.add',
          'tags.add:' || k || ':booked-call:' || v_scope, k,
          'lead', new.id, '{"tag":"booked-call"}'::jsonb);
      elsif new.status = 'cancelled' then
        perform public.crm_enqueue('tags.add',
          'tags.add:' || k || ':booking-cancelled:' || v_scope, k,
          'lead', new.id, '{"tag":"booking-cancelled"}'::jsonb);
        -- The call is off the calendar, so the tag that drives reminder
        -- workflows has to come off with it or the person gets reminded about a
        -- meeting that is not happening.
        perform public.crm_enqueue('tags.remove',
          'tags.remove:' || k || ':booked-call:' || v_scope, k,
          'lead', new.id, '{"tag":"booked-call"}'::jsonb);
      end if;
    elsif new.source = 'lead_magnet' then
      perform public.crm_enqueue('tags.add',
        'tags.add:' || k || ':lead-magnet:' || v_scope, k,
        'lead', new.id, '{"tag":"lead-magnet"}'::jsonb);
      -- Which tool, as its own tag, because each tool gets its own follow-up
      -- workflow on their side and the revenue leak one branches on the dollar
      -- figure. The slug is REVENUE_LEAK_SLUG in config/lead-magnets.ts, carried
      -- on the lead row by lib/lead-magnet-data.ts. A tool with no tag of its own
      -- still gets the general lead-magnet tag above.
      if new.raw->>'magnet' = 'revenue-leak-calculator' then
        perform public.crm_enqueue('tags.add',
          'tags.add:' || k || ':lead-magnet-revenue-leak:' || v_scope, k,
          'lead', new.id, '{"tag":"lead-magnet-revenue-leak"}'::jsonb);
      end if;
    elsif new.source = 'portal_signup' then
      perform public.crm_enqueue('tags.add',
        'tags.add:' || k || ':portal-signup:' || v_scope, k,
        'lead', new.id, '{"tag":"portal-signup"}'::jsonb);
    elsif new.source = 'grow' then
      -- The form itself, scoped on the row and NOT on v_scope. v_scope turns
      -- into the booking uid the moment a booking is attached to this row, so a
      -- v_scope key would queue the same tag a second time under a new key when
      -- the person books. On the row id that transition lands on the same job.
      -- An inquiry, not consent: this never touches the newsletter tag.
      -- On INSERT only. The tag starts the speed-to-lead workflow on their side,
      -- and re-arming it when the lead books or becomes a client would re-run
      -- that workflow on someone who already booked. Rows inserted while
      -- outbound was off get it from backfillCrmContacts instead.
      if tg_op = 'INSERT' then
        perform public.crm_enqueue('tags.add',
          'tags.add:' || k || ':grow-form:' || new.id::text, k,
          'lead', new.id, '{"tag":"grow-form"}'::jsonb);
      end if;
      -- The booked-call pair, with exactly the keys the cal_booking branch
      -- writes, because a booking from the welcome page lands on this row
      -- instead of a cal_booking one. A /grow row with no booking is not a
      -- booked call, whatever its status says.
      if btrim(coalesce(new.booking_uid, '')) <> '' then
        if new.status in ('booked', 'rescheduled') then
          perform public.crm_enqueue('tags.add',
            'tags.add:' || k || ':booked-call:' || v_scope, k,
            'lead', new.id, '{"tag":"booked-call"}'::jsonb);
        elsif new.status = 'cancelled' then
          perform public.crm_enqueue('tags.add',
            'tags.add:' || k || ':booking-cancelled:' || v_scope, k,
            'lead', new.id, '{"tag":"booking-cancelled"}'::jsonb);
          perform public.crm_enqueue('tags.remove',
            'tags.remove:' || k || ':booked-call:' || v_scope, k,
            'lead', new.id, '{"tag":"booked-call"}'::jsonb);
        end if;
      end if;
    end if;
  end if;

  return new;
exception when others then
  raise warning 'crm enqueue (lead %) failed: % %', new.id, sqlstate, sqlerrm;
  return new;
end;
$$;

revoke all on function public.crm_enqueue_from_lead() from public, anon, authenticated;
grant execute on function public.crm_enqueue_from_lead() to service_role;
