"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getPortalSession, hasRole, setActiveClientCookie, type PortalSession } from "@/lib/portal-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  db,
  getMemberById,
  logActivity,
  markNotificationsRead,
  updateClient,
  updateMember,
  type Client,
  type MemberRole,
} from "@/lib/clients-data";
import {
  ASSET_BUCKET,
  completeTaskByKey,
  createAssetRecord,
  createSignedUpload,
  decideApproval,
  getAccessGrant,
  getActiveOnboarding,
  getAgreement,
  getApproval,
  getAsset,
  getTaskById,
  isTaskOpen,
  safeFileName,
  saveIntake,
  setTaskStatus,
  softDeleteAsset,
  updateAccessGrant,
  updateAgreement,
  type AssetKind,
} from "@/lib/onboarding-data";
import { INTAKE_FIELDS, INTAKE_SCHEMA_VERSION, intakeCompletion, parseIntakeForm } from "@/lib/intake-schema";
import { inviteMember, sendPortalInvite } from "@/lib/client-provisioning";
import { portalUrl } from "@/lib/portal-host";
import type { ActionResult } from "@/components/portal/PortalForm";
import type { UploadTicket } from "@/components/portal/AssetUploader";

/**
 * Portal server actions. Every action re-checks the session and verifies the
 * target row belongs to the active client before touching it. Actions return
 * an ActionResult (rendered by <PortalForm>) and revalidate the portal tree
 * so the page refreshes in place. They never call redirect(); see PortalForm.
 */

const ASSET_KINDS: AssetKind[] = ["logo", "photo", "brand_guide", "document", "video", "other"];
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const SIGNED_OUT: ActionResult = { ok: false, redirect: "/login" };
const ADMIN_ONLY: ActionResult = { ok: false, message: "Only account owners and admins can do this." };

function s(v: FormDataEntryValue | null, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}

function refresh() {
  revalidatePath("/", "layout");
}

async function session(minimum?: MemberRole): Promise<PortalSession | ActionResult> {
  const sess = await getPortalSession();
  if (!sess) return SIGNED_OUT;
  if (minimum && !hasRole(sess, minimum)) return ADMIN_ONLY;
  return sess;
}

function isResult(x: PortalSession | ActionResult): x is ActionResult {
  return !x || !("client" in x);
}

function who(sess: PortalSession): string {
  return sess.member.name || sess.email;
}

// ---------------------------------------------------------------------------
// Account switching
// ---------------------------------------------------------------------------

export async function switchClientAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  const clientId = s(formData.get("client_id"));
  if (sess.memberships.some((m) => m.client_id === clientId)) {
    await setActiveClientCookie(clientId);
  }
  return { ok: true, redirect: "/" };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function completeTaskAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  const task = await getTaskById(s(formData.get("task_id")));
  if (!task || task.client_id !== sess.client.id) return { ok: false, message: "That task no longer exists." };
  if (task.owner !== "client" || !(task.kind === "checklist" || task.kind === "call")) return { ok: false, message: "That task is not yours to complete." };
  if (!isTaskOpen(task)) return { ok: true };

  await setTaskStatus(task.id, "done", sess.email);
  await logActivity({
    client_id: sess.client.id,
    actor_type: "client",
    actor_email: sess.email,
    event: "task.completed",
    entity_type: "task",
    entity_id: task.id,
    summary: `${who(sess)} completed "${task.title}"`,
    visibility: "client",
  });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export async function saveIntakeAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  const submit = s(formData.get("intent")) === "submit";
  const answers = parseIntakeForm(formData);

  if (submit) {
    const { missingRequired } = intakeCompletion(answers);
    if (missingRequired.length) {
      const labels = missingRequired.map((k) => INTAKE_FIELDS.find((f) => f.key === k)?.label ?? k);
      // Keep what they typed: save a draft, then explain.
      const onboarding = await getActiveOnboarding(sess.client.id);
      await saveIntake({ client_id: sess.client.id, onboarding_id: onboarding?.id ?? null, schema_version: INTAKE_SCHEMA_VERSION, answers, submit: false, by: sess.email });
      refresh();
      return { ok: false, message: `Saved as a draft. Still missing: ${labels.join(", ")}.` };
    }
  }

  const onboarding = await getActiveOnboarding(sess.client.id);
  await saveIntake({
    client_id: sess.client.id,
    onboarding_id: onboarding?.id ?? null,
    schema_version: INTAKE_SCHEMA_VERSION,
    answers,
    submit,
    by: sess.email,
  });

  if (submit) {
    // Promote the fields the rest of the system reads from the account row.
    const patch: Partial<Client> = {};
    const str = (k: string) => (typeof answers[k] === "string" ? (answers[k] as string) : null);
    if (str("business_name")) patch.business_name = str("business_name") as string;
    if (str("legal_name")) patch.legal_name = str("legal_name");
    if (str("website_url")) patch.website_url = str("website_url");
    if (str("main_phone")) patch.primary_phone = str("main_phone");
    if (str("service_area")) patch.service_area = str("service_area");
    if (str("industry")) patch.industry = str("industry");
    if (Object.keys(patch).length) await updateClient(sess.client.id, patch, sess.email);

    if (onboarding) await completeTaskByKey(onboarding.id, "intake.business_profile", sess.email);
    await logActivity({
      client_id: sess.client.id,
      actor_type: "client",
      actor_email: sess.email,
      event: "intake.submitted",
      entity_type: "intake",
      summary: `${who(sess)} submitted the business intake`,
      visibility: "client",
    });
  }

  refresh();
  return { ok: true, message: submit ? "Submitted. Your strategist will review it before the kickoff call." : "Draft saved. Come back anytime." };
}

// ---------------------------------------------------------------------------
// Access grants
// ---------------------------------------------------------------------------

export async function accessGrantAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  const grant = await getAccessGrant(s(formData.get("grant_id")));
  if (!grant || grant.client_id !== sess.client.id) return { ok: false, message: "That request no longer exists." };
  const intent = s(formData.get("intent"));
  const identifier = s(formData.get("account_identifier"), 200) || null;

  if (intent === "done") {
    await updateAccessGrant(grant.id, {
      status: "client_says_done",
      client_marked_done_at: new Date().toISOString(),
      account_identifier: identifier ?? grant.account_identifier,
    });
    if (grant.task_id) await setTaskStatus(grant.task_id, "done", sess.email);
    await logActivity({
      client_id: sess.client.id,
      actor_type: "client",
      actor_email: sess.email,
      event: "access.client_marked_done",
      entity_type: "access_grant",
      entity_id: grant.id,
      summary: `${who(sess)} granted ${grant.label ?? grant.provider} access`,
      visibility: "client",
      data: { provider: grant.provider, account_identifier: identifier },
    });
    refresh();
    return { ok: true, message: "Thanks. We will confirm the access on our side." };
  }
  if (intent === "na") {
    await updateAccessGrant(grant.id, { status: "not_applicable", notes: "Client marked as not applicable" });
    if (grant.task_id) await setTaskStatus(grant.task_id, "skipped", sess.email);
    await logActivity({
      client_id: sess.client.id,
      actor_type: "client",
      actor_email: sess.email,
      event: "access.not_applicable",
      entity_type: "access_grant",
      entity_id: grant.id,
      summary: `${grant.label ?? grant.provider}: client does not have this account`,
      visibility: "client",
    });
    refresh();
    return { ok: true, message: "Noted. We will set this up for you or skip it." };
  }
  return { ok: false, message: "Nothing to do." };
}

// ---------------------------------------------------------------------------
// Assets (browser uploads straight to Storage via signed URLs)
// ---------------------------------------------------------------------------

export async function requestUploadAction(input: {
  fileName: string;
  kind: AssetKind;
  size: number;
  type: string;
}): Promise<UploadTicket> {
  const sess = await getPortalSession();
  if (!sess) return { ok: false, error: "Your session expired. Reload and sign in again." };
  if (!ASSET_KINDS.includes(input.kind)) return { ok: false, error: "Unknown file type." };
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File must be between 1 byte and 50 MB." };
  }
  const path = `${sess.client.id}/${Date.now()}-${safeFileName(input.fileName)}`;
  const ticket = await createSignedUpload(path);
  if (!ticket) return { ok: false, error: "Could not start the upload. Try again in a moment." };
  return { ok: true, path: ticket.path, token: ticket.token, bucket: ASSET_BUCKET };
}

export async function recordUploadAction(input: {
  path: string;
  fileName: string;
  kind: AssetKind;
  size: number;
  type: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sess = await getPortalSession();
  if (!sess) return { ok: false, error: "Your session expired. Reload and sign in again." };
  if (!input.path.startsWith(`${sess.client.id}/`)) return { ok: false, error: "Bad path." };
  if (!ASSET_KINDS.includes(input.kind)) return { ok: false, error: "Unknown file type." };

  const onboarding = await getActiveOnboarding(sess.client.id);
  try {
    const asset = await createAssetRecord({
      client_id: sess.client.id,
      onboarding_id: onboarding?.id ?? null,
      kind: input.kind,
      storage_path: input.path,
      file_name: input.fileName.slice(0, 200),
      mime_type: input.type || null,
      size_bytes: input.size,
      uploaded_by: sess.email,
      uploaded_by_type: "client",
    });
    if (onboarding) await completeTaskByKey(onboarding.id, "intake.brand_assets", sess.email);
    await logActivity({
      client_id: sess.client.id,
      actor_type: "client",
      actor_email: sess.email,
      event: "asset.uploaded",
      entity_type: "asset",
      entity_id: asset.id,
      summary: `${who(sess)} uploaded ${asset.file_name} (${input.kind})`,
      visibility: "client",
    });
    refresh();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not record the upload." };
  }
}

export async function deleteAssetAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  const asset = await getAsset(s(formData.get("asset_id")));
  if (!asset || asset.client_id !== sess.client.id) return { ok: false, message: "That file no longer exists." };
  await softDeleteAsset(asset.id);
  // Best effort: remove the object too. The row keeps the audit trail.
  await db().storage.from(asset.bucket).remove([asset.storage_path]).catch(() => {});
  await logActivity({
    client_id: sess.client.id,
    actor_type: "client",
    actor_email: sess.email,
    event: "asset.deleted",
    entity_type: "asset",
    entity_id: asset.id,
    summary: `${who(sess)} removed ${asset.file_name}`,
  });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function decideApprovalAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  const approval = await getApproval(s(formData.get("approval_id")));
  if (!approval || approval.client_id !== sess.client.id || approval.status !== "pending") {
    return { ok: false, message: "That approval is no longer open." };
  }
  const decision = s(formData.get("decision")) === "approve" ? "approved" : "changes_requested";
  const feedback = s(formData.get("feedback"), 4000) || null;
  if (decision === "changes_requested" && !feedback) return { ok: false, message: "Tell us what to change so we can fix it in one pass." };

  await decideApproval(approval.id, decision, sess.email, feedback);
  if (approval.task_id) {
    await setTaskStatus(approval.task_id, decision === "approved" ? "done" : "in_progress", sess.email);
  }
  await logActivity({
    client_id: sess.client.id,
    actor_type: "client",
    actor_email: sess.email,
    event: decision === "approved" ? "approval.approved" : "approval.changes_requested",
    entity_type: "approval",
    entity_id: approval.id,
    summary:
      decision === "approved"
        ? `${who(sess)} approved "${approval.title}" (v${approval.version})`
        : `${who(sess)} requested changes on "${approval.title}"`,
    visibility: "client",
    data: feedback ? { feedback } : {},
  });
  refresh();
  return { ok: true, message: decision === "approved" ? "Approved. Your strategist has been notified." : "Got it. We will make the changes and send a new version." };
}

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

export async function acceptAgreementAction(formData: FormData): Promise<ActionResult> {
  const sess = await session("admin");
  if (isResult(sess)) return sess;
  const agreement = await getAgreement(s(formData.get("agreement_id")));
  if (!agreement || agreement.client_id !== sess.client.id) return { ok: false, message: "That agreement no longer exists." };
  if (agreement.status === "signed") return { ok: true, message: "Already accepted." };

  const accepted = formData.get("accept") === "on";
  const signerName = s(formData.get("signer_name"), 120);
  const signerTitle = s(formData.get("signer_title"), 120) || null;
  if (!accepted || !signerName) return { ok: false, message: "Tick the box and type your full name to accept." };

  const h = await headers();
  const now = new Date().toISOString();
  await updateAgreement(agreement.id, {
    status: "signed",
    signed_at: now,
    viewed_at: agreement.viewed_at ?? now,
    signer_name: signerName,
    signer_email: sess.email,
    signer_title: signerTitle,
    signature_method: "click_accept",
    evidence: {
      method: "click_accept",
      accepted_at: now,
      user_id: sess.user.id,
      member_id: sess.member.id,
      email: sess.email,
      version: agreement.version,
      content_hash: agreement.content_hash,
      document_url: agreement.document_url,
      user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
      host: h.get("host"),
    },
  });
  if (agreement.task_id) await setTaskStatus(agreement.task_id, "done", sess.email);
  if (!sess.member.name) await updateMember(sess.member.id, { name: signerName });
  await logActivity({
    client_id: sess.client.id,
    actor_type: "client",
    actor_email: sess.email,
    event: "agreement.signed",
    entity_type: "agreement",
    entity_id: agreement.id,
    summary: `${signerName} accepted ${agreement.title} (v${agreement.version})`,
    visibility: "client",
  });
  refresh();
  return { ok: true, message: "Accepted. A copy of the record is on your account." };
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export async function inviteTeamMemberAction(formData: FormData): Promise<ActionResult> {
  const sess = await session("admin");
  if (isResult(sess)) return sess;
  const email = s(formData.get("email"), 200).toLowerCase();
  const name = s(formData.get("name"), 120) || null;
  const title = s(formData.get("title"), 120) || null;
  const role = s(formData.get("role")) === "admin" ? "admin" : "member";
  if (!email.includes("@")) return { ok: false, message: "Enter a valid email." };

  const { invite } = await inviteMember({
    client_id: sess.client.id,
    email,
    name,
    title,
    role,
    invited_by: sess.email,
    actor_type: "client",
  });
  refresh();
  return invite.ok
    ? { ok: true, message: `Invite sent to ${email}. They will get an email to set their password.` }
    : { ok: false, message: "Could not send the invite. Try again or contact us." };
}

export async function resendMemberInviteAction(formData: FormData): Promise<ActionResult> {
  const sess = await session("admin");
  if (isResult(sess)) return sess;
  const member = await getMemberById(s(formData.get("member_id")));
  if (!member || member.client_id !== sess.client.id) return { ok: false, message: "That person is not on this account." };
  const result = await sendPortalInvite(member.email, member.name);
  return result.ok ? { ok: true, message: `Invite re-sent to ${member.email}.` } : { ok: false, message: "Could not send the invite. Try again or contact us." };
}

export async function disableMemberAction(formData: FormData): Promise<ActionResult> {
  const sess = await session("admin");
  if (isResult(sess)) return sess;
  const member = await getMemberById(s(formData.get("member_id")));
  if (!member || member.client_id !== sess.client.id) return { ok: false, message: "That person is not on this account." };
  if (member.id === sess.member.id) return { ok: false, message: "You cannot remove yourself." };
  if (member.role === "owner" && sess.member.role !== "owner") return { ok: false, message: "Only the account owner can remove an owner." };

  await updateMember(member.id, { status: "disabled" });
  await logActivity({
    client_id: sess.client.id,
    actor_type: "client",
    actor_email: sess.email,
    event: "member.disabled",
    entity_type: "member",
    entity_id: member.id,
    summary: `${who(sess)} removed ${member.email}`,
    visibility: "client",
  });
  refresh();
  return { ok: true, message: `${member.email} no longer has access.` };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  const name = s(formData.get("name"), 120) || null;
  const title = s(formData.get("title"), 120) || null;
  await updateMember(sess.member.id, { name, title });
  const supabase = await createSupabaseServerClient();
  if (supabase && name) await supabase.auth.updateUser({ data: { name } });
  refresh();
  return { ok: true, message: "Profile saved." };
}

export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, message: "The two passwords do not match." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Could not update. Try again." };
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { ok: false, message: "Could not update. Try again." } : { ok: true, message: "Password updated." };
}

export async function updateNotificationsAction(formData: FormData): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  await updateMember(sess.member.id, {
    notifications: { ...sess.member.notifications, email: formData.get("email") === "on" },
  });
  refresh();
  return { ok: true, message: "Saved." };
}

export async function markNotificationsReadAction(): Promise<ActionResult> {
  const sess = await session();
  if (isResult(sess)) return sess;
  await markNotificationsRead(sess.client.id, sess.member.id);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Billing (Stripe's hosted customer portal; card data never touches us)
// ---------------------------------------------------------------------------

export async function billingPortalAction(): Promise<ActionResult> {
  const sess = await session("admin");
  if (isResult(sess)) return sess;
  const secret = process.env.STRIPE_SECRET_KEY;
  const customer = sess.client.stripe_customer_id;
  const unavailable: ActionResult = { ok: false, message: "Billing management is not available for this account yet. Email us and we will sort it out." };
  if (!secret || !customer) return unavailable;

  const stripe = new Stripe(secret);
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer,
      return_url: portalUrl("/billing"),
    });
    return { ok: true, redirect: portalSession.url };
  } catch (err) {
    console.error("[billing portal]", err instanceof Error ? err.message : String(err));
    return unavailable;
  }
}
