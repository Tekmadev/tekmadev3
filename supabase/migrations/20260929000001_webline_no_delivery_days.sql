-- Webline never states a delivery time (owner rule 2026-09-29, see
-- config/webline-delivery.ts). Two checklist templates still implied one, and
-- the portal shows their descriptions to the client. Only the templates
-- change: a checklist already issued keeps the words its client bought under.

update public.onboarding_task_templates
   set description = 'You see your homepage design first. Love it, or tell us exactly what to change.'
 where key = 'webline.build.design_concept';

update public.onboarding_task_templates
   set description = 'What we build, what you get, and how it goes live. Two minutes.'
 where key = 'webline.welcome.sign_agreement';
