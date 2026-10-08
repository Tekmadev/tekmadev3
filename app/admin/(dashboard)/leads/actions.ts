"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminCan, requireAdmin, requireAdminCapability } from "@/lib/admin";
import { ApiError, validationError } from "@/lib/admin-api/errors";
import { createLeadBody, createOutreachLead } from "@/lib/admin-api/leads";
import { webApiContext } from "@/lib/admin-web-context";
import type { LeadActionResult, LeadListParams, LeadPageResult, LogTouchFormInput, TouchPageResult } from "@/lib/leads-ui";
import {
  changedLeadDetails,
  claimLeadBooking,
  editLeadDetails,
  loadMoreLeads,
  loadMoreTouches,
  logLeadTouch,
  setLeadAssignee,
  setLeadFollowUp,
  setLeadStatus,
  webIdempotencyKey,
} from "@/lib/leads-web";
import { readAddLeadValues, readWantsDemo, type AddLeadState } from "@/components/admin/leads/add-lead-state";
import { readEditLeadForm, type EditLeadState } from "@/components/admin/leads/edit-lead-state";

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
  // One key per page load AND per set of details (the same rule as Log outreach):
  // a double tap or a retry adds the lead once, while Back and a different lead
  // on the same page (a reused page key) still adds the new one.
  const key = webIdempotencyKey(form.get("idempotency_key"), values);

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
  revalidatePath("/admin");
  if (wantsDemo && values.need === "website" && adminCan(admin, "demos.request")) {
    // Straight on to the demo request form for this lead (it says "Lead added.").
    const prefill = new URLSearchParams({ leadId, added: "1" });
    if (values.business) prefill.set("businessName", values.business);
    redirect(`/admin/demos/new?${prefill.toString()}`);
  }
  redirect(`/admin/leads/${encodeURIComponent(leadId)}?added=1`);
}

/* ------------------------------------------------------------------ */
/* The lead workspace: thin shells over lib/leads-web.ts, which checks  */
/* the capability itself and runs the API's own rules.                  */
/* ------------------------------------------------------------------ */

/** After a write: the list, the lead and Overview (its follow-up panel) show the change. */
function revalidateLead(leadId: unknown): void {
  revalidatePath("/admin/leads");
  if (typeof leadId === "string" && leadId) revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin");
}

/**
 * Edit lead (leads.update; the details of a lead need its canEdit, which the
 * shared update checks again): only what the person changed, by the same
 * rules, codes and copy as PATCH /leads/:id. A failed try keeps everything
 * typed and puts each field's message under it; success opens the lead,
 * which says "Lead updated.". With nothing changed (the form keeps Save off
 * then, like the app) nothing is written and the lead opens without a word.
 */
export async function editLeadAction(prev: EditLeadState, form: FormData): Promise<EditLeadState> {
  const admin = await requireAdminCapability("leads.update");
  const { leadId, values, shown } = readEditLeadForm(form);
  const result = await editLeadDetails(admin, { leadId, values, shown });
  if (!result.ok) {
    return {
      attempt: (typeof prev?.attempt === "number" ? prev.attempt : 0) + 1,
      message: result.message,
      fields: result.fields ?? {},
      duplicateEmail: result.code === "duplicate" ? values.email.toLowerCase() : null,
      values,
    };
  }
  revalidateLead(result.lead.id);
  const changed = Object.keys(changedLeadDetails(values, shown)).length > 0;
  redirect(`/admin/leads/${encodeURIComponent(result.lead.id)}${changed ? "?updated=1" : ""}`);
}

/** Status (leads.update). */
export async function setLeadStatusAction(input: { leadId: string; status: string }): Promise<LeadActionResult> {
  const admin = await requireAdmin();
  const result = await setLeadStatus(admin, input);
  if (result.ok) revalidateLead(result.lead.id);
  return result;
}

/** Follow-up (leads.update): Toronto datetime-local, or null to clear. */
export async function setLeadFollowUpAction(input: { leadId: string; followUpAt: string | null }): Promise<LeadActionResult> {
  const admin = await requireAdmin();
  const result = await setLeadFollowUp(admin, input);
  if (result.ok) revalidateLead(result.lead.id);
  return result;
}

/** Owner (leads.update): a teammate's email, or null for nobody. */
export async function setLeadAssigneeAction(input: { leadId: string; assignedTo: string | null }): Promise<LeadActionResult> {
  const admin = await requireAdmin();
  const result = await setLeadAssignee(admin, input);
  if (result.ok) revalidateLead(result.lead.id);
  return result;
}

/** "I booked this call" (leads.update). */
export async function claimLeadBookingAction(input: { leadId: string }): Promise<LeadActionResult> {
  const admin = await requireAdmin();
  const result = await claimLeadBooking(admin, input);
  if (result.ok) revalidateLead(result.lead.id);
  return result;
}

/** Log outreach (leads.outreach). */
export async function logLeadTouchAction(input: LogTouchFormInput): Promise<LeadActionResult> {
  const admin = await requireAdmin();
  const result = await logLeadTouch(admin, input);
  if (result.ok) revalidateLead(result.lead.id);
  return result;
}

/** "Show more leads" (leads.view). The browser's params and cursor are re-checked in lib/leads-web.ts. */
export async function loadMoreLeadsAction(input: { params: LeadListParams; cursor: string }): Promise<LeadPageResult> {
  const admin = await requireAdmin();
  return loadMoreLeads(admin, input?.params, input?.cursor);
}

/** Older touches on a lead (leads.view). */
export async function loadMoreTouchesAction(input: { leadId: string; cursor: string }): Promise<TouchPageResult> {
  const admin = await requireAdmin();
  return loadMoreTouches(admin, input?.leadId, input?.cursor);
}
