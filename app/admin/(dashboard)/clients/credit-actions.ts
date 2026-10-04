"use server";

import { revalidatePath } from "next/cache";
import { adminCan, requireAdminCapability } from "@/lib/admin";
import { getClientById } from "@/lib/clients-data";
import {
  CREDIT_MESSAGES,
  CREDIT_ROLES,
  MAX_CREDITS,
  StaffDataNotReady,
  checkCredits,
  saveClientCredits,
  teamMembers,
  type CreditInput,
  type CreditRole,
} from "@/lib/staff-credit";
import { CREDITS_NOT_READY } from "@/lib/admin-api/staff";

/**
 * A client's commission credits from the web client page, by the same rules,
 * order and copy as PUT /clients/:id/credits (docs/admin-api/staff.md
 * section 4): owners and managers only (`clients.credits.edit`), people on
 * the team, roles finder | booker | other, shares from 0.01 to 100 adding up
 * to exactly 100 (or nobody), and a note saying why. The write and its
 * activity entry are lib/staff-credit.ts saveClientCredits.
 */

export type CreditsFormState = { ok: boolean; message: string } | null;

const NOTE_MAX = 500;

export async function saveClientCreditsAction(_prev: CreditsFormState, formData: FormData): Promise<CreditsFormState> {
  const ctx = await requireAdminCapability("clients.credits.edit");

  const clientId = String(formData.get("client_id") ?? "").trim();
  const client = clientId ? await getClientById(clientId) : null;
  // The same 404 as the API: trashed, or a test account for a role without test data.
  if (!client || client.deleted_at || (client.is_test && !adminCan(ctx, "testdata.view"))) {
    return { ok: false, message: "That client no longer exists." };
  }

  const emails = formData.getAll("credit_email").map((v) => String(v).trim().toLowerCase());
  const roles = formData.getAll("credit_role").map((v) => String(v));
  const shares = formData.getAll("credit_share").map((v) => String(v).trim());
  if (roles.length !== emails.length || shares.length !== emails.length) return { ok: false, message: CREDIT_MESSAGES.list };
  if (emails.length > MAX_CREDITS) return { ok: false, message: CREDIT_MESSAGES.tooMany };

  // The shape first (as the API's zod parse does), then the note, then the team, duplicate and total rules.
  const credits: CreditInput[] = [];
  for (let i = 0; i < emails.length; i++) {
    const role = CREDIT_ROLES.find((r): r is CreditRole => r === roles[i]);
    if (!role) return { ok: false, message: CREDIT_MESSAGES.role };
    const share = shares[i] === "" ? Number.NaN : Number(shares[i]);
    if (!Number.isFinite(share)) return { ok: false, message: CREDIT_MESSAGES.share };
    credits.push({ email: emails[i], role, share });
  }

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { ok: false, message: CREDIT_MESSAGES.note };
  if (note.length > NOTE_MAX) return { ok: false, message: CREDIT_MESSAGES.noteLong };

  try {
    const team = await teamMembers();
    const problem = checkCredits(credits, team);
    if (problem) return { ok: false, message: problem.message };

    const res = await saveClientCredits({ clientId: client.id, credits, note, by: ctx.email, names: team });
    revalidatePath(`/admin/clients/${client.id}`);
    return res.changed
      ? { ok: true, message: "Credits saved. The change is in this client's activity." }
      : { ok: true, message: "Nothing changed: those are the credits already saved." };
  } catch (err) {
    if (err instanceof StaffDataNotReady) return { ok: false, message: CREDITS_NOT_READY };
    console.error("[credits] save failed", err instanceof Error ? err.message : String(err));
    return { ok: false, message: "Could not save the credits just now. Nothing changed. Try again." };
  }
}
