import { getCrmQueueCounts, listCrmAttention, listCrmRuns } from "@/lib/crm/admin-data";
import { Badge, DataTable, Panel, fmtDateTime, txt } from "@/components/admin/ui";
import { ConfirmButton, RefreshButton } from "@/components/admin/PendingButton";
import { discardCrmAction, reconcileNowAction, retryCrmAction, syncNowAction } from "@/app/admin/(dashboard)/crm/actions";
import type { CrmSyncRun } from "@/lib/crm/reconcile";
import { PendingSubmit } from "@/components/PendingSubmit";

/**
 * The queue, the dead-letter surface and the reconcile log for /admin/crm.
 *
 * Nothing here deletes. Discard marks a row as given up on with who decided,
 * because both queues are the audit trail of what we told the CRM and what it
 * told us, and that trail is what a consent dispute asks for.
 */

const JOB: Record<string, string> = {
  outbox: "Push",
  inbox: "Inbound",
  reconcile: "Reconcile",
  backfill: "Backfill",
  probe: "Verify",
};

const KIND: Record<string, string> = {
  "contact.upsert": "Save contact",
  "dnd.set": "Set email DND",
  "tags.add": "Add tag",
  "tags.remove": "Remove tag",
  "contact.erase": "Erase contact",
};

function ago(iso: string | null): string {
  if (!iso) return "-";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

function runLine(r: CrmSyncRun): string {
  if (r.job === "reconcile") return `${r.claimed} checked, ${r.corrected} corrected`;
  if (r.job === "backfill") return `${r.claimed} queued`;
  const parts = [`${r.done} sent`, `${r.noop} already right`];
  if (r.failed) parts.push(`${r.failed} will retry`);
  if (r.dead) parts.push(`${r.dead} stopped`);
  return parts.join(", ");
}

export async function QueuePanel() {
  const [counts, runs] = await Promise.all([getCrmQueueCounts(), listCrmRuns(6)]);
  const o = counts.outbox;
  const i = counts.inbox;
  const waiting = (o.pending ?? 0) + (o.failed ?? 0) + (o.sending ?? 0);
  const inboundWaiting = (i.pending ?? 0) + (i.failed ?? 0) + (i.processing ?? 0);

  return (
    <Panel
      title="Queue"
      action={
        <form action={syncNowAction}>
          <RefreshButton pendingLabel="Syncing">Sync now</RefreshButton>
        </form>
      }
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Waiting to push", value: waiting, sub: counts.oldestPendingAt ? `oldest ${ago(counts.oldestPendingAt)}` : "nothing due" },
          { label: "Pushed", value: (o.done ?? 0) + (o.noop ?? 0), sub: `${o.noop ?? 0} were already right` },
          { label: "Waiting to apply", value: inboundWaiting, sub: `${i.unmapped ?? 0} need a client mapped` },
          { label: "Applied from the CRM", value: i.applied ?? 0, sub: `${i.ignored ?? 0} ignored, ${i.stale ?? 0} out of date` },
        ].map((s) => (
          <div key={s.label}>
            <dt className="text-xs uppercase tracking-wide text-ink-4">{s.label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-ink">{s.value.toLocaleString("en-US")}</dd>
            <dd className="text-xs text-ink-3">{s.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <DataTable
          head={["Run", "Started", "By", "Result", "Status"]}
          empty="Nothing has run yet. The first run happens after a switch is turned on."
          rows={runs.map((r) => [
            JOB[r.job] ?? r.job,
            fmtDateTime(r.started_at),
            r.trigger === "cron" ? "Schedule" : r.trigger === "inline" ? "Signup" : "You",
            <span key="res">
              {runLine(r)}
              {r.error && <span className="block text-xs text-ink-4">{r.error}</span>}
            </span>,
            <Badge key="st" tone={r.status === "ok" ? "ok" : r.status === "running" ? "neutral" : "muted"}>
              {r.status === "partial" ? "part done" : r.status}
            </Badge>,
          ])}
        />
      </div>
    </Panel>
  );
}

const small =
  "rounded-full border border-line-strong px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-gold hover:text-gold";

export async function AttentionPanel() {
  const rows = await listCrmAttention(50);

  return (
    <Panel title="Needs attention" action={<Badge tone={rows.length ? "neutral" : "ok"}>{rows.length ? `${rows.length}` : "All clear"}</Badge>}>
      <p className="mb-4 text-sm text-ink-3">
        Everything that stopped retrying on its own. Retry puts it back in the queue. Discard stops it for good and records that you
        decided, it never deletes. A delivery we could not verify can only be discarded: retrying one would let anyone who can reach the
        endpoint unsubscribe an address.
      </p>
      <DataTable
        head={["What", "Who", "Tries", "Why it stopped", "When", ""]}
        empty="Nothing is stuck."
        rows={rows.map((r) => [
          <span key="w">
            <span className="block text-ink">{r.queue === "outbox" ? KIND[r.kind] ?? r.kind : r.kind}</span>
            <span className="text-xs text-ink-4">
              {r.queue === "outbox" ? "to the CRM" : "from the CRM"} · {r.status}
            </span>
          </span>,
          txt(r.email),
          r.attempts,
          <span key="e" className="block max-w-sm break-words text-xs">
            {txt(r.lastError)}
            {(r.httpStatus || r.traceId) && (
              <span className="mt-0.5 block text-ink-4">
                {r.httpStatus ? `HTTP ${r.httpStatus}` : ""}
                {r.traceId ? ` · trace ${r.traceId}` : ""}
              </span>
            )}
          </span>,
          fmtDateTime(r.at),
          <div key="a" className="flex gap-2">
            {r.signed && (
              <form action={retryCrmAction}>
                <input type="hidden" name="queue" value={r.queue} />
                <input type="hidden" name="id" value={r.id} />
                <PendingSubmit className={small}>
                  Retry
                </PendingSubmit>
              </form>
            )}
            <form action={discardCrmAction}>
              <input type="hidden" name="queue" value={r.queue} />
              <input type="hidden" name="id" value={r.id} />
              <ConfirmButton message="Stop trying this one for good? It stays on record, it is not deleted." className={small}>
                Discard
              </ConfirmButton>
            </form>
          </div>,
        ])}
      />
    </Panel>
  );
}

export async function ReconcilePanel() {
  const runs = (await listCrmRuns(30)).filter((r) => r.job === "reconcile");
  const last = runs[0] ?? null;
  // lib/crm/reconcile.ts writes this exact prefix when the mass-suppression valve trips.
  const halted = !!last?.error?.startsWith("valve:");

  return (
    <Panel
      title="Last reconcile"
      action={
        <form action={reconcileNowAction}>
          <RefreshButton pendingLabel="Checking every contact">Run now</RefreshButton>
        </form>
      }
    >
      {!last ? (
        <p className="text-sm text-ink-4">Has not run yet. It runs every night around 5 am Eastern once the Reconcile switch is on.</p>
      ) : (
        <div className="space-y-2 text-sm text-ink-2">
          <p>
            {fmtDateTime(last.started_at)}: checked {last.claimed} contact{last.claimed === 1 ? "" : "s"}, corrected{" "}
            <strong className="text-ink">{last.corrected}</strong>.
            {last.corrected > 0 && " Each correction is an unsubscribe that happened in the CRM and never reached us, now applied."}
          </p>
          {halted && (
            <p className="text-signal">
              It stopped on purpose: one pass would have unsubscribed more than a fifth of the list. Check the CRM for a workflow that
              mass-unsubscribed contacts before running it again.
            </p>
          )}
          {last.error && !halted && <p className="text-xs text-ink-4">{last.error}</p>}
          <p className="text-xs text-ink-4">Runs every night around 5 am Eastern.</p>
        </div>
      )}
    </Panel>
  );
}
