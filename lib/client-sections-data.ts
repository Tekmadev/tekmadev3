import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveAdminNotifications } from "@/lib/admin-notify";
import { accessProvider, type AccessProviderKey } from "@/lib/access-providers";
import { sendPortalInvite, type InviteResult } from "@/lib/client-provisioning";
import { createNotification, getClientById, logActivity, type ClientActivity, type ClientMember } from "@/lib/clients-data";
import {
  createAccessGrant,
  createApproval,
  createBookedCall,
  getActiveOnboarding,
  getTaskById,
  isTaskOpen,
  refreshGuaranteeStatus,
  setTaskStatus,
  updateAccessGrant,
  updateBookedCall,
  type AccessGrant,
  type AccessGrantStatus,
  type ApprovalKind,
  type BookedCall,
  type ClientApproval,
} from "@/lib/onboarding-data";

/**
 * The client detail sections' writes, shared by the web admin's server actions
 * (app/admin/(dashboard)/clients/actions.ts) and the admin API
 * (app/api/admin/v1/**). Each function does the write and every side effect
 * that goes with it (activity trail, client notification, inbox resolution,
 * checklist sync, guarantee refresh), so the web and the app can never drift.
 * Authorization and input validation stay with the caller.
 */

// ---------------------------------------------------------------------------
// Access grants
// ---------------------------------------------------------------------------

/** "Request another access": the grant, the activity line and the client's notification. */
export async function requestClientAccess(input: {
  clientId: string;
  provider: AccessProviderKey;
  /** null: the provider's own label. */
  label: string | null;
  notes: string | null;
  by: string;
  metadata?: Record<string, unknown>;
}): Promise<AccessGrant> {
  const def = accessProvider(input.provider);
  const grant = await createAccessGrant({
    client_id: input.clientId,
    provider: def.key,
    method: def.method,
    label: input.label ?? def.label,
    notes: input.notes,
    metadata: input.metadata,
  });
  await logActivity({
    client_id: input.clientId,
    actor_type: "admin",
    actor_email: input.by,
    event: "access.requested",
    entity_type: "access_grant",
    entity_id: grant.id,
    summary: `Access requested: ${grant.label}`,
    visibility: "client",
  });
  await createNotification({
    client_id: input.clientId,
    template_key: "access_requested",
    subject: `We need access: ${grant.label}`,
    body: def.summary,
    action_url: "/access",
  });
  return grant;
}

/**
 * A staff decision on an access grant: the status (with its time stamps), the
 * note shown to the client, the inbox items it answers, the checklist task it
 * belongs to, and the activity line.
 */
export async function setClientAccessStatus(input: {
  grant: AccessGrant;
  status: AccessGrantStatus;
  /** The note to keep (the caller decides whether an empty one keeps the old). */
  notes: string | null;
  by: string;
  /** More columns to write with the status (the API stamps or clears the client's "done" time). */
  extra?: Partial<AccessGrant>;
  /**
   * When the status did not change, write only the note: no time stamps, no
   * task sync, no activity line (the API's note-only edit). The web admin
   * leaves it off, so re-saving a status there re-applies everything.
   */
  onlyOnChange?: boolean;
}): Promise<AccessGrant> {
  const { grant, status } = input;
  const now = new Date().toISOString();
  const changed = status !== grant.status;
  const full = changed || !input.onlyOnChange;
  const patch: Partial<AccessGrant> = { ...input.extra, status, notes: input.notes };
  if (full && status === "granted" && !grant.granted_at) patch.granted_at = now;
  if (full && status === "verified") {
    patch.granted_at = grant.granted_at ?? now;
    patch.verified_at = now;
    patch.verified_by = input.by;
  }
  if (full && status === "revoked") patch.revoked_at = now;
  const updated = await updateAccessGrant(grant.id, patch);
  // Staff have dealt with it, one way or another: the "verify it" item closes
  // by itself instead of waiting for someone to tick it off in the inbox too.
  if (changed) {
    await resolveAdminNotifications({
      events: ["onboarding.access_marked_done", "onboarding.access_not_applicable"],
      entityId: grant.id,
      by: input.by,
    });
  }
  if (!full) return updated;
  if (status === "verified" && grant.task_id) await setTaskStatus(grant.task_id, "done", input.by);
  if (status === "pending_client" && grant.task_id) await setTaskStatus(grant.task_id, "waiting_on_client", input.by);
  await logActivity({
    client_id: grant.client_id,
    actor_type: "admin",
    actor_email: input.by,
    event: `access.${status}`,
    entity_type: "access_grant",
    entity_id: grant.id,
    summary: `${grant.label ?? grant.provider}: ${status.replace(/_/g, " ")}`,
    visibility: status === "verified" || status === "pending_client" ? "client" : "internal",
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

/**
 * Ask the client to sign off on a deliverable: the approval (a new version
 * supersedes the open one), the linked checklist task waits on the client,
 * the activity line and the client's notification.
 */
export async function requestClientApproval(input: {
  clientId: string;
  title: string;
  kind: ApprovalKind;
  description: string | null;
  previewUrl: string | null;
  taskId: string | null;
  attachments: { label: string; url: string }[];
  by: string;
  /** What makes a new version: the same task (web, the default) or the same title (API). */
  versionBy?: "task" | "title";
  /** "always" (web): the linked task waits on the client. "open": only a task that is still open. */
  taskRule?: "always" | "open";
}): Promise<ClientApproval> {
  const onboarding = await getActiveOnboarding(input.clientId);
  const approval = await createApproval({
    client_id: input.clientId,
    onboarding_id: onboarding?.id ?? null,
    task_id: input.taskId,
    kind: input.kind,
    title: input.title,
    description: input.description,
    preview_url: input.previewUrl,
    attachments: input.attachments,
    requested_by: input.by,
    version_by: input.versionBy,
  });
  if (input.taskId) {
    if ((input.taskRule ?? "always") === "always") {
      await setTaskStatus(input.taskId, "waiting_on_client", input.by);
    } else {
      const task = await getTaskById(input.taskId);
      if (task && isTaskOpen(task) && task.status !== "waiting_on_client") await setTaskStatus(task.id, "waiting_on_client", input.by);
    }
  }
  await logActivity({
    client_id: input.clientId,
    actor_type: "admin",
    actor_email: input.by,
    event: "approval.requested",
    entity_type: "approval",
    entity_id: approval.id,
    summary: `Approval requested: ${input.title} (v${approval.version})`,
    visibility: "client",
  });
  await createNotification({
    client_id: input.clientId,
    template_key: "approval_requested",
    subject: `Please review: ${input.title}`,
    body: approval.description,
    action_url: "/approvals",
  });
  return approval;
}

// ---------------------------------------------------------------------------
// Booked calls
// ---------------------------------------------------------------------------

/** A booked call logged by staff (it counts at once), its activity line, and the guarantee check. */
export async function logClientBookedCall(input: Partial<BookedCall> & { client_id: string }, by: string): Promise<BookedCall> {
  const call = await createBookedCall(input);
  await logActivity({
    client_id: input.client_id,
    actor_type: "admin",
    actor_email: by,
    event: "call.added",
    entity_type: "booked_call",
    entity_id: call.id,
    summary: `Booked call added: ${call.contact_name ?? "unknown"}`,
  });
  await refreshGuaranteeStatus(input.client_id, by);
  return call;
}

/**
 * A staff edit or review of a booked call, then the guarantee check. An
 * appointment that came in from the CRM raised a "needs reviewing" inbox card
 * keyed by its external id; reviewing it is the answer, so the card closes.
 */
export async function saveBookedCallReview(input: {
  callId: string;
  clientId: string;
  patch: Partial<BookedCall>;
  by: string;
  /** The call's external id, when the inbox card it raised should close. */
  externalId: string | null;
}): Promise<BookedCall> {
  const call = await updateBookedCall(input.callId, input.patch);
  await refreshGuaranteeStatus(input.clientId, input.by);
  if (input.externalId) await resolveAdminNotifications({ events: ["client.appointment_booked"], entityId: input.externalId, by: input.by });
  return call;
}

// ---------------------------------------------------------------------------
// CRM sub-account mapping (owner only)
// ---------------------------------------------------------------------------

export type CrmMappingResult =
  | { ok: true }
  /** Supabase missing or a read or write failed. Nothing was changed, or the unlink alone ran. */
  | { ok: false; reason: "db" }
  /** The id is marked as Tekmadev's own sales sub-account. */
  | { ok: false; reason: "agency" }
  /** The id is Tekmadev's own CRM location (env). */
  | { ok: false; reason: "own" }
  /** Another client already has this sub-account. */
  | { ok: false; reason: "taken"; clientId: string };

/**
 * Which CRM sub-account belongs to a client, and which of its calendars count
 * toward the guarantee. `locationId` null unlinks. Ids are validated by the
 * caller. An empty calendar list counts every appointment in the account.
 */
export async function saveClientCrmMapping(input: {
  clientId: string;
  locationId: string | null;
  calendarIds: string[];
  by: string;
}): Promise<CrmMappingResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "db" };
  const { clientId, locationId, calendarIds: calendars } = input;

  if (locationId) {
    const { data: taken, error: takenError } = await supabase
      .from("crm_locations")
      .select("client_id,is_agency")
      .eq("ghl_location_id", locationId)
      .maybeSingle();
    if (takenError) return { ok: false, reason: "db" };
    const row = taken as { client_id: string | null; is_agency: boolean | null } | null;
    // Never silently moved from one client to another: the other client's
    // appointments would start counting toward this one's guarantee.
    if (row?.is_agency) return { ok: false, reason: "agency" };
    if (row?.client_id && row.client_id !== clientId) return { ok: false, reason: "taken", clientId: row.client_id };
    if (locationId === (process.env.GHL_LOCATION_ID ?? "").trim()) return { ok: false, reason: "own" };
  }

  // One sub-account per client. Unlink whatever this client pointed at before,
  // rather than deleting it, so a mistake is one save away from undone.
  const { error: unlinkError } = await supabase
    .from("crm_locations")
    .update({ client_id: null, updated_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .neq("ghl_location_id", locationId || "__none__");
  if (unlinkError) return { ok: false, reason: "db" };

  if (locationId) {
    const client = await getClientById(clientId);
    const { error } = await supabase.from("crm_locations").upsert(
      {
        ghl_location_id: locationId,
        client_id: clientId,
        label: client?.business_name ?? null,
        qualifying_calendar_ids: calendars,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ghl_location_id" },
    );
    if (error) {
      console.error("[clients] crm location save failed", error.message);
      return { ok: false, reason: "db" };
    }

    // Appointments that arrived before the mapping existed were held, not
    // dropped. Make them due now so they land on this client's next sync pass.
    const { error: heldError } = await supabase
      .from("crm_inbox")
      .update({ status: "pending", next_attempt_at: new Date().toISOString() })
      .eq("location_id", locationId)
      .eq("status", "unmapped");
    if (heldError) console.error("[clients] could not release held appointments", heldError.message);
    await resolveAdminNotifications({ events: ["crm.inbound_unmapped"], entityId: locationId, by: input.by });
  }

  await logActivity({
    client_id: clientId,
    actor_type: "admin",
    actor_email: input.by,
    event: "crm.location_mapped",
    entity_type: "client",
    entity_id: clientId,
    // Internal: the client's portal has no business showing CRM plumbing.
    visibility: "internal",
    summary: locationId
      ? `CRM account set to ${locationId}${calendars.length ? `, ${calendars.length} qualifying calendar${calendars.length === 1 ? "" : "s"}` : ", every calendar counts"}`
      : "CRM account unlinked",
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Portal team
// ---------------------------------------------------------------------------

/**
 * Sends a portal person their link again (see sendPortalInvite), and the
 * activity line. `kind` words the email and the activity line: "reset" for
 * people who already joined, "invite" for everyone else.
 */
export async function sendMemberLink(member: ClientMember, by: string, kind: "invite" | "reset" = "invite"): Promise<InviteResult> {
  const result = await sendPortalInvite(member.email, member.name, kind);
  await logActivity({
    client_id: member.client_id,
    actor_type: "admin",
    actor_email: by,
    event: result.ok ? (kind === "reset" ? "member.reset_sent" : "member.invite_resent") : "member.invite_failed",
    entity_type: "member",
    entity_id: member.id,
    summary: result.ok
      ? kind === "reset"
        ? `Password reset link sent to ${member.email}`
        : `Invite re-sent to ${member.email}`
      : `Invite failed: ${result.error}`,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Notes and client updates
// ---------------------------------------------------------------------------

/**
 * An internal note, or an update shown in the client's portal (no email). The
 * activity row keeps the full text as its summary (what the web admin shows);
 * an update also keeps its subject and link in `data`. Returns the row, or
 * null when it could not be saved.
 */
export async function postClientNote(input: {
  clientId: string;
  kind: "note" | "update";
  text: string;
  subject: string | null;
  actionUrl: string | null;
  by: string;
}): Promise<ClientActivity | null> {
  const toClient = input.kind === "update";
  const entry = await logActivity({
    client_id: input.clientId,
    actor_type: "admin",
    actor_email: input.by,
    event: toClient ? "update.sent" : "note",
    summary: input.text,
    visibility: toClient ? "client" : "internal",
    data: toClient ? { subject: input.subject, action_url: input.actionUrl } : {},
  });
  if (toClient) {
    await createNotification({
      client_id: input.clientId,
      template_key: "update",
      subject: input.subject ?? "Update from Tekmadev",
      body: input.text,
      action_url: input.actionUrl,
    });
  }
  return entry;
}
