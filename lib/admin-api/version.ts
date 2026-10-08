import { getSupabaseAdmin } from "@/lib/supabase";
import { ApiError, MESSAGES } from "./errors";

/**
 * App version gates (brief section 10). The app sends `X-App-Version` on every
 * call. Below the minimum version every call answers 426 `upgrade_required` and
 * the app blocks with its update screen. `GET /me` reports the versions so the
 * app can show "Update available" before that.
 *
 * Where the numbers come from, first match wins per field:
 *   1. site_settings row `mobile_app`: { minVersion?, latestVersion?, apkPath?, apkUrl?, features? }
 *      (owner controlled, no deploy needed; the app's `npm run apk` writes
 *      latestVersion and apkPath after each build, see scripts/publish-apk.mjs there)
 *   2. env ADMIN_APP_MIN_VERSION, ADMIN_APP_LATEST_VERSION, ADMIN_APP_APK_URL,
 *      ADMIN_APP_FEATURES (comma separated)
 *   3. no minimum (nothing blocked), latest = the caller's own version, no APK link,
 *      no feature flags
 *
 * The row is cached in memory for a minute so the gate costs no query per call.
 * A failed read falls back to env: a database hiccup must not block the app.
 *
 * The APK: `apkPath` names the file in the private `app-releases` bucket, and
 * GET /me hands each signed-in person a signed download link for it (valid
 * for hours, reused for a while so the gate stays cheap). The bucket is never
 * public: only staff who are signed in can download the app. `apkUrl` (a
 * plain https link) is the older way and is used only when there is no path.
 */

export type MobileAppSettings = {
  minVersion: string | null;
  latestVersion: string | null;
  /** The APK in the private `app-releases` bucket, e.g. "android/tekmadev-admin.apk". */
  apkPath: string | null;
  apkUrl: string | null;
  features: string[];
};

export type AppVersionInfo = { latestVersion: string; minVersion: string; apkUrl: string | null };

const VERSION_RE = /^\d+(\.\d+){0,3}$/;
const CACHE_MS = 60_000;

/** The private bucket the app's build script uploads to. */
export const APP_RELEASES_BUCKET = "app-releases";
/** A signed link works this long, and is handed out again for at most the first hour of it. */
const SIGNED_SECONDS = 6 * 60 * 60;
const SIGNED_REUSE_MS = 60 * 60 * 1000;
const APK_PATH_RE = /^android\/[A-Za-z0-9._-]{1,120}\.apk$/;

let signedCache: { key: string; at: number; url: string } | null = null;

let cache: { at: number; value: MobileAppSettings } | null = null;

const cleanVersion = (v: unknown): string | null => (typeof v === "string" && VERSION_RE.test(v.trim()) ? v.trim() : null);

/** Only https links are offered for download. */
const cleanUrl = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const url = new URL(v.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Only a plain file under android/ ending in .apk: nothing that walks out of the folder. */
const cleanApkPath = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const path = v.trim();
  return APK_PATH_RE.test(path) && !path.includes("..") ? path : null;
};

const cleanFeatures = (v: unknown): string[] | null => {
  if (Array.isArray(v)) return v.filter((f): f is string => typeof f === "string" && f.trim() !== "").map((f) => f.trim());
  if (typeof v === "string") return v.split(",").map((f) => f.trim()).filter(Boolean);
  return null;
};

function fromEnv(): MobileAppSettings {
  return {
    minVersion: cleanVersion(process.env.ADMIN_APP_MIN_VERSION),
    latestVersion: cleanVersion(process.env.ADMIN_APP_LATEST_VERSION),
    apkPath: null,
    apkUrl: cleanUrl(process.env.ADMIN_APP_APK_URL),
    features: cleanFeatures(process.env.ADMIN_APP_FEATURES) ?? [],
  };
}

/** The merged settings (site_settings over env), cached for a minute. */
export async function getMobileAppSettings(): Promise<MobileAppSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const env = fromEnv();
  let value = env;
  const db = getSupabaseAdmin();
  if (db) {
    const { data, error } = await db.from("site_settings").select("value").eq("key", "mobile_app").maybeSingle();
    if (error) {
      console.error("[admin-api] could not read site_settings.mobile_app", error.message);
      // Not cached: try again on the next call.
      return env;
    }
    const row = (data?.value ?? {}) as Record<string, unknown>;
    value = {
      minVersion: cleanVersion(row.minVersion) ?? env.minVersion,
      latestVersion: cleanVersion(row.latestVersion) ?? env.latestVersion,
      apkPath: cleanApkPath(row.apkPath),
      apkUrl: cleanUrl(row.apkUrl) ?? env.apkUrl,
      features: cleanFeatures(row.features) ?? env.features,
    };
  }
  cache = { at: Date.now(), value };
  return value;
}

/** Semver-ish compare of dotted numbers: -1, 0 or 1. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Throws 426 `upgrade_required` when a minimum is set and the caller is below
 * it. A missing or unreadable X-App-Version counts as 0.0.0, like the mock.
 */
export async function assertAppVersion(header: string | null): Promise<void> {
  const { minVersion } = await getMobileAppSettings();
  if (!minVersion) return;
  const current = cleanVersion(header) ?? "0.0.0";
  if (compareVersions(current, minVersion) < 0) throw new ApiError(426, "upgrade_required", MESSAGES.upgrade);
}

/**
 * A signed download link for the APK at `path`, named after the version so the
 * phone's Downloads shows which one it is. Reused for the first hour of its six,
 * so every link handed out still works for at least five hours. Null when the
 * file cannot be signed (missing, or storage down): the caller falls back.
 */
async function signedApkUrl(path: string, version: string): Promise<string | null> {
  const key = `${path}|${version}`;
  if (signedCache && signedCache.key === key && Date.now() - signedCache.at < SIGNED_REUSE_MS) return signedCache.url;
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.storage
    .from(APP_RELEASES_BUCKET)
    .createSignedUrl(path, SIGNED_SECONDS, { download: `tekmadev-admin-${version}.apk` });
  if (error || !data?.signedUrl) {
    console.error("[admin-api] could not sign the APK link", error?.message ?? "no url");
    return null;
  }
  signedCache = { key, at: Date.now(), url: data.signedUrl };
  return data.signedUrl;
}

/** `Me.app` for GET /me (signed-in staff only, so the APK link never reaches anyone else). */
export async function appVersionInfo(callerVersion: string | null): Promise<AppVersionInfo> {
  const s = await getMobileAppSettings();
  const min = s.minVersion ?? "0.0.0";
  const caller = cleanVersion(callerVersion);
  // Unknown latest: report the caller's own version (no "Update available"), never below the minimum.
  let latest = s.latestVersion ?? caller ?? min;
  if (compareVersions(latest, min) < 0) latest = min;
  const signed = s.apkPath ? await signedApkUrl(s.apkPath, latest) : null;
  return { latestVersion: latest, minVersion: min, apkUrl: signed ?? s.apkUrl };
}
