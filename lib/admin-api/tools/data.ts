import { z } from "zod";
import { REVENUE_LEAK_SLUG } from "@/config/lead-magnets";
import { decodeCursor, keysetFilter, toPage, type Page } from "../cursor";
import { dbError, isUuid, money, requireDb } from "../data";
import { SUBMISSION_COLUMNS, toSubmission, toSubmissionDetail, type SubmissionRow, type ToolSubmission, type ToolSubmissionDetail } from "./shape";

/**
 * Reads behind /tools (free tool submissions). The website's own loaders
 * (lib/lead-magnet-data.ts getLeadMagnetSubmissions, getLeadMagnetStats) answer
 * an empty list or zeros when a read fails and stop at the first 1000 rows,
 * which suits a web page but not an API that must tell "failed" from "empty"
 * (rule 5) and page with a cursor. These read the same table and columns and
 * throw instead.
 */

const TABLE = "lead_magnet_submissions";
const DAY_MS = 86_400_000;
/** PostgREST answers at most 1000 rows per request on Supabase. */
const CHUNK = 1000;

export type ToolStats = {
  submissions: number;
  last30d: number;
  optIns: number;
  leakReported: { amount: number; currency: string };
};

/**
 * Sum of every submission's monthly leak, in cents, read in chunks so no row is
 * left out. `score` is normalized per tool and is dollars a month only for the
 * Revenue Leak Calculator (the only tool today, so this equals the web admin's
 * "Leak reported"); another tool's score is not money and adds nothing.
 */
async function leakReportedCents(): Promise<number> {
  const db = requireDb();
  let total = 0;
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await db
      .from(TABLE)
      .select("id,score")
      .eq("magnet", REVENUE_LEAK_SLUG)
      .gt("score", 0)
      .order("id", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) throw dbError("tool stats leak", error);
    const rows = (data ?? []) as { score: number | string | null }[];
    for (const row of rows) {
      const dollars = Number(row.score);
      if (Number.isFinite(dollars) && dollars > 0) total += Math.round(dollars * 100);
    }
    if (rows.length < CHUNK) return total;
  }
}

/** GET /tools/stats: Submissions, Last 30 days, Newsletter opt-ins, Leak reported (per month, all submissions). */
export async function getToolStats(): Promise<ToolStats> {
  const db = requireDb();
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const count = () => db.from(TABLE).select("id", { count: "exact", head: true });
  const [all, recent, optIns, leak] = await Promise.all([
    count(),
    count().gte("created_at", since),
    count().eq("consent_marketing", true),
    leakReportedCents(),
  ]);
  for (const res of [all, recent, optIns]) if (res.error) throw dbError("tool stats", res.error);
  return {
    submissions: all.count ?? 0,
    last30d: recent.count ?? 0,
    optIns: optIns.count ?? 0,
    leakReported: money(leak),
  };
}

/** GET /tools/submissions: newest first, keyset cursor on (created_at, id). */
export async function listToolSubmissions(cursor: string | undefined, limit: number): Promise<Page<ToolSubmission>> {
  const db = requireDb();
  const after = decodeCursor(cursor, z.tuple([z.string().min(1), z.string().min(1)]));
  let req = db.from(TABLE).select(SUBMISSION_COLUMNS);
  if (after) req = req.or(keysetFilter(["created_at", "id"], after, "desc"));
  const { data, error } = await req.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (error) throw dbError("tool submissions", error);
  return toPage((data ?? []) as unknown as SubmissionRow[], limit, (row) => [row.created_at, row.id], toSubmission);
}

/** GET /tools/submissions/:id, or null for an unknown or malformed id. */
export async function getToolSubmission(id: string): Promise<ToolSubmissionDetail | null> {
  if (!isUuid(id)) return null;
  const db = requireDb();
  const { data, error } = await db.from(TABLE).select(SUBMISSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError("tool submission", error);
  const row = data as unknown as SubmissionRow | null;
  if (!row) return null;

  // lib/lead-magnet-data.ts links the lead after both inserts; a row whose
  // link write failed is still found through the lead's raw.submission_id.
  let leadId = row.lead_id;
  if (!leadId) {
    const lead = await db.from("leads").select("id").eq("raw->>submission_id", row.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (lead.error) throw dbError("tool submission lead", lead.error);
    leadId = (lead.data as { id: string } | null)?.id ?? null;
  }
  return toSubmissionDetail(row, leadId);
}
