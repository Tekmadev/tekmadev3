"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { addManager, removeAdmin } from "@/lib/admin-users";

export async function addManagerAction(formData: FormData) {
  const { email: invitedBy } = await requireOwner();

  const email = String(formData.get("email") || "").trim();
  const name = String(formData.get("name") || "").trim() || null;
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "manager") === "owner" ? "owner" : "manager";

  const res = await addManager({ email, password, name, role, invitedBy });
  if (!res.ok) redirect("/admin/team?e=" + encodeURIComponent(res.error));

  revalidatePath("/admin/team");
  redirect("/admin/team?ok=added");
}

export async function removeAdminAction(formData: FormData) {
  await requireOwner();

  const email = String(formData.get("email") || "");
  const res = await removeAdmin(email);
  if (!res.ok) redirect("/admin/team?e=" + encodeURIComponent(res.error));

  revalidatePath("/admin/team");
  redirect("/admin/team?ok=removed");
}
