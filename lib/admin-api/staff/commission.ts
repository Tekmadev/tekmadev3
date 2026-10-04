import { z } from "zod";
import { readCommissionSplitStrict, type CommissionSplit } from "@/lib/site-settings";
import { COMMISSION_SPLIT_MESSAGES, updateCommissionSplit } from "@/lib/staff-admin";
import type { ApiContext } from "../auth";
import { ApiError, badRequest, unavailable } from "../errors";

/**
 * GET and PUT /settings/commission (docs/admin-api/staff.md): the default
 * credit split for a client created from a lead, stored in site_settings
 * `commission` (finder 50 / booker 50 until the owner changes it). Changing
 * it affects clients created afterwards only; existing credits stay.
 * The checks, copy and Inbox row live in lib/staff-admin.ts
 * (updateCommissionSplit), which the web admin's Team page runs too.
 */

export const COMMISSION_MESSAGES = COMMISSION_SPLIT_MESSAGES;

/** GET /settings/commission: the split as stored (500 on a failed read, never a silent default). */
export async function readCommission(): Promise<CommissionSplit> {
  try {
    return await readCommissionSplitStrict();
  } catch (err) {
    console.error("[admin-api] commission split read failed", err instanceof Error ? err.message : String(err));
    throw unavailable();
  }
}

const shareInput = z.number({ error: COMMISSION_MESSAGES.share });

export const commissionBody = z.object({ finder: shareInput, booker: shareInput });

/**
 * PUT /settings/commission { finder, booker } -> the saved split. Each from 0
 * to 100 with at most two decimals (400 `finder` / `booker`), adding up to
 * exactly 100 (400 `split`). Logged in the Inbox (owner audience).
 */
export async function saveCommission(ctx: ApiContext, body: z.output<typeof commissionBody>): Promise<CommissionSplit> {
  const result = await updateCommissionSplit(body, ctx.email);
  if (result.ok) return result.split;
  if (result.code === "read") throw unavailable();
  if (result.code === "db") throw new ApiError(500, "db", result.message);
  throw badRequest(result.code, result.message, result.fields);
}
