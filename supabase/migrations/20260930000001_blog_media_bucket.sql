-- Blog media: cover, social and in-post images, uploaded from the admin blog
-- editor (and later the admin app) instead of pasting a URL.
--
-- Public on purpose: every file here is shown on public blog pages anyway, so
-- a public bucket serves it from a plain, cacheable URL with no signing.
-- Writes never come from a browser key: the server mints a one-time signed
-- upload URL for an owner (lib/blog-media.ts), so the bucket needs no storage
-- policies. Images only (no SVG, which can carry script), 10 MB each.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-media',
  'blog-media',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
