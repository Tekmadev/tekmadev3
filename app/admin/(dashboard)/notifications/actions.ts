"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
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

function done(formData: FormData): never {
  // The bell's starting count is rendered by the dashboard layout.
  revalidatePath("/admin", "layout");
  redirect(back(formData));
}

export async function markReadAction(formData: FormData) {
  const ctx = await requireAdmin();
  await markNotificationsRead({ userId: ctx.user.id, isOwner: ctx.role === "owner" }, [String(formData.get("id") || "")]);
  done(formData);
}

export async function markAllReadAction(formData: FormData) {
  const ctx = await requireAdmin();
  // Only up to the newest row this page actually showed.
  await markAllNotificationsRead({ userId: ctx.user.id, isOwner: ctx.role === "owner" }, String(formData.get("seen") || "") || null);
  done(formData);
}

export async function resolveAction(formData: FormData) {
  const ctx = await requireAdmin();
  const id = String(formData.get("id") || "");
  const viewer = { userId: ctx.user.id, isOwner: ctx.role === "owner" };
  await setNotificationResolved(viewer, id, String(formData.get("resolved")) === "true", ctx.email);
  // Dealing with it counts as having read it.
  await markNotificationsRead(viewer, [id]);
  done(formData);
}

export async function muteCategoryAction(formData: FormData) {
  const ctx = await requireAdmin();
  const category = String(formData.get("category") || "");
  if (isCategory(category)) {
    await setCategoryPref({ userId: ctx.user.id, isOwner: ctx.role === "owner" }, category, { muted: String(formData.get("muted")) === "true" });
  }
  done(formData);
}

/** "Open" on the page: mark it read, then go where it points. Only ever inside the admin. */
export async function openNotificationAction(formData: FormData) {
  const ctx = await requireAdmin();
  await markNotificationsRead({ userId: ctx.user.id, isOwner: ctx.role === "owner" }, [String(formData.get("id") || "")]);
  const to = String(formData.get("to") || "");
  revalidatePath("/admin", "layout");
  redirect(/^\/admin(?:[/?#]|$)/.test(to) && !to.includes("//") ? to : "/admin/notifications");
}
