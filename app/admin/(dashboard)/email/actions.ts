"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeSlug } from "@/lib/links-data";

export async function createCampaignAction(formData: FormData) {
  await requireOwner();

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/email?e=config");

  const key = normalizeSlug(String(formData.get("key") || ""));
  if (!key) redirect("/admin/email?e=key");

  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/admin/email?e=name");

  const { error } = await supabase.from("email_campaigns").insert({
    key,
    name,
    subject: String(formData.get("subject") || "").trim() || null,
    template: String(formData.get("template") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    active: true,
  });

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) redirect("/admin/email?e=dupe");
    console.error("[email] campaign insert failed", error.message);
    redirect("/admin/email?e=db");
  }

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=created");
}

export async function toggleCampaignAction(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") || "").trim();
  const next = String(formData.get("active") || "") === "true";
  if (!id) redirect("/admin/email?e=input");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/email?e=config");

  const { error } = await supabase.from("email_campaigns").update({ active: next }).eq("id", id);
  if (error) {
    console.error("[email] campaign toggle failed", error.message);
    redirect("/admin/email?e=db");
  }

  revalidatePath("/admin/email");
  redirect(`/admin/email?ok=${next ? "enabled" : "disabled"}`);
}

export async function deleteCampaignAction(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/email?e=input");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/email?e=config");

  const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
  if (error) {
    console.error("[email] campaign delete failed", error.message);
    redirect("/admin/email?e=db");
  }

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=campaign_deleted");
}

export async function unsubscribeSubscriberAction(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/email?e=input");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/email?e=config");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now })
    .eq("id", id);
  if (error) {
    console.error("[email] unsubscribe failed", error.message);
    redirect("/admin/email?e=db");
  }

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=unsubscribed");
}

/** Hard-delete a subscriber, e.g. to satisfy a data-erasure request. */
export async function deleteSubscriberAction(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/email?e=input");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/email?e=config");

  const { error } = await supabase.from("subscribers").delete().eq("id", id);
  if (error) {
    console.error("[email] subscriber delete failed", error.message);
    redirect("/admin/email?e=db");
  }

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=subscriber_deleted");
}
