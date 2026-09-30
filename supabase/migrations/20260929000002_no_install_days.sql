-- No client-facing copy states how long a build takes: it depends on the
-- business (owner rule 2026-09-29, see config/webline-delivery.ts). The
-- kickoff quick-win task promised text-back "from day two"; it now says what
-- it means without a day count. Issued checklists keep their old words.

update public.onboarding_task_templates
   set description = 'Every missed call gets an instant text reply right away, before the full build is live.'
 where key = 'kickoff.quick_win';
