import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/admin-notify";
import { readCommissionSplitStrict, setCommissionSplit, shareHundredths, type CommissionSplit } from "@/lib/site-settings";
import { staffSchemaMissing } from "@/lib/staff-constants";

/**
 * Staff management helpers the web admin needs beyond the ones the admin API
 * already shares (lib/admin-users.ts updateTeamAccess, lib/staff-credit.ts,
 * lib/staff-activity.ts): who found and booked a lead, and changing the
 * default commission split with the same checks, copy and Inbox row as
 * PUT /settings/commission (docs/admin-api/staff.md section 6).
 */

const OUTREACH_SOURCE = "outreach";

/* ------------------------------------------------------------------ */
/* Lead credit: found_by and booked_by                                 */
/* ------------------------------------------------------------------ */

export type LeadCreditPeople = {
  id: string;
  /** Who it reads as on screen: the person, else the business, else the email. */
  label: string;
  source: string | null;
  /** Who found it and added it by hand (credit role finder), lowercased; null when nobody did. */
  foundBy: string | null;
  /** Who first booked it or logged the booking (credit role booker), lowercased; null when nobody did. */
  bookedBy: string | null;
};

type LeadCreditRow = {
  id: string;
  source: string | null;
  name: string | null;
  business_name: string | null;
  email: string | null;
  added_by: string | null;
  found_by?: string | null;
  booked_by?: string | null;
};

const lower = (v: string | null | undefined): string | null => {
  const e = (v ?? "").trim().toLowerCase();
  return e ? e : null;
};

const STAFF_COLUMNS = "id,source,name,business_name,email,added_by:form->>added_by,found_by,booked_by";
const BASE_COLUMNS = "id,source,name,business_name,email,added_by:form->>added_by";

/** PostgREST puts filter values in the URL: ask for at most this many leads at a time (the Leads page lists 200). */
const ID_CHUNK = 100;

/**
 * Who found and who booked these leads, by lead id. Before the staff
 * management migration (no found_by / booked_by columns) it reads like the
 * admin API does: whoever added an outreach lead found it, and nobody booked
 * it. A failed read answers an empty map (the page still renders).
 */
export async function leadCreditPeople(leadIds: readonly string[]): Promise<Map<string, LeadCreditPeople>> {
  const out = new Map<string, LeadCreditPeople>();
  const ids = [...new Set(leadIds.filter(Boolean))];
  const db = getSupabaseAdmin();
  if (!db || ids.length === 0) return out;

  type Read = { data: unknown; error: { code?: string; message: string } | null };
  const rows: LeadCreditRow[] = [];
  let columns = STAFF_COLUMNS;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const part = ids.slice(i, i + ID_CHUNK);
    let res: Read = await db.from("leads").select(columns).in("id", part);
    if (res.error && columns === STAFF_COLUMNS && staffSchemaMissing(res.error)) {
      columns = BASE_COLUMNS;
      res = await db.from("leads").select(columns).in("id", part);
    }
    if (res.error) {
      console.error("[staff] lead credit read failed", res.error.message);
      return out;
    }
    rows.push(...((res.data ?? []) as LeadCreditRow[]));
  }

  for (const row of rows) {
    const foundBy = row.found_by === undefined ? (row.source === OUTREACH_SOURCE ? lower(row.added_by) : null) : lower(row.found_by);
    out.set(row.id, {
      id: row.id,
      label: row.name?.trim() || row.business_name?.trim() || row.email?.trim() || "Lead",
      source: row.source,
      foundBy,
      bookedBy: lower(row.booked_by ?? null),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The default commission split                                        */
/* ------------------------------------------------------------------ */

/** The copy for both the web admin and PUT /settings/commission (lib/admin-api/staff/commission.ts). */
export const COMMISSION_SPLIT_MESSAGES = {
  share: "Enter a number from 0 to 100, with at most two decimals.",
  split: "Finder and booker must add up to 100.",
  saveFailed: "Could not save. Nothing changed. Try again.",
  readFailed: "Could not read the current split. Nothing changed. Try again.",
} as const;

export type CommissionSplitResult =
  | { ok: true; split: CommissionSplit; changed: boolean }
  | {
      ok: false;
      /** `read`: the current split could not be read; `db`: the save failed. */
      code: "finder" | "booker" | "split" | "read" | "db";
      message: string;
      /** Per-field copy for the share checks (finder, booker, split). */
      fields?: Record<string, string>;
    };

/**
 * Changes the default credit split: each share a number from 0 to 100 with at
 * most two decimals, adding up to exactly 100. Saving the split already
 * stored writes nothing. A change is the owner-audience Inbox row
 * `settings.commission_changed` and applies to clients created afterwards
 * only. The caller checks `commission.settings` first. The web admin's Team
 * page and PUT /settings/commission both run this.
 */
export async function updateCommissionSplit(input: { finder: unknown; booker: unknown }, by: string): Promise<CommissionSplitResult> {
  const finder = shareHundredths(input.finder);
  const booker = shareHundredths(input.booker);
  if (finder === null || booker === null) {
    const fields: Record<string, string> = {};
    if (finder === null) fields.finder = COMMISSION_SPLIT_MESSAGES.share;
    if (booker === null) fields.booker = COMMISSION_SPLIT_MESSAGES.share;
    return { ok: false, code: finder === null ? "finder" : "booker", message: COMMISSION_SPLIT_MESSAGES.share, fields };
  }
  if (finder + booker !== 10_000) {
    const fields = { finder: COMMISSION_SPLIT_MESSAGES.split, booker: COMMISSION_SPLIT_MESSAGES.split };
    return { ok: false, code: "split", message: COMMISSION_SPLIT_MESSAGES.split, fields };
  }

  let before: CommissionSplit;
  try {
    before = await readCommissionSplitStrict();
  } catch (err) {
    console.error("[staff] commission split read failed", err instanceof Error ? err.message : String(err));
    return { ok: false, code: "read", message: COMMISSION_SPLIT_MESSAGES.readFailed };
  }
  const next: CommissionSplit = { finder: finder / 100, booker: booker / 100 };
  if (before.finder === next.finder && before.booker === next.booker) return { ok: true, split: next, changed: false };
  if (!(await setCommissionSplit(next, by))) return { ok: false, code: "db", message: COMMISSION_SPLIT_MESSAGES.saveFailed };

  await notifyAdmins({
    event: "settings.commission_changed",
    title: `Credit split is now finder ${next.finder} / booker ${next.booker}`,
    body: `Was finder ${before.finder} / booker ${before.booker}. Changed by ${by}`,
    url: "/admin/team",
    actor: { type: "staff", label: by },
    data: { before, after: next },
  });
  return { ok: true, split: next, changed: true };
}
