"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ownerEmails, requireAdminCapability, type AdminRole } from "@/lib/admin";
import { addManager, removeAdmin } from "@/lib/admin-users";

/**
 * The team, by the same rules as the admin API (lib/admin-api/team):
 * `team.write` adds people, and two owner-only rules sit on top of it.
 * Making someone an owner needs `team.owners`, and removing anyone needs
 * `team.remove`. Owners named in ADMIN_EMAILS are locked: nobody removes them.
 * `actorRole` makes lib/admin-users.ts apply those rules itself (the same
 * code the admin API runs), including that a manager may not re-grant an
 * existing owner, which would demote them.
 */

const ROLES: readonly AdminRole[] = ["owner", "manager", "staff"];

function fail(message: string): never {
  redirect("/admin/team?e=" + encodeURIComponent(message));
}

export async function addManagerAction(formData: FormData) {
  const ctx = await requireAdminCapability("team.write");

  const email = String(formData.get("email") || "").trim();
  const name = String(formData.get("name") || "").trim() || null;
  const password = String(formData.get("password") || "");
  const rawRole = String(formData.get("role") || "staff");
  const role = ROLES.find((r) => r === rawRole);
  if (!role) fail("Pick Owner, Manager or Staff.");

  // Managers add managers and staff; making (or changing) an owner is the owner's call.
  const res = await addManager({ email, password, name, role, invitedBy: ctx.email, actorRole: ctx.role });
  if (!res.ok) fail(res.error);

  revalidatePath("/admin/team");
  redirect("/admin/team?ok=added");
}

export async function removeAdminAction(formData: FormData) {
  const ctx = await requireAdminCapability("team.remove");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (ownerEmails().includes(email)) fail("The owner cannot be removed.");
  if (email === ctx.email) fail("You cannot remove yourself. Ask another owner.");

  const res = await removeAdmin(email, { actorRole: ctx.role });
  if (!res.ok) fail(res.error);

  revalidatePath("/admin/team");
  redirect("/admin/team?ok=removed");
}
