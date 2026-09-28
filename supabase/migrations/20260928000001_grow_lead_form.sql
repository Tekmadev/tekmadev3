-- The /grow lead form (config/grow.ts, app/api/grow/route.ts).
--
-- Qualification answers get real columns rather than living in `raw`, for two
-- reasons: the admin list and the CRM read them by name, and the Cal webhook
-- overwrites `raw` with its payload whenever a booking is attached to the same
-- row, so anything kept only in `raw` would be lost the moment the lead books.
-- `form` holds the rest of the submission (first-touch attribution, device,
-- consent) for the same reason.
--
-- The codes in the CHECKs are the ones in config/grow.ts. Adding a code means a
-- new migration that widens the CHECK; never rename one.
--
-- Additive and nullable: safe to apply before or after the code that writes it.

alter table public.leads
  add column if not exists business_name text,
  add column if not exists website text,
  add column if not exists need text,
  add column if not exists revenue_band text,
  add column if not exists message text,
  add column if not exists form jsonb;

alter table public.leads drop constraint if exists leads_need_check;
alter table public.leads add constraint leads_need_check
  check (need is null or need in ('customers', 'website', 'custom', 'content', 'unsure'));

alter table public.leads drop constraint if exists leads_revenue_band_check;
alter table public.leads add constraint leads_revenue_band_check
  check (revenue_band is null or revenue_band in ('pre', 'under_10k', '10k_20k', '20k_50k', '50k_100k', '100k_plus'));

comment on column public.leads.business_name is 'Business or working name, as typed on the /grow form.';
comment on column public.leads.website is 'Their current website, as typed on the /grow form (not validated as a URL).';
comment on column public.leads.need is 'What they need most (config/grow.ts growNeeds).';
comment on column public.leads.revenue_band is 'Rough monthly revenue (config/grow.ts revenueBands).';
comment on column public.leads.message is 'Free text from the /grow form.';
comment on column public.leads.form is 'The rest of a form submission: first-touch attribution, device, country, consent. Never overwritten by the Cal webhook.';
