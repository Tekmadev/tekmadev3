-- ===========================================================================
-- Pin the subscribers.status_source vocabulary.
--
-- APPLY THIS ONLY AFTER THE CODE FROM THE SAME COMMIT IS DEPLOYED. It is split
-- out of 20260922000001 for exactly that reason: until that deploy, the live
-- addSubscriber writes the caller's `source` ("footer",
-- "revenue-leak-calculator") into status_source when someone re-subscribes,
-- and this constraint would make every such re-subscribe fail on the live
-- site. The new code writes the fixed literal 'signup' instead. Order:
-- 20260922000001 and 20260922000002, then deploy, then this file.
--
-- Before applying, confirm nothing live would violate it:
--   select status_source, count(*) from public.subscribers
--    where status_source is not null and status_source not in
--      ('signup','email_link','unsubscribe_page','admin','ghl','ghl_permanent','reconcile','resend')
--    group by 1;
-- Any row it returns was written by the old code between those steps: set it
-- to 'signup' (the only value the old code could have meant) and re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- public.subscribers.status_source records where the CURRENT status came from,
-- and the CRM outbox is about to key behaviour off it: 'ghl_permanent' means a
-- terminal suppression we never try to clear, and a misspelling would read as
-- "not that", which is the safe-looking direction that quietly mails someone
-- who opted out. It has been free text with no constraint since it was added
-- in 20260918000003, and addSubscriber has been writing a caller-supplied
-- value from a public endpoint into it, so the vocabulary needs a floor in the
-- database rather than a convention in prose.
--
-- The eight allowed values:
--   signup            a first signup or a reactivation on our own form
--   email_link        our unsubscribe page, reached from an email footer link
--   unsubscribe_page  came back to active from that same page
--   admin             changed by staff in /admin/email
--   ghl               the CRM reported a DND change
--   ghl_permanent     the CRM reported a terminal suppression (hard bounce,
--                     spam complaint, carrier opt-out). Never cleared by us.
--   reconcile         the nightly backstop found a disagreement and corrected
--   resend            a provider signal from the transactional sender
--
-- NULL stays allowed: a row written before this column existed says nothing
-- about provenance, and `source` answers for it on a first signup.
--
-- Verified before writing this: 1 row in public.subscribers, 0 rows with a
-- non-null status_source, 0 rows that would violate. Adding the constraint is
-- a no-op scan today.
-- ---------------------------------------------------------------------------

do $$
begin
  -- Guarded by name so re-running the file does not fail on the second pass.
  -- `alter table ... add constraint` has no `if not exists`, and the
  -- drop-then-add form used elsewhere in this directory would briefly leave
  -- production unconstrained.
  if not exists (
    select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'subscribers'
       and c.conname = 'subscribers_status_source_check'
  ) then
    alter table public.subscribers
      add constraint subscribers_status_source_check
      check (
        status_source is null
        or status_source in (
          'signup', 'email_link', 'unsubscribe_page', 'admin',
          'ghl', 'ghl_permanent', 'reconcile', 'resend'
        )
      );
  end if;
end $$;
