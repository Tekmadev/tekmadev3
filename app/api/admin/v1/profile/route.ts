import { z } from "zod";
import { ApiError, route } from "@/lib/admin-api";
import { DISPLAY_NAME_MAX, saveStaffDisplayName } from "@/lib/admin-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTER = "Enter a display name.";
const TOO_LONG = `Keep the name to ${DISPLAY_NAME_MAX} characters or fewer.`;

const body = z.object({
  name: z.string({ error: ENTER }).trim().max(DISPLAY_NAME_MAX, TOO_LONG).nullable().optional(),
});

/**
 * PATCH /profile { name } -> { name }. Any staff, their own display name.
 * The name is trimmed; an empty string or null clears it (the app then shows
 * the email). Without `name` nothing changes and the current name comes back.
 */
export const PATCH = route({ method: "PATCH", body }, async (ctx, { body }) => {
  if (body.name === undefined) return { name: ctx.name };
  const name = body.name ? body.name : null;
  const saved = await saveStaffDisplayName({ id: ctx.userId, email: ctx.email, metadata: ctx.user.user_metadata }, name);
  if (!saved) throw new ApiError(500, "unavailable", "Could not save your name just now. Try again in a moment.");
  return { name };
});
