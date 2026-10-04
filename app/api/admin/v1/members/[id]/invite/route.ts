import { route } from "@/lib/admin-api";
import { sendLink } from "@/lib/admin-api/clients/sections/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /members/:id/invite -> { member, sent: "invite" | "reset" }: the invite
 * again for invited people, a password reset link for active ones.
 * Owner and manager.
 */
export const POST = route({ method: "POST", capability: "clients.members" }, (ctx, { params }) => sendLink(ctx, params.id));
