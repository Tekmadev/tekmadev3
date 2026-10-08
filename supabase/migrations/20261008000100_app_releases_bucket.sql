-- App releases (owner request 2026-10-08): the Android APK for in-app updates.
--
-- The app's build script (tekmadevapp: npm run apk, scripts/publish-apk.mjs)
-- uploads each new APK here with the service key and writes its path and
-- version into site_settings.mobile_app. GET /me then hands signed-in staff a
-- signed download link (lib/admin-api/version.ts). The bucket is private and
-- has no policies: nobody downloads the app without a link from the server.
--
-- 50 MB is the largest file the free plan accepts; the APK is about 36 MB
-- since its native libraries are compressed. Additive only, safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-releases', 'app-releases', false, 52428800, array['application/vnd.android.package-archive'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
