import { getSupabaseAdmin } from "@/lib/supabase";
import { ownerEmails } from "@/lib/admin";
import { logActivity } from "@/lib/clients-data";
import { getCommissionSplit, shareHundredths, type CommissionSplit } from "@/lib/site-settings";
import { CREDIT_ROLES, StaffDataNotReady, staffSchemaMissing, type CreditRole } from "@/lib/staff-constants";

/**
 * Commission credit (owner decisions 2026-10-03, docs/admin-api/staff.md).
 * No dollar math yet: these are the shares a commission will be computed from.
 *
 *   leads.found_by   who found the lead and added it by hand    -> finder
 *   leads.booked_by  who first booked it (or logged the booking) -> booker
 *
 * When a client is created from a lead, the lead's finder and booker are
 * copied to `client_credits` with the default split (site_settings
 * `commission`, finder 50 / booker 50 until the owner changes it): the same
 * person in both roles gets both shares (100), when only one is known they get
 * 100, and nobody known means no credit. Owners and managers then edit a
 * client's credits (people on the team, roles finder | booker | other, shares
 * totalling exactly 100, a note), and every change is a client activity entry
 * ("credits.created", "credits.updated") that only they can read.
 *
 * Shared by the admin API and the web admin: nothing here knows about HTTP.
 * Writes go through `admin_api_set_client_credits` (one transaction, the
 * total checked in the database too).
 */

export { CREDIT_ROLES, CREDIT_ROLE_LABELS, CREDIT_ROLE_HELP } from "@/lib/staff-constants";
export type { CreditRole } from "@/lib/staff-constants";

/** One credit as sent or stored: a lowercased email, a role and a share of 100 (two decimals at most). */
export type CreditInput = { email: string; role: CreditRole; share: number };

export type CreditRow = {
  client_id: string;
  staff_email: string;
  role: CreditRole;
  share: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** The most rows one client may have (a guard, not a business rule). */
export const MAX_CREDITS = 20;

export const CREDIT_MESSAGES = {
  list: "Send the credits as a list.",
  email: "Pick someone on the team.",
  role: "Pick finder, booker or other.",
  share: "Enter a share from 0.01 to 100, with at most two decimals.",
  duplicate: "List each person once per role.",
  tooMany: `Keep it to ${MAX_CREDITS} credits or fewer.`,
  total: "Shares must add up to 100.",
  note: "Add a note saying why.",
  noteLong: "Keep the note to 500 characters or fewer.",
} as const;

export { StaffDataNotReady, staffSchemaMissing } from "@/lib/staff-constants";

function db() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

const clean = (email: string | null | undefined): string | null => {
  const e = (email ?? "").trim().toLowerCase();
  return e ? e : null;
};

/** "50" or "33.33". */
export const shareText = (share: number): string => String(Math.round(share * 100) / 100);

/** Finder first, then booker, then other; biggest share first; then by email. */
export function sortCredits<T extends { role: CreditRole; share: number; email: string }>(list: readonly T[]): T[] {
  const rank = (r: CreditRole) => CREDIT_ROLES.indexOf(r);
  return [...list].sort((a, b) => rank(a.role) - rank(b.role) || b.share - a.share || a.email.localeCompare(b.email));
}

/* ------------------------------------------------------------------ */
/* The team                                                            */
/* ------------------------------------------------------------------ */

/**
 * Everyone on the team (env owners and every admins row, paused people
 * included), lowercased email to display name (null when unknown).
 */
export async function teamMembers(): Promise<Map<string, string | null>> {
  const { data, error } = await db().from("admins").select("email,name");
  if (error) throw new Error(`team members: ${error.message}`);
  const team = new Map<string, string | null>();
  for (const email of ownerEmails()) team.set(email, null);
  for (const row of (data ?? []) as { email: string | null; name: string | null }[]) {
    const email = clean(row.email);
    if (!email) continue;
    team.set(email, row.name?.trim() || team.get(email) || null);
  }
  return team;
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

export type CreditProblem = { code: "credits" | "total"; message: string };

/**
 * The rules for a list of credits (its shape is the caller's to check):
 * at most MAX_CREDITS rows, every email on the team, each person once per
 * role, every share above 0 with at most two decimals, and a total of exactly
 * 100, or an empty list (nobody gets credit). Null when it passes.
 */
export function checkCredits(list: readonly CreditInput[], team: ReadonlySet<string> | ReadonlyMap<string, unknown>): CreditProblem | null {
  if (list.length > MAX_CREDITS) return { code: "credits", message: CREDIT_MESSAGES.tooMany };
  const seen = new Set<string>();
  let total = 0;
  for (const c of list) {
    if (!team.has(c.email)) return { code: "credits", message: CREDIT_MESSAGES.email };
    if (!(CREDIT_ROLES as readonly string[]).includes(c.role)) return { code: "credits", message: CREDIT_MESSAGES.role };
    const hundredths = shareHundredths(c.share);
    if (hundredths === null || hundredths === 0) return { code: "credits", message: CREDIT_MESSAGES.share };
    const key = `${c.email}\u0000${c.role}`;
    if (seen.has(key)) return { code: "credits", message: CREDIT_MESSAGES.duplicate };
    seen.add(key);
    total += hundredths;
  }
  if (list.length > 0 && total !== 10_000) return { code: "total", message: CREDIT_MESSAGES.total };
  return null;
}

/**
 * The default credits for a client created from a lead, by the split:
 * finder and booker each get their share; the same person in both roles gets
 * both rows (100 together); only one of them known gets 100 in that role;
 * nobody known gets nothing.
 */
export function defaultCredits(foundBy: string | null | undefined, bookedBy: string | null | undefined, split: CommissionSplit): CreditInput[] {
  const finder = clean(foundBy);
  const booker = clean(bookedBy);
  if (finder && booker) {
    return [
      { email: finder, role: "finder" as const, share: split.finder },
      { email: booker, role: "booker" as const, share: split.booker },
    ].filter((c) => c.share > 0);
  }
  if (finder) return [{ email: finder, role: "finder", share: 100 }];
  if (booker) return [{ email: booker, role: "booker", share: 100 }];
  return [];
}

/* ------------------------------------------------------------------ */
/* Reads and writes                                                    */
/* ------------------------------------------------------------------ */

/** A client's credit rows, sorted. Throws StaffDataNotReady before the migration. */
export async function readClientCredits(clientId: string): Promise<CreditRow[]> {
  const { data, error } = await db()
    .from("client_credits")
    .select("client_id,staff_email,role,share,updated_by,created_at,updated_at")
    .eq("client_id", clientId);
  if (error) {
    if (staffSchemaMissing(error)) throw new StaffDataNotReady("client_credits");
    throw new Error(`client credits: ${error.message}`);
  }
  const rows: CreditRow[] = ((data ?? []) as (Omit<CreditRow, "share"> & { share: number | string })[]).map((r) => ({
    ...r,
    staff_email: r.staff_email.toLowerCase(),
    // numeric comes back as a JSON number; a string is tolerated all the same.
    share: Number(r.share),
  }));
  const rank = (role: CreditRole) => CREDIT_ROLES.indexOf(role);
  return rows.sort((a, b) => rank(a.role) - rank(b.role) || b.share - a.share || a.staff_email.localeCompare(b.staff_email));
}

/**
 * Replaces a client's credits in one transaction (the database checks the
 * total again). With `onlyIfEmpty`, a client that already has credits is
 * left alone and the answer is false.
 */
export async function writeClientCredits(clientId: string, list: readonly CreditInput[], by: string, onlyIfEmpty = false): Promise<boolean> {
  const { data, error } = await db().rpc("admin_api_set_client_credits", {
    p_client_id: clientId,
    p_credits: list.map((c) => ({ email: c.email, role: c.role, share: c.share })),
    p_by: by,
    p_only_if_empty: onlyIfEmpty,
  });
  if (error) {
    if (staffSchemaMissing(error)) throw new StaffDataNotReady("admin_api_set_client_credits");
    throw new Error(`client credits write: ${error.message}`);
  }
  return data !== false;
}

const sameCredits = (a: readonly CreditInput[], b: readonly CreditInput[]): boolean => {
  const key = (list: readonly CreditInput[]) =>
    list
      .map((c) => `${c.email}|${c.role}|${shareHundredths(c.share)}`)
      .sort()
      .join(",");
  return key(a) === key(b);
};

const asInput = (rows: readonly CreditRow[]): CreditInput[] => rows.map((r) => ({ email: r.staff_email, role: r.role, share: r.share }));

/** "Sam (finder 50), Maya (booker 50)", or "nobody". */
export function creditSummary(list: readonly CreditInput[], names: ReadonlyMap<string, string | null>): string {
  if (list.length === 0) return "nobody";
  return sortCredits(list)
    .map((c) => `${names.get(c.email) || c.email} (${c.role} ${shareText(c.share)})`)
    .join(", ");
}

export type SaveCreditsResult = { changed: boolean; before: CreditRow[]; after: CreditRow[] };

/**
 * Saves a client's credits after checkCredits passed, and logs the change as
 * the internal activity entry "credits.updated" (who, what it was, what it
 * is now, the note). Saving the same credits again writes and logs nothing.
 */
export async function saveClientCredits(opts: {
  clientId: string;
  credits: readonly CreditInput[];
  note: string;
  by: string;
  names: ReadonlyMap<string, string | null>;
}): Promise<SaveCreditsResult> {
  const before = await readClientCredits(opts.clientId);
  if (sameCredits(asInput(before), opts.credits)) return { changed: false, before, after: before };
  await writeClientCredits(opts.clientId, opts.credits, opts.by);
  const after = await readClientCredits(opts.clientId);
  await logActivity({
    client_id: opts.clientId,
    actor_type: "admin",
    actor_email: opts.by,
    event: "credits.updated",
    entity_type: "client",
    entity_id: opts.clientId,
    summary: `Credits changed to ${creditSummary(asInput(after), opts.names)}. Was ${creditSummary(asInput(before), opts.names)}. Note: ${opts.note}`,
    visibility: "internal",
    data: { before: asInput(before), after: asInput(after), note: opts.note },
  });
  return { changed: true, before, after };
}

/**
 * The default credits for a client created from a lead: the lead's finder
 * and booker with the owner's split, written only when the client has no
 * credits yet (a re-used client keeps any edit), and logged as the internal
 * activity entry "credits.created". Answers the credits written (empty when
 * none were).
 */
export async function creditClientFromLead(opts: {
  clientId: string;
  leadId: string;
  foundBy: string | null;
  bookedBy: string | null;
  by: string;
}): Promise<CreditInput[]> {
  const credits = defaultCredits(opts.foundBy, opts.bookedBy, await getCommissionSplit());
  if (credits.length === 0) return [];
  const written = await writeClientCredits(opts.clientId, credits, opts.by, true);
  if (!written) return [];
  const names = await teamMembers().catch(() => new Map<string, string | null>());
  await logActivity({
    client_id: opts.clientId,
    actor_type: "admin",
    actor_email: opts.by,
    event: "credits.created",
    entity_type: "lead",
    entity_id: opts.leadId,
    summary: `Credits set from the lead: ${creditSummary(credits, names)}.`,
    visibility: "internal",
    data: { after: credits, leadId: opts.leadId },
  });
  return credits;
}

/**
 * The default credits for a client created directly, with no lead (owner
 * decision 2026-10-05): the person who created it found it and booked it, so
 * they are both finder and booker by the split, 100 together. Written only
 * when the client has no credits yet, and logged as the internal activity
 * entry "credits.created". Owners and managers can change them afterwards as
 * for any client. Answers the credits written (empty when none were).
 */
export async function creditClientToCreator(opts: { clientId: string; by: string }): Promise<CreditInput[]> {
  const creator = clean(opts.by);
  if (!creator) return [];
  const credits = defaultCredits(creator, creator, await getCommissionSplit());
  if (credits.length === 0) return [];
  const written = await writeClientCredits(opts.clientId, credits, creator, true);
  if (!written) return [];
  const names = await teamMembers().catch(() => new Map<string, string | null>());
  await logActivity({
    client_id: opts.clientId,
    actor_type: "admin",
    actor_email: creator,
    event: "credits.created",
    entity_type: "client",
    entity_id: opts.clientId,
    summary: `Credits set to the person who added the client: ${creditSummary(credits, names)}.`,
    visibility: "internal",
    data: { after: credits, direct: true },
  });
  return credits;
}
