import { ApiError, MESSAGES, route } from "@/lib/admin-api";
import { testPushBody } from "@/lib/admin-api/notifications";
import { sendTestPush } from "@/lib/admin-api/push";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Test pushes per person per minute (on top of the API's general limit). */
const TEST_PUSHES_PER_MINUTE = 6;

/**
 * POST /notifications/test-push { deviceId? } -> { sent }. Any staff: one
 * "Test notification" to that phone of theirs, or to every phone they
 * registered. No Inbox row is created.
 *
 *   422 no_devices  This phone is not set up for notifications yet. Allow notifications, then try again.
 *                   (no phones, a device id that is not theirs, or every token came back unregistered)
 *   502 push        The push service could not be reached, or refused the message.
 */
export const POST = route({ method: "POST", capability: "notifications.view", body: testPushBody }, async (ctx, { body }) => {
  const limited = rateLimit(`admin-api:test-push:${ctx.userId}`, TEST_PUSHES_PER_MINUTE, 60_000);
  if (!limited.ok) {
    throw new ApiError(429, "rate_limited", MESSAGES.rateLimited, undefined, { "retry-after": String(limited.retryAfter) });
  }
  return sendTestPush(ctx.userId, body.deviceId || null);
});
