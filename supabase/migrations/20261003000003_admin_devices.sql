-- Phones registered for push by the Android admin app (POST /devices).
--
-- One row per Expo push token: a token refresh, signing in again, or another
-- staff member signing in on the same phone updates the row (and moves it to
-- that person) instead of adding one. Signing out deletes the row
-- (DELETE /devices/:id). The push sender reads it to deliver a notification
-- to every phone of every staff member who may see it.
--
-- Users are Supabase auth user ids (owners named in ADMIN_EMAILS have no
-- admins row); the email is kept for people reading the table.
-- Server only, like every other table: RLS on, no policies.

create table if not exists public.admin_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text not null,
  -- ExponentPushToken[...] or ExpoPushToken[...]
  token text not null unique
    check (char_length(token) <= 4200 and token ~ '^Expo(nent)?PushToken\[[^]\s]+\]$'),
  platform text not null check (platform in ('android', 'ios')),
  app_version text not null,
  device_name text not null default 'Android phone',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Delivery health, written by the push sender: the last ticket error
  -- (e.g. DeviceNotRegistered, after which the row should be deleted).
  last_push_at timestamptz,
  last_push_error text
);

create index if not exists admin_devices_user_idx on public.admin_devices (user_id);
create index if not exists admin_devices_email_idx on public.admin_devices (lower(user_email));

alter table public.admin_devices enable row level security;
revoke all on public.admin_devices from anon, authenticated;

comment on table public.admin_devices is
  'Admin app phones registered for push, one row per Expo push token. Server only (RLS, no policies).';

-- App version gates and feature flags for the app (lib/admin-api/version.ts):
--   { "minVersion": "0.2.0", "latestVersion": "0.3.0", "apkUrl": "https://...", "features": [] }
-- Every field is optional; an empty object blocks nothing and offers no update.
insert into public.site_settings (key, value, updated_by)
values ('mobile_app', '{}'::jsonb, 'migration')
on conflict (key) do nothing;
