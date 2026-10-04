-- Idempotency keys for the admin API (app/api/admin/v1).
--
-- The Android app sends `Idempotency-Key` on every create and reuses the key
-- when it retries the same intent after a timeout. The first answer is stored
-- here and replayed for the retry, so a slow network never creates a client,
-- a coupon or a post twice. lib/admin-api/idempotency.ts is the only reader
-- and writer:
--   - one row per (user, key); a reused key with a different method, path or
--     body answers 409 idempotency_conflict
--   - status null means the first request is still running
--   - 5xx answers are not kept, so a retry runs again
--   - rows are kept 24 hours; the helper deletes older ones as it goes
--
-- Users are Supabase auth user ids (owners named in ADMIN_EMAILS have no
-- admins row). Server only, like every other table: RLS on, no policies.

create table if not exists public.admin_api_idempotency (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  key text not null check (char_length(key) between 1 and 200),
  method text not null check (method in ('POST', 'PUT', 'PATCH', 'DELETE')),
  path text not null,
  -- sha256 of method, path and the canonical JSON body.
  request_hash text not null,
  -- The stored answer: HTTP status and the full envelope body.
  status integer,
  body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint admin_api_idempotency_user_key unique (user_id, key)
);

create index if not exists admin_api_idempotency_created_idx
  on public.admin_api_idempotency (created_at);

alter table public.admin_api_idempotency enable row level security;
revoke all on public.admin_api_idempotency from anon, authenticated;

comment on table public.admin_api_idempotency is
  'Admin API Idempotency-Key answers, one per user and key, kept 24 hours. Server only (RLS, no policies).';
