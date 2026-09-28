import { NextResponse, type NextRequest } from "next/server";
import { reconcileCrmContacts } from "@/lib/crm/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Stop claiming with ten seconds to spare so the run can write its
// crm_sync_runs row. The cursor is `reconciled_at asc nulls first`, so a pass
// that stops early resumes exactly where it left off tomorrow night.
const BUDGET_MS = 50_000;

/**
 * The nightly consent backstop, scheduled in vercel.json. Vercel calls it with
 * `Authorization: Bearer <CRON_SECRET>`; anything else is a 401. With no secret
 * set this refuses everything, because a stranger must not be able to trigger a
 * pass that can write subscriber suppression in bulk.
 *
 * This is what makes the compliance claim true rather than intended: a missed
 * ContactDndUpdate is caught here even if the webhook never arrived.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await reconcileCrmContacts({ trigger: "cron", budgetMs: BUDGET_MS });
  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { "cache-control": "no-store" } });
}
