import { capabilitiesFor, route } from "@/lib/admin-api";
import { appVersionInfo, getMobileAppSettings } from "@/lib/admin-api/version";
import { seedViewer } from "@/lib/admin-notifications-data";
import { getLoaderSettings } from "@/lib/site-settings";
import { testModeConfigured } from "@/lib/stripe-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /me: who is signed in, their role, what that role may do
 * (`capabilities`, from lib/admin-api/permissions.ts: the app shows and hides
 * every screen and control from this list), feature flags, the loader tuning
 * and the app version gates. Any staff.
 *
 * It passes the minimum version gate (still signed in only): an app below the
 * minimum blocks itself from `app.minVersion` and needs this answer for a
 * fresh APK download link.
 *
 * The first call for a person also sets up their Inbox read state: they start
 * at "now" instead of the whole history unread (the same seed the web admin
 * runs on a first visit). A no-op on every call after that.
 */
export const GET = route({ method: "GET", versionGate: false }, async (ctx) => {
  await seedViewer(ctx.viewer);
  const [loader, app, settings] = await Promise.all([getLoaderSettings(), appVersionInfo(ctx.appVersion), getMobileAppSettings()]);
  return {
    user: { id: ctx.userId, email: ctx.email, name: ctx.name },
    role: ctx.role,
    capabilities: capabilitiesFor(ctx),
    features: settings.features,
    timezone: "America/Toronto" as const,
    loader,
    testModeConfigured: testModeConfigured(),
    app,
  };
});
