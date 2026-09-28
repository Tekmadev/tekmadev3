import { NextResponse, type NextRequest } from "next/server";
import { runCrmInbox } from "@/lib/crm/inbox";
import { runCrmOutbox } from "@/lib/crm/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The whole pass has to land inside maxDuration. 50s leaves the runners room to
// close their crm_sync_runs row; a function killed mid-pass leaves one 'running'
// forever and the admin's "last run" reads as if the sync never finished.
const BUDGET_MS = 50_000;
// The inbox gets a guaranteed slice rather than the whole budget, so a large
// backlog of inbound events cannot starve outbound sync for ten minutes.
const INBOX_BUDGET_MS = 20_000;
// Whatever the inbox spent, the outbox still gets enough time to claim and
// finish at least one job. Worst case (inbox overruns its slice) this is still
// well inside maxDuration, so the floor cannot cause a kill.
const MIN_OUTBOX_BUDGET_MS = 5_000;

/**
 * The CRM queue drain, scheduled in vercel.json. Vercel calls it with
 * `Authorization: Bearer <CRON_SECRET>`; anything else is a 401, so a stranger
 * cannot make the site hammer the CRM's API. With no secret set this refuses
 * everything: an open endpoint here can suppress addresses.
 *
 * Both drains are queue state machines in Postgres, so a pass that runs out of
 * budget is not a failure, it just leaves rows due for the next pass.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const startedAt = Date.now();
  // Inbound first, always. An unapplied ContactDndUpdate means we are still
  // mailing someone who opted out, which is a compliance failure; a delayed
  // outbound profile push is only a stale contact record.
  const inbox = await runCrmInbox({ trigger: "cron", budgetMs: INBOX_BUDGET_MS });

  // The outbox runs even when the inbox failed. They are separate surfaces with
  // separate owner switches, so an inbound error must not stall outbound sync.
  const outbox = await runCrmOutbox({
    trigger: "cron",
    budgetMs: Math.max(MIN_OUTBOX_BUDGET_MS, BUDGET_MS - (Date.now() - startedAt)),
  });

  const ok = inbox.ok && outbox.ok;
  return NextResponse.json(
    { ok, inbox, outbox },
    { status: ok ? 200 : 502, headers: { "cache-control": "no-store" } },
  );
}
