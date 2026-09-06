-- Blog / content system schema (Phase 1 of the content engine).
--
-- Applied to the live Tekmadev project (ref mwimyppnonzkpnpczdch) via the
-- Supabase migration API on 2026-09-05. Kept here as the version-controlled
-- source of truth for the schema.
--
-- Follows existing site conventions: uuid pk, timestamptz created_at/updated_at,
-- RLS enabled with NO policies (all access server-side via the service-role key),
-- text + CHECK for enums (not Postgres ENUM types, which are painful to alter).

-- Keeps updated_at accurate on every write, regardless of caller.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authors (bylines + E-E-A-T; multi-author ready)
-- ---------------------------------------------------------------------------
create table public.blog_authors (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  role        text,
  bio         text,
  avatar_url  text,
  email       text,
  social      jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.blog_authors is 'Blog authors (bylines + E-E-A-T). Server-only (RLS, no policies).';
alter table public.blog_authors enable row level security;
create trigger blog_authors_set_updated_at
  before update on public.blog_authors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Categories (topical clusters)
-- ---------------------------------------------------------------------------
create table public.blog_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.blog_categories is 'Blog categories for topical clusters. Server-only (RLS, no policies).';
alter table public.blog_categories enable row level security;
create trigger blog_categories_set_updated_at
  before update on public.blog_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Posts (core)
-- ---------------------------------------------------------------------------
create table public.blog_posts (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  status               text not null default 'draft'
                         check (status in ('draft','in_review','scheduled','published','archived')),

  -- Content
  title                text not null,
  meta_title           text,
  meta_description     text,
  excerpt              text,
  body                 jsonb not null default '[]'::jsonb,
  faqs                 jsonb not null default '[]'::jsonb,
  key_takeaways        jsonb not null default '[]'::jsonb,

  -- SEO / GEO / AEO
  target_query         text,
  keywords             text[] not null default '{}',
  canonical_url        text,
  noindex              boolean not null default false,
  og_image_url         text,
  seo                  jsonb not null default '{}'::jsonb,

  -- Media
  cover_image_url      text,
  cover_image_alt      text,

  -- Taxonomy / authorship
  author_id            uuid references public.blog_authors(id) on delete set null,
  category_id          uuid references public.blog_categories(id) on delete set null,
  tags                 text[] not null default '{}',
  internal_links       jsonb not null default '[]'::jsonb,
  featured             boolean not null default false,

  -- Lifecycle
  published_at         timestamptz,
  scheduled_for        timestamptz,
  reading_time_minutes integer,
  locale               text not null default 'en-US',

  -- Provenance (AI / voice-capture pipeline)
  source               text not null default 'manual'
                         check (source in ('manual','ai_draft','voice_capture','imported')),
  source_metadata      jsonb not null default '{}'::jsonb,
  ai_model             text,
  ai_generated         boolean not null default false,

  -- Analytics
  view_count           bigint not null default 0,

  -- Audit + soft delete
  created_by           text,
  updated_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
comment on table public.blog_posts is 'Blog posts (structured content + SEO/GEO + provenance + audit). Server-only (RLS, no policies).';
alter table public.blog_posts enable row level security;
create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

create index blog_posts_status_idx on public.blog_posts (status);
create index blog_posts_published_at_idx on public.blog_posts (published_at desc);
create index blog_posts_category_id_idx on public.blog_posts (category_id);
create index blog_posts_author_id_idx on public.blog_posts (author_id);
create index blog_posts_featured_idx on public.blog_posts (featured);
create index blog_posts_tags_gin on public.blog_posts using gin (tags);
-- Fast path for the public listing: live posts only.
create index blog_posts_live_idx on public.blog_posts (published_at desc)
  where status = 'published' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Revisions (immutable version history / audit trail)
-- ---------------------------------------------------------------------------
create table public.blog_post_revisions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.blog_posts(id) on delete cascade,
  version     integer not null,
  snapshot    jsonb not null,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (post_id, version)
);
comment on table public.blog_post_revisions is 'Immutable per-version snapshots of a post. Server-only (RLS, no policies).';
alter table public.blog_post_revisions enable row level security;
create index blog_post_revisions_post_id_idx on public.blog_post_revisions (post_id);

-- Seed the founder author (editable later in the admin).
insert into public.blog_authors (slug, name, role, active)
values ('kazi-shajeedul-islam', 'Kazi Shajeedul Islam', 'Founder', true)
on conflict (slug) do nothing;
