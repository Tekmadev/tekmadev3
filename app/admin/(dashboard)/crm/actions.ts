"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminCapability } from "@/lib/admin";
import { discardOutbox, retryOutbox } from "@/lib/crm/outbox";
import { discardInbox, retryInbox } from "@/lib/crm/inbox";
import { emailKey } from "@/lib/crm/identity";
import {
  confirmCrmResubscribe,
  isCrmSwitchSurface,
  reconcileCrmNow,
  setCrmSwitch,
  syncCrmNow,
  verifyCrmConnection,
} from "@/lib/crm/admin-ops";

/**
 * The controls for /admin/crm (crm.write). Each one follows setSalesTaxAction:
 * check the capability, do the thing, tell the inbox who did it, revalidate, redirect
 * with a short code the page turns into a sentence. The work itself lives in
 * lib/crm/admin-ops.ts, shared with the admin API (app/api/admin/v1/crm).
 */

function back(query: string): never {
  revalidatePath("/admin/crm");
  redirect(`/admin/crm?${query}`);
}

export async function setCrmSwitchAction(formData: FormData) {
  const ctx = await requireAdminCapability("crm.write");
  const surface = String(formData.get("surface") || "");
  if (!isCrmSwitchSurface(surface)) back("e=input");
  const on = formData.get("on") === "1";

  // Turning something on requires a verified connection; turning it off never
  // does (see setCrmSwitch).
  const result = await setCrmSwitch(surface, on, ctx.email);
  if (!result.ok) back(`e=${result.reason}`);

  back(`ok=${surface}_${on ? "on" : "off"}${result.queued != null ? `&queued=${result.queued}` : ""}`);
}

export async function verifyConnectionAction() {
  const ctx = await requireAdminCapability("crm.write");
  const result = await verifyCrmConnection(ctx.email);
  back(result.ok ? "ok=verified" : "e=probe");
}

export async function syncNowAction() {
  await requireAdminCapability("crm.write");
  // Inbound first, then outbound (see syncCrmNow).
  const result = await syncCrmNow();
  if (!result.ok) back("e=sync");
  back(`ok=synced&n=${result.handled}`);
}

export async function reconcileNowAction() {
  await requireAdminCapability("crm.write");
  const result = await reconcileCrmNow();
  if (!result.ok) back("e=reconcile");
  back(`ok=reconciled&n=${result.corrected}${result.halted ? "&halted=1" : ""}`);
}

function ids(formData: FormData): string[] {
  return formData.getAll("id").map((v) => String(v)).filter(Boolean);
}

export async function retryCrmAction(formData: FormData) {
  const ctx = await requireAdminCapability("crm.write");
  const queue = formData.get("queue") === "inbox" ? "inbox" : "outbox";
  const n = queue === "inbox" ? await retryInbox(ids(formData), ctx.email) : await retryOutbox(ids(formData), ctx.email);
  back(n ? `ok=retried&n=${n}` : "e=nothing");
}

export async function discardCrmAction(formData: FormData) {
  const ctx = await requireAdminCapability("crm.write");
  const queue = formData.get("queue") === "inbox" ? "inbox" : "outbox";
  const n = queue === "inbox" ? await discardInbox(ids(formData), ctx.email) : await discardOutbox(ids(formData), ctx.email);
  back(n ? `ok=discarded&n=${n}` : "e=nothing");
}

/**
 * The only path in the system that can lower a suppression: the owner
 * confirms that a person the CRM shows as mailable again asked to come back.
 * See confirmCrmResubscribe for why nothing flips on its own.
 */
export async function confirmResubscribeAction(formData: FormData) {
  const ctx = await requireAdminCapability("crm.write");
  const email = emailKey(String(formData.get("email") || ""));
  if (!email) back("e=input");

  const result = await confirmCrmResubscribe(email, ctx.email);
  const inspect = `&email=${encodeURIComponent(email)}`;
  if (!result.ok) back(`e=resub_${result.reason}${inspect}`);

  back(`ok=${result.changed ? "resubscribed" : "already_active"}${inspect}`);
}
