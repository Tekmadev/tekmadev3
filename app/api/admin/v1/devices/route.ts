import { z } from "zod";
import { ApiError, ok, route } from "@/lib/admin-api";
import { EXPO_PUSH_TOKEN_RE, registerAdminDevice } from "@/lib/admin-devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = "That push token is not valid.";
const PLATFORM = "Only Android phones and iPhones can register for notifications.";
const APP_VERSION = "Send the app version.";

const body = z.object({
  token: z.string({ error: TOKEN }).trim().regex(EXPO_PUSH_TOKEN_RE, TOKEN),
  platform: z.enum(["android", "ios"], PLATFORM),
  appVersion: z.string({ error: APP_VERSION }).trim().min(1, APP_VERSION).max(40, APP_VERSION),
  // Optional and lenient: an empty or missing name is stored as "Android phone".
  deviceName: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
});

/**
 * POST /devices { token, platform, appVersion, deviceName } -> { id }. Any staff.
 * One row per push token: a new token answers 201, a token already registered
 * (refresh, signing in again, another person on the same phone) moves to the
 * caller and answers 200 with its existing id.
 */
export const POST = route({ method: "POST", body, idempotent: true }, async (ctx, { body }) => {
  const saved = await registerAdminDevice({
    userId: ctx.userId,
    email: ctx.email,
    token: body.token,
    platform: body.platform,
    appVersion: body.appVersion,
    deviceName: body.deviceName,
  });
  if (!saved) throw new ApiError(500, "unavailable", "Could not set up notifications just now. Try again in a moment.");
  return ok({ id: saved.id }, saved.created ? 201 : 200);
});
