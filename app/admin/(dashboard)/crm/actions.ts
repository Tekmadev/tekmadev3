"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { notifyAdmins, resolveAdminNotifications } from "@/lib/admin-notify";
import { business } from "@/config/site";
import { crmConfigured, getCrmSyncSetting, setCrmSync, type CrmSyncSetting } from "@/lib/crm/config";
import { probeCrm } from "@/lib/crm/probe";
import { discardOutbox, retryOutbox, runCrmOutbox } from "@/lib/crm/outbox";
import { discardInbox, retryInbox, runCrmInbox } from "@/lib/crm/inbox";
import { backfillCrmContacts, reconcileCrmContacts } from "@/lib/crm/reconcile";
import { emailKey } from "@/lib/crm/identity";
import { setSubscriberStatus } from "@/lib/subscribers-data";

/**
 * Owner-only controls for /admin/crm. Each one follows setSalesTaxAction:
 * requireOwner, do the thing, tell the inbox who did it, revalidate, redirect
 * with a short code the page turns into a sentence.
 */

type Surface = keyof Omit<CrmSyncSetting, "health">;
const SURFACES: Surface[] = ["outbound", "inbound", "reconcile"];

const LABEL: Record<Surface, string> = {
  outbound: "Outbound sync",
  inbound: "Inbound unsubscribes and appointments",
  reconcile: "Nightly reconcile",
};

function back(query: string): never {
  revalidatePath("/admin/crm");
  redirect(`/admin/crm?${query}`);
}

export async function setCrmSwitchAction(formData: FormData) {
  const ctx = await requireOwner();
  const surface = String(formData.get("surface") || "") as Surface;
  if (!SURFACES.includes(surface)) back("e=input");
  const on = formData.get("on") === "1";

  // Turning something on requires a verified connection; turning it off never
  // does. The probe is what proves "do not disturb on" means suppressed, and a
  // leg armed before that is proven could apply an unsubscribe backwards.
  if (on) {
    if (!crmConfigured()) back("e=not_configured");
    const setting = await getCrmSyncSetting();
    if (setting.health !== "ok") back("e=unverified");
  }

  const ok = await setCrmSync({ [surface]: on }, ctx.email);
  if (!ok) back("e=db");

  // The triggers only enqueue while the outbound switch is on, so everything
  // that happened before it was switched on has to be queued once by hand.
  // Idempotent: every job key coalesces, so switching off and on again queues
  // nothing twice.
  let queued: number | null = null;
  if (surface === "outbound" && on) {
    const backfill = await backfillCrmContacts();
    queued = backfill.ok ? backfill.queued : null;
    if (!backfill.ok) console.error("[crm admin] backfill failed", backfill.error);
  }

  await notifyAdmins({
    event: "settings.crm_changed",
    title: `${LABEL[surface]} switched ${on ? "ON" : "OFF"}`,
    body:
      queued != null
        ? `${queued} existing contact${queued === 1 ? "" : "s"} queued for their first push.`
        : on
          ? null
          : "Nothing new is sent or applied for this leg until it is switched back on. Queued work waits.",
    url: "/admin/crm",
    actor: { type: "staff", label: ctx.email },
  });

  back(`ok=${surface}_${on ? "on" : "off"}${queued != null ? `&queued=${queued}` : ""}`);
}

export async function verifyConnectionAction() {
  const ctx = await requireOwner();
  const result = await probeCrm();

  if (result.ok) {
    // A passing probe settles the questions a stuck or refused state was about.
    await resolveAdminNotifications({ events: ["crm.auth_failed"], entityId: "connection", by: ctx.email });
  }
  await notifyAdmins({
    event: "settings.crm_changed",
    title: result.ok ? "CRM connection verified" : "CRM connection check failed",
    body: result.ok ? "Every check passed. The switches can be turned on." : result.error,
    url: "/admin/crm",
    actor: { type: "staff", label: ctx.email },
  });
  back(result.ok ? "ok=verified" : "e=probe");
}

export async function syncNowAction() {
  await requireOwner();
  // Inbound first: a consent change waiting to be applied is more urgent than
  // a profile waiting to be pushed, the same order the cron uses.
  const inbox = await runCrmInbox({ trigger: "manual", budgetMs: 20_000 });
  const outbox = await runCrmOutbox({ trigger: "manual", budgetMs: 25_000 });
  if (!inbox.ok || !outbox.ok) back("e=sync");
  const done = (outbox.ok ? outbox.done + outbox.noop : 0) + (inbox.ok ? inbox.applied : 0);
  back(`ok=synced&n=${done}`);
}

export async function reconcileNowAction() {
  await requireOwner();
  const result = await reconcileCrmContacts({ trigger: "manual", budgetMs: 45_000 });
  if (!result.ok) back("e=reconcile");
  back(`ok=reconciled&n=${result.corrected}${result.halted ? "&halted=1" : ""}`);
}

function ids(formData: FormData): string[] {
  return formData.getAll("id").map((v) => String(v)).filter(Boolean);
}

export async function retryCrmAction(formData: FormData) {
  const ctx = await requireOwner();
  const queue = formData.get("queue") === "inbox" ? "inbox" : "outbox";
  const n = queue === "inbox" ? await retryInbox(ids(formData), ctx.email) : await retryOutbox(ids(formData), ctx.email);
  back(n ? `ok=retried&n=${n}` : "e=nothing");
}

export async function discardCrmAction(formData: FormData) {
  const ctx = await requireOwner();
  const queue = formData.get("queue") === "inbox" ? "inbox" : "outbox";
  const n = queue === "inbox" ? await discardInbox(ids(formData), ctx.email) : await discardOutbox(ids(formData), ctx.email);
  back(n ? `ok=discarded&n=${n}` : "e=nothing");
}

/**
 * The only path in the system that can lower a suppression.
 *
 * The CRM reported that this person is contactable again, and it cannot tell
 * us whether the person did that, a workflow did, or a staff member did. Only
 * the first is consent, so nothing flips on its own: the owner looks, decides,
 * and presses this. It is stamped with the current policy version like any
 * other signup, because the history row it writes is the proof of the new
 * consent. A bounced or complained address is refused inside
 * setSubscriberStatus, not here, so no caller can forget that rule.
 */
export async function confirmResubscribeAction(formData: FormData) {
  const ctx = await requireOwner();
  const email = emailKey(String(formData.get("email") || ""));
  if (!email) back("e=input");

  const result = await setSubscriberStatus({
    match: { by: "email", email },
    status: "active",
    source: "admin",
    policyVersion: business.legalDates.lastUpdated,
  });
  const inspect = `&email=${encodeURIComponent(email)}`;
  if (!result.ok) back(`e=resub_${result.reason}${inspect}`);

  await resolveAdminNotifications({ events: ["crm.resubscribe_requested"], entityId: email, by: ctx.email });
  back(`ok=${result.changed ? "resubscribed" : "already_active"}${inspect}`);
}
