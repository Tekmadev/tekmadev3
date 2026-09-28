"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeSlug } from "@/lib/links-data";
import { setSubscriberStatus } from "@/lib/subscribers-data";
import { requestCrmErasure } from "@/lib/crm/outbox";

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
  await requireOwner();

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/email?e=input");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/email?e=config");

  const { data: row, error: readError } = await supabase.from("subscribers").select("email").eq("id", id).maybeSingle();
  if (readError) {
    console.error("[email] subscriber read failed", readError.message);
    redirect("/admin/email?e=db");
  }
  // The CRM half first. Deleting only our row would leave their contact tagged
  // for the newsletter and mailable, and a person who asked to be forgotten
  // would keep getting campaigns. If it cannot be queued, nothing is deleted,
  // so the owner can try again rather than lose the only record of the address.
  if (row?.email && !(await requestCrmErasure(String(row.email)))) redirect("/admin/email?e=crm_erase");

  const { error } = await supabase.from("subscribers").delete().eq("id", id);
  if (error) {
    console.error("[email] subscriber delete failed", error.message);
    redirect("/admin/email?e=db");
  }

  revalidatePath("/admin/email");
  redirect("/admin/email?ok=subscriber_deleted");
}
