"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminCan, requireAdminCapability } from "@/lib/admin";
import { isValidIdempotencyKey } from "@/lib/admin-api";
import { ApiError, validationError } from "@/lib/admin-api/errors";
import { createLeadBody, createOutreachLead } from "@/lib/admin-api/leads";
import { webApiContext } from "@/lib/admin-web-context";
import { readAddLeadValues, readWantsDemo, type AddLeadState } from "@/components/admin/leads/add-lead-state";

/**
 * Add a lead by hand from the web admin (staff in the field, on a phone).
 * The same rules as the app's POST /leads: the shared body schema
 * (createLeadBody) and the shared create (createOutreachLead), so the lead is
 * source "outreach", found by and assigned to whoever adds it, one email is
 * one lead, and a retry with the same idempotency key never adds it twice.
 * "They want a demo" (demos.request, only offered when the need is a website)
 * goes on to the demo request form for the new lead, like "Client wants a
 * demo" on New client.
 */
export async function addLeadAction(prev: AddLeadState, form: FormData): Promise<AddLeadState> {
  const admin = await requireAdminCapability("leads.create");
  const values = readAddLeadValues(form);
  // Not part of the key: ticking it again after a failed try is the same lead.
  const wantsDemo = readWantsDemo(form);
  // One key per page load AND per set of details, like the app's key per intent:
  // a double tap or a retry adds the lead once, while Back and a different lead
  // on the same page (a reused page key) still adds the new one.
  const pageKey = String(form.get("idempotency_key") ?? "");
  const key = isValidIdempotencyKey(pageKey)
    ? `web:${pageKey.slice(0, 80)}:${createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 32)}`
    : null;

  let leadId: string;
  try {
    const parsed = createLeadBody.safeParse({
      name: values.name,
      business: values.business,
      email: values.email,
      phone: values.phone,
      website: values.website,
      need: values.need,
      message: values.message,
    });
    if (!parsed.success) throw validationError(parsed.error);
    const lead = await createOutreachLead(webApiContext(admin), parsed.data, key);
    leadId = lead.id;
  } catch (err) {
    const failed = { attempt: prev.attempt + 1, values, wantsDemo };
    if (err instanceof ApiError) {
      return {
        ...failed,
        message: err.message,
        fields: err.fields ?? {},
        duplicateEmail: err.code === "duplicate" ? values.email.toLowerCase() : null,
      };
    }
    console.error("[admin] add lead failed", err);
    return { ...failed, message: "Could not add the lead. Check your connection and try again.", fields: {}, duplicateEmail: null };
  }

  revalidatePath("/admin/leads");
  if (wantsDemo && values.need === "website" && adminCan(admin, "demos.request")) {
    // Straight on to the demo request form for this lead (it says "Lead added.").
    const prefill = new URLSearchParams({ leadId, added: "1" });
    if (values.business) prefill.set("businessName", values.business);
    redirect(`/admin/demos/new?${prefill.toString()}`);
  }
  redirect(`/admin/leads?added=${encodeURIComponent(leadId)}`);
}
