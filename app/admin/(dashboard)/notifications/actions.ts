"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminInboxViewer, requireAdminCapability, type AdminContext } from "@/lib/admin";
import type { Viewer } from "@/lib/admin-notifications-data";
import {
  isCategory,
  markAllNotificationsRead,
  markNotificationsRead,
  setCategoryPref,
  setNotificationResolved,
} from "@/lib/admin-notifications-data";

/** Only ever send people back into the inbox, with the filters they had. */
function back(formData: FormData): string {
  const to = String(formData.get("back") || "");
  return to.startsWith("/admin/notifications") ? to : "/admin/notifications";
}

/** Signed in with the Inbox, and the categories and audience this role may read. */
async function inbox(): Promise<{ ctx: AdminContext; viewer: Viewer }> {
  const ctx = await requireAdminCapability("notifications.view");
  return { ctx, viewer: adminInboxViewer(ctx) };
}

function done(formData: FormData): never {
  // The bell's starting count is rendered by the dashboard layout.
  revalidatePath("/admin", "layout");
  redirect(back(formData));
}

export async function markReadAction(formData: FormData) {
  const { viewer } = await inbox();
  await markNotificationsRead(viewer, [String(formData.get("id") || "")]);
  done(formData);
}

export async function markAllReadAction(formData: FormData) {
  const { viewer } = await inbox();
  // Only up to the newest row this page actually showed.
  await markAllNotificationsRead(viewer, String(formData.get("seen") || "") || null);
  done(formData);
}

export async function resolveAction(formData: FormData) {
  const { ctx, viewer } = await inbox();
  const id = String(formData.get("id") || "");
  await setNotificationResolved(viewer, id, String(formData.get("resolved")) === "true", ctx.email);
  // Dealing with it counts as having read it.
  await markNotificationsRead(viewer, [id]);
  done(formData);
}

export async function muteCategoryAction(formData: FormData) {
  const { viewer } = await inbox();
  const category = String(formData.get("category") || "");
  if (isCategory(category)) {
    await setCategoryPref(viewer, category, { muted: String(formData.get("muted")) === "true" });
  }
  done(formData);
}

/** "Open" on the page: mark it read, then go where it points. Only ever inside the admin. */
export async function openNotificationAction(formData: FormData) {
  const { viewer } = await inbox();
  await markNotificationsRead(viewer, [String(formData.get("id") || "")]);
  const to = String(formData.get("to") || "");
  revalidatePath("/admin", "layout");
  redirect(/^\/admin(?:[/?#]|$)/.test(to) && !to.includes("//") ? to : "/admin/notifications");
}
