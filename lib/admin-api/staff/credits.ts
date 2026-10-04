import { z } from "zod";
import type { Client } from "@/lib/clients-data";
import {
  CREDIT_MESSAGES,
  CREDIT_ROLES,
  MAX_CREDITS,
  StaffDataNotReady,
  checkCredits,
  readClientCredits,
  saveClientCredits,
  teamMembers,
  type CreditRole,
  type CreditRow,
} from "@/lib/staff-credit";
import type { ApiContext } from "../auth";
import { instant } from "../data";
import { badRequest, notConfigured } from "../errors";
import { findSectionClient, loadPeople, parseBody, type People } from "../clients/sections/shared";

/**
 * A client's credits for the admin API (docs/admin-api/staff.md):
 * GET /clients/:id/credits, PUT /clients/:id/credits and the bundle's
 * `credits`. Owners and managers (`clients.credits.view`) read every row;
 * everyone else (`activity.own`) reads only their own rows, never anyone
 * else's. The rules and the write are lib/staff-credit.ts.
 */

export const CREDITS_NOT_READY = "Credits need a database update first. Ask the owner to apply the staff management migration.";

export type ApiCredit = { email: string; name: string | null; role: CreditRole; share: number };

export type ApiClientCredits = {
  clientId: string;
  /** "all": every row (clients.credits.view). "own": only the caller's rows. */
  scope: "all" | "own";
  /** The lead this client was created from, or null. */
  leadId: string | null;
  credits: ApiCredit[];
  /** The newest change among the rows shown, or null when there are none. */
  updatedAt: string | null;
};

const creditView = (row: CreditRow, people: People): ApiCredit => ({
  email: row.staff_email,
  name: people.name(row.staff_email),
  role: row.role,
  share: row.share,
});

/** The rows this caller may see: all with clients.credits.view, else their own (activity.own), else none. */
function visibleRows(ctx: ApiContext, rows: readonly CreditRow[]): { scope: "all" | "own"; rows: CreditRow[] } {
  if (ctx.can("clients.credits.view")) return { scope: "all", rows: [...rows] };
  if (ctx.can("activity.own")) return { scope: "own", rows: rows.filter((r) => r.staff_email === ctx.email) };
  return { scope: "own", rows: [] };
}

const newest = (rows: readonly CreditRow[]): string | null => {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const r of rows) {
    const ms = Date.parse(r.updated_at);
    if (Number.isFinite(ms) && ms >= bestMs) {
      bestMs = ms;
      best = r.updated_at;
    }
  }
  return best ? instant(best) : null;
};

/**
 * The bundle's `credits` (GET /clients/:id), filtered by capability. Before
 * the staff management migration it is an empty list, so the client screen
 * keeps working.
 */
export async function bundleCredits(ctx: ApiContext, client: Pick<Client, "id">, people: People): Promise<ApiCredit[]> {
  try {
    return visibleRows(ctx, await readClientCredits(client.id)).rows.map((r) => creditView(r, people));
  } catch (err) {
    if (err instanceof StaffDataNotReady) return [];
    throw err;
  }
}

async function creditsOf(clientId: string): Promise<CreditRow[]> {
  try {
    return await readClientCredits(clientId);
  } catch (err) {
    if (err instanceof StaffDataNotReady) throw notConfigured(CREDITS_NOT_READY);
    throw err;
  }
}

function view(ctx: ApiContext, client: Client, rows: readonly CreditRow[], people: People): ApiClientCredits {
  const visible = visibleRows(ctx, rows);
  return {
    clientId: client.id,
    scope: visible.scope,
    leadId: client.lead_id ?? null,
    credits: visible.rows.map((r) => creditView(r, people)),
    updatedAt: newest(visible.rows),
  };
}

/** GET /clients/:id/credits. 404 for a client the caller may not see. */
export async function getClientCredits(ctx: ApiContext, clientId: string | undefined): Promise<ApiClientCredits> {
  const client = await findSectionClient(ctx, clientId);
  const [rows, people] = await Promise.all([creditsOf(client.id), loadPeople(ctx)]);
  return view(ctx, client, rows, people);
}

const creditItem = z.object({
  email: z.string({ error: CREDIT_MESSAGES.email }).trim().toLowerCase().pipe(z.email(CREDIT_MESSAGES.email)),
  role: z.enum(CREDIT_ROLES, { error: CREDIT_MESSAGES.role }),
  share: z.number({ error: CREDIT_MESSAGES.share }),
});

const putBody = z.object({
  credits: z.array(creditItem, { error: CREDIT_MESSAGES.list }).max(MAX_CREDITS, CREDIT_MESSAGES.tooMany),
  note: z
    .string({ error: CREDIT_MESSAGES.note })
    .trim()
    .min(1, CREDIT_MESSAGES.note)
    .max(500, CREDIT_MESSAGES.noteLong),
});

/**
 * PUT /clients/:id/credits { credits: [{ email, role, share }], note } -> the
 * full ApiClientCredits. Replaces every row. 400 `credits` (shape, someone not
 * on the team, a share out of range, a person twice in one role), 400 `total`
 * (shares not adding up to 100; an empty list means nobody gets credit), 400
 * `note` (required). The change is logged as the internal activity entry
 * "credits.updated"; the same credits again change and log nothing.
 */
export async function putClientCredits(ctx: ApiContext, clientId: string | undefined, raw: unknown): Promise<ApiClientCredits> {
  const client = await findSectionClient(ctx, clientId);
  const body = parseBody(putBody, raw, { credits: "credits", note: "note" });
  const team = await teamMembers();
  const problem = checkCredits(body.credits, team);
  if (problem) throw badRequest(problem.code, problem.message, { credits: problem.message });
  try {
    await saveClientCredits({ clientId: client.id, credits: body.credits, note: body.note, by: ctx.email, names: team });
  } catch (err) {
    if (err instanceof StaffDataNotReady) throw notConfigured(CREDITS_NOT_READY);
    throw err;
  }
  const [rows, people] = await Promise.all([creditsOf(client.id), loadPeople(ctx)]);
  return view(ctx, client, rows, people);
}
