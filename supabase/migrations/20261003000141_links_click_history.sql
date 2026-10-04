-- Admin API v1, Marketing > Links: a click history that outlives its link,
-- and keyset paging for GET /api/admin/v1/links/clicks.
--
-- `links` and `link_clicks` were created on the live project with the
-- branded links feature (commit 8844268) without a migration file in this
-- folder, so this file only assumes the columns lib/links-data.ts uses
-- (link_clicks: link_id, slug, referrer, device, country, utm_*, created_at)
-- and checks the catalog before changing anything. Safe to run twice.
--
-- 1. Every click needs a stable id: the app pages by (created_at, id) and
--    shows `id` per row. Added (uuid) only when the table has no id column.
-- 2. Deleting a link keeps its clicks, still carrying the link id, so
--    GET /links/clicks?linkId=<deleted id> keeps answering and the app's
--    "Clicks stay on record" holds. A foreign key from link_clicks.link_id to
--    links (cascade would erase the history, set null would orphan it) is
--    dropped. The redirect only logs clicks for links that exist, so nothing
--    else changes. The per-link counter (links.click_count) still restarts at
--    0 when a slug is deleted and created again.
-- 3. Indexes for the two lists: every link, and one link.

do $$
declare
  fk record;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'link_clicks' and column_name = 'id'
  ) then
    alter table public.link_clicks add column id uuid not null default gen_random_uuid();
    create unique index if not exists link_clicks_id_key on public.link_clicks (id);
  end if;

  for fk in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.link_clicks'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.links'::regclass
  loop
    execute format('alter table public.link_clicks drop constraint %I', fk.conname);
  end loop;
end
$$;

create index if not exists link_clicks_created_id_idx on public.link_clicks (created_at desc, id desc);
create index if not exists link_clicks_link_created_id_idx on public.link_clicks (link_id, created_at desc, id desc);
