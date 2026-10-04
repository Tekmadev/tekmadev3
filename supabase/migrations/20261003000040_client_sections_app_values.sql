-- Values the admin app writes on a client's approvals and booked calls.
--
-- The app's approval kinds and hand-logged call sources are not all in the
-- website's lists (src/api/schemas/clients.ts in the app, the admin API in
-- lib/admin-api/clients/sections/). This widens the two CHECKs so the app's
-- choice is stored as is:
--
--   client_approvals.kind        + copy, design, email, automation
--   client_booked_calls.source   + phone, website, referral
--
-- Every existing value stays allowed, and the portal shows these columns
-- through humanize(), so "Copy" or "Referral" reads correctly there too.
-- Until this is applied the API stores the nearest existing value instead
-- (kind "other"; source "web_form" or "other"), so applying it is never urgent.
--
-- The CHECKs were declared inline (default names), so each is found by its
-- definition rather than by name. Additive: safe before or after the code.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.client_approvals'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* '\mkind\M'
  loop
    execute format('alter table public.client_approvals drop constraint %I', c.conname);
  end loop;

  alter table public.client_approvals
    add constraint client_approvals_kind_check check (kind in (
      'website', 'receptionist_script', 'ad_creative', 'landing_page', 'follow_up_sequence', 'social_content', 'other',
      'copy', 'design', 'email', 'automation'
    ));
end
$$;

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.client_booked_calls'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* '\msource\M'
  loop
    execute format('alter table public.client_booked_calls drop constraint %I', c.conname);
  end loop;

  alter table public.client_booked_calls
    add constraint client_booked_calls_source_check check (source in (
      'receptionist', 'web_form', 'calendar', 'missed_call_textback', 'ads', 'chat', 'manual', 'import', 'other',
      'phone', 'website', 'referral'
    ));
end
$$;
