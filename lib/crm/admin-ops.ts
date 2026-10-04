import { business } from "@/config/site";
import { notifyAdmins, resolveAdminNotifications } from "@/lib/admin-notify";
import { crmConfigured, getCrmSyncSetting, setCrmSync, type CrmSyncSetting } from "@/lib/crm/config";
import { runCrmInbox } from "@/lib/crm/inbox";
import { runCrmOutbox } from "@/lib/crm/outbox";
import { probeCrm, type CrmProbeResult } from "@/lib/crm/probe";
import { backfillCrmContacts, reconcileCrmContacts, type CrmReconcileResult } from "@/lib/crm/reconcile";
import { setSubscriberStatus, type SetStatusResult } from "@/lib/subscribers-data";

/**
 * The owner's controls for the CRM sync, shared by the web admin's server
 * actions (app/admin/(dashboard)/crm/actions.ts) and the admin API
 * (app/api/admin/v1/crm). Each returns what happened instead of redirecting,
 * so the web action keeps its redirect codes and the API answers with its own
 * status. Callers check that the person is the owner first.
 */

export type CrmSwitchSurface = keyof Omit<CrmSyncSetting, "health">;
export const CRM_SWITCH_SURFACES: readonly CrmSwitchSurface[] = ["outbound", "inbound", "reconcile"];

export function isCrmSwitchSurface(value: unknown): value is CrmSwitchSurface {
  return typeof value === "string" && (CRM_SWITCH_SURFACES as readonly string[]).includes(value);
}

const SWITCH_LABEL: Record<CrmSwitchSurface, string> = {
  outbound: "Outbound sync",
  inbound: "Inbound unsubscribes and appointments",
  reconcile: "Nightly reconcile",
};

export type SetCrmSwitchResult =
  | {
      ok: true;
      /** Outbound switched on: contacts queued for their first push, or null when the backfill failed. Always null otherwise. */
      queued: number | null;
    }
  | { ok: false; reason: "not_configured" | "unverified" | "db" };

/**
 * Turn one surface on or off.
 *
 * Turning something on requires a verified connection; turning it off never
 * does. The probe is what proves "do not disturb on" means suppressed, and a
 * leg armed before that is proven could apply an unsubscribe backwards.
 */
export async function setCrmSwitch(surface: CrmSwitchSurface, on: boolean, by: string): Promise<SetCrmSwitchResult> {
  if (on) {
    if (!crmConfigured()) return { ok: false, reason: "not_configured" };
    const setting = await getCrmSyncSetting();
    if (setting.health !== "ok") return { ok: false, reason: "unverified" };
  }

  const saved = await setCrmSync({ [surface]: on }, by);
  if (!saved) return { ok: false, reason: "db" };

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
    title: `${SWITCH_LABEL[surface]} switched ${on ? "ON" : "OFF"}`,
    body:
      queued != null
        ? `${queued} existing contact${queued === 1 ? "" : "s"} queued for their first push.`
        : on
          ? null
          : "Nothing new is sent or applied for this leg until it is switched back on. Queued work waits.",
    url: "/admin/crm",
    actor: { type: "staff", label: by },
  });

  return { ok: true, queued };
}

/**
 * Run the probe (about twenty CRM calls), store its checklist and the health
 * it settles, and tell the inbox who ran it. A passing probe settles the
 * questions a stuck or refused state was about.
 */
export async function verifyCrmConnection(by: string): Promise<CrmProbeResult> {
  const result = await probeCrm();

  if (result.ok) {
    await resolveAdminNotifications({ events: ["crm.auth_failed"], entityId: "connection", by });
  }
  await notifyAdmins({
    event: "settings.crm_changed",
    title: result.ok ? "CRM connection verified" : "CRM connection check failed",
    body: result.ok ? "Every check passed. The switches can be turned on." : result.error,
    url: "/admin/crm",
    actor: { type: "staff", label: by },
  });
  return result;
}

/**
 * "Sync now". Inbound first: a consent change waiting to be applied is more
 * urgent than a profile waiting to be pushed, the same order the cron uses.
 * Each leg only runs while its switch is on (the workers check the gate).
 * `handled` counts pushed and already-right jobs plus applied deliveries.
 */
export async function syncCrmNow(): Promise<{ ok: true; handled: number } | { ok: false }> {
  const inbox = await runCrmInbox({ trigger: "manual", budgetMs: 20_000 });
  const outbox = await runCrmOutbox({ trigger: "manual", budgetMs: 25_000 });
  if (!inbox.ok || !outbox.ok) return { ok: false };
  return { ok: true, handled: outbox.done + outbox.noop + inbox.applied };
}

/** "Run now" for the nightly reconcile, with the owner's click budget. */
export function reconcileCrmNow(): Promise<CrmReconcileResult> {
  return reconcileCrmContacts({ trigger: "manual", budgetMs: 45_000 });
}

/**
 * The only path in the system that can lower a suppression.
 *
 * The CRM reported that this person is contactable again, and it cannot tell
 * us whether the person did that, a workflow did, or a staff member did. Only
 * the first is consent, so nothing flips on its own: the owner looks, decides,
 * and confirms. It is stamped with the current policy version like any other
 * signup, because the history row it writes is the proof of the new consent.
 * A bounced or complained address is refused inside setSubscriberStatus, not
 * here, so no caller can forget that rule.
 *
 * `email` must already be an email key (trimmed, lowercased).
 */
export async function confirmCrmResubscribe(email: string, by: string): Promise<SetStatusResult> {
  const result = await setSubscriberStatus({
    match: { by: "email", email },
    status: "active",
    source: "admin",
    policyVersion: business.legalDates.lastUpdated,
  });
  if (result.ok) {
    await resolveAdminNotifications({ events: ["crm.resubscribe_requested"], entityId: email, by });
  }
  return result;
}
