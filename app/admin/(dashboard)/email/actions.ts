"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminCapability } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeSlug } from "@/lib/links-data";
import { setSubscriberStatus } from "@/lib/subscribers-data";
import { createEmailCampaign, deleteEmailCampaign, eraseSubscriber, setEmailCampaignActive } from "@/lib/email-admin";

// The writes themselves live in lib/email-admin.ts, shared with the admin API
// (app/api/admin/v1/email). These actions keep the page's own checks and
// redirect codes.

export async function createCampaignAction(formData: FormData) {
  await requireAdminCapability("email.campaigns.write");

  if (!getSupabaseAdmin()) redirect("/admin/email?e=config");

  const key = normalizeSlug(String(formData.get("key") || ""));
  if (!key) redirect("/admin/email?e=key");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/email?e=name");

  const result = await createEmailCampaign({
    key,
    name,
    subject: String(formData.get("subject") || "").trim() || null,
    template: String(formData.get("template") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
  });
  if (!result.ok) redirect(`/admin/email?e=${result.reason}`);

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=created");
}

export async function toggleCampaignAction(formData: FormData) {
  await requireAdminCapability("email.campaigns.write");

  const id = String(formData.get("id") || "").trim();
  const next = String(formData.get("active") || "") === "true";
  if (!id) redirect("/admin/email?e=input");

  if (!getSupabaseAdmin()) redirect("/admin/email?e=config");

  const result = await setEmailCampaignActive(id, next);
  if (!result.ok) redirect(`/admin/email?e=${result.reason}`);

  revalidatePath("/admin/email");
  redirect(`/admin/email?ok=${next ? "enabled" : "disabled"}`);
}

export async function deleteCampaignAction(formData: FormData) {
  await requireAdminCapability("email.campaigns.write");

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/email?e=input");

  if (!getSupabaseAdmin()) redirect("/admin/email?e=config");

  const result = await deleteEmailCampaign(id);
  if (!result.ok) redirect(`/admin/email?e=${result.reason}`);

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=campaign_deleted");
}

export async function unsubscribeSubscriberAction(formData: FormData) {
  await requireAdminCapability("email.subscribers.write");

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/email?e=input");

  // Through the one door in lib/subscribers-data.ts rather than writing the
  // table here: it is what stamps status_source and updated_at in the same
  // statement, leaves an already suppressed row alone so its history keeps the
  // real source, and refuses to downgrade a bounce or a spam complaint to a
  // plain unsubscribe, which would erase the only record of why we stopped.
  const result = await setSubscriberStatus({
    match: { by: "id", id },
    status: "unsubscribed",
    source: "admin",
  });
  if (!result.ok) {
    // notfound, refused and stale all mean the row is no longer in the state
    // this button was rendered for (it only renders for an active subscriber),
    // so the page is stale and reloading it is the fix.
    const code = result.reason === "config" || result.reason === "db" ? result.reason : "input";
    redirect(`/admin/email?e=${code}`);
  }

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=unsubscribed");
}

/** Hard-delete a subscriber, e.g. to satisfy a data-erasure request. */
export async function deleteSubscriberAction(formData: FormData) {
  await requireAdminCapability("email.subscribers.write");

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/email?e=input");

  if (!getSupabaseAdmin()) redirect("/admin/email?e=config");

  // The CRM erasure is queued first and nothing is deleted when it cannot be
  // (see eraseSubscriber), so the owner can try again.
  const result = await eraseSubscriber(id);
  if (!result.ok) redirect(`/admin/email?e=${result.reason}`);

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=subscriber_deleted");
}
