import { getSupabaseAdmin } from "@/lib/supabase";
import { requestCrmErasure } from "@/lib/crm/outbox";
import type { CampaignRow } from "@/lib/email-data";

/**
 * The writes behind /admin/email, shared by the web admin's server actions
 * (app/admin/(dashboard)/email/actions.ts) and the admin API
 * (app/api/admin/v1/email). Each one returns a reason instead of redirecting,
 * so the web action can keep its redirect codes and the API can answer with
 * its own status.
 *
 * Status changes on a subscriber are not here: they go through
 * setSubscriberStatus in lib/subscribers-data.ts, the one door every status
 * change uses.
 */

export type EmailCampaignInput = {
  /** Already normalised and validated by the caller. */
  key: string;
  name: string;
  subject: string | null;
  template: string | null;
  description: string | null;
};

export type EmailWriteFailure = { ok: false; reason: "config" | "db" };

export type CreateEmailCampaignResult = { ok: true; campaign: CampaignRow } | { ok: false; reason: "config" | "db" | "dupe" };

/** Register a campaign key. A key that already exists is `dupe` (email_campaigns_key_key is unique). */
export async function createEmailCampaign(input: EmailCampaignInput): Promise<CreateEmailCampaignResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      key: input.key,
      name: input.name,
      subject: input.subject,
      template: input.template,
      description: input.description,
      active: true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" || /duplicate key|unique/i.test(error.message)) return { ok: false, reason: "dupe" };
    console.error("[email] campaign insert failed", error.message);
    return { ok: false, reason: "db" };
  }
  return { ok: true, campaign: data as CampaignRow };
}

/**
 * Pause or resume a campaign. A label only: opens and clicks keep counting.
 * `campaign` is null when no campaign has that id.
 */
export async function setEmailCampaignActive(
  id: string,
  active: boolean,
): Promise<{ ok: true; campaign: CampaignRow | null } | EmailWriteFailure> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const { data, error } = await supabase.from("email_campaigns").update({ active }).eq("id", id).select("*").maybeSingle();
  if (error) {
    console.error("[email] campaign toggle failed", error.message);
    return { ok: false, reason: "db" };
  }
  return { ok: true, campaign: (data as CampaignRow | null) ?? null };
}

/**
 * Delete a campaign registration. Its past opens and clicks stay in
 * email_events (no foreign key), and adding the key again starts the counters
 * from zero. `deleted` is false when no campaign had that id.
 */
export async function deleteEmailCampaign(id: string): Promise<{ ok: true; deleted: boolean } | EmailWriteFailure> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const { data, error } = await supabase.from("email_campaigns").delete().eq("id", id).select("id");
  if (error) {
    console.error("[email] campaign delete failed", error.message);
    return { ok: false, reason: "db" };
  }
  return { ok: true, deleted: Array.isArray(data) && data.length > 0 };
}

export type EraseSubscriberResult = { ok: true; deleted: boolean } | { ok: false; reason: "config" | "db" | "crm_erase" };

/**
 * Permanent erasure of a subscriber, e.g. to satisfy a data-erasure request.
 *
 * The CRM half first. Deleting only our row would leave their contact tagged
 * for the newsletter and mailable, and a person who asked to be forgotten
 * would keep getting campaigns. If it cannot be queued, nothing is deleted
 * (`crm_erase`), so the owner can try again rather than lose the only record of
 * the address. The erasure also tombstones the address in crm_contacts, so
 * nothing queued for it is pushed and it is never pushed again.
 *
 * Deleting the row cascades its consent history (subscriber_events) away;
 * email_events keep their aggregate rows with subscriber_id set null.
 * `deleted` is false when no subscriber had that id.
 */
export async function eraseSubscriber(id: string): Promise<EraseSubscriberResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const { data: row, error: readError } = await supabase.from("subscribers").select("email").eq("id", id).maybeSingle();
  if (readError) {
    console.error("[email] subscriber read failed", readError.message);
    return { ok: false, reason: "db" };
  }
  if (!row) return { ok: true, deleted: false };
  const email = (row as { email?: unknown }).email;
  // email is NOT NULL, so a row without one is a hand edit with nothing to
  // erase in the CRM; the row itself still goes, as it always has.
  if (typeof email === "string" && email && !(await requestCrmErasure(email))) return { ok: false, reason: "crm_erase" };

  const { data: removed, error } = await supabase.from("subscribers").delete().eq("id", id).select("id");
  if (error) {
    console.error("[email] subscriber delete failed", error.message);
    return { ok: false, reason: "db" };
  }
  return { ok: true, deleted: Array.isArray(removed) && removed.length > 0 };
}
