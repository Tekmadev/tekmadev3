"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ownerEmails, requireAdmin, requireAdminCapability, adminCan, FORBIDDEN_REDIRECT, type AdminRole } from "@/lib/admin";
import { addManager, removeAdmin, updateTeamAccess } from "@/lib/admin-users";
import { updateCommissionSplit } from "@/lib/staff-admin";

/**
 * The team, by the same rules as the admin API (lib/admin-api/team):
 * `team.write` adds people, and two owner-only rules sit on top of it.
 * Making someone an owner needs `team.owners`, and removing anyone needs
 * `team.remove`. Owners named in ADMIN_EMAILS are locked: nobody removes them.
 * `actorRole` makes lib/admin-users.ts apply those rules itself (the same
 * code the admin API runs), including that a manager may not re-grant an
 * existing owner, which would demote them.
 *
 * Role changes (`team.role`) and pausing (`team.pause`) run updateTeamAccess,
 * the same rules and copy as PATCH /team/:email: env owners are locked,
 * nobody acts on themselves, and managers never touch an owner. The default
 * commission split is owners only (`commission.settings`).
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

export async function changeRoleAction(formData: FormData) {
  const ctx = await requireAdminCapability("team.role");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const rawRole = String(formData.get("role") || "");
  const role = ROLES.find((r) => r === rawRole);
  if (!role) fail("Pick Owner, Manager or Staff.");

  const res = await updateTeamAccess({ email, role, actorEmail: ctx.email, actorRole: ctx.role });
  if (!res.ok) fail(res.error);

  revalidatePath("/admin/team");
  redirect("/admin/team?ok=" + (res.changed.role ? "role" : "same"));
}

export async function setPausedAction(formData: FormData) {
  const ctx = await requireAdminCapability("team.pause");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const raw = String(formData.get("paused") || "");
  if (raw !== "true" && raw !== "false") fail("Send paused as true or false.");
  const paused = raw === "true";

  const res = await updateTeamAccess({ email, paused, actorEmail: ctx.email, actorRole: ctx.role });
  if (!res.ok) fail(res.error);

  revalidatePath("/admin/team");
  redirect("/admin/team?ok=" + (res.changed.paused === undefined ? "same" : paused ? "paused" : "resumed"));
}

/** A share typed into the form ("50", "33.33"), as a number, or NaN when it is not one. */
function shareField(v: FormDataEntryValue | null): number {
  const text = String(v ?? "").trim();
  return text === "" ? Number.NaN : Number(text);
}

export async function saveCommissionSplitAction(formData: FormData) {
  const ctx = await requireAdmin();
  // Owners only: managers read the split (clients.credits.view) but never change it.
  if (!adminCan(ctx, "commission.settings")) {
    if (adminCan(ctx, "team.view")) fail("That section is owner only.");
    redirect(FORBIDDEN_REDIRECT);
  }

  const res = await updateCommissionSplit({ finder: shareField(formData.get("finder")), booker: shareField(formData.get("booker")) }, ctx.email);
  if (!res.ok) fail(res.message);

  revalidatePath("/admin/team");
  redirect("/admin/team?ok=" + (res.changed ? "split" : "same") + "#commission");
}
