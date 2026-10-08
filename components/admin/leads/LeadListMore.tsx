"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnGhost, btnSecondary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { COPY, callFailure, isOffline, isResult, type Lead, type LeadListParams, type LeadPageResult } from "@/lib/leads-ui";
import { loadMoreLeadsAction } from "@/app/admin/(dashboard)/leads/actions";
import { LeadRow } from "./LeadRow";
import { RetryNotice } from "./RetryNotice";

type Appended = { lead: Lead; nowMs: number };
/** `stale`: the cursor no longer works, so asking again with it can never succeed. */
type Failure = { message: string; reload: boolean; stale: boolean };

/**
 * "Show more leads" (decision D8: an explicit button, no infinite scroll). It
 * renders <li> rows inside the list's <ul>. Appended rows are checked against
 * the first page and each other at render time, so a lead that moved into the
 * first page never shows twice; the page re-keys this component whenever the
 * first page changes, which starts the appended pages over. A failure keeps
 * every row already shown and offers a Retry.
 *
 * A stale list ("That list changed. Refresh to see the latest.") is the one
 * failure a Retry cannot fix: the same cursor fails the same way every time.
 * It offers Refresh instead, which drops the extra pages and reloads the
 * page's server data, so the list starts over from a fresh first page.
 */
export function LeadListMore({
  params,
  cursor,
  seenIds,
  showAssignee,
}: {
  params: LeadListParams;
  cursor: string | null;
  seenIds: string[];
  showAssignee?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Appended[]>([]);
  const [next, setNext] = useState<string | null>(cursor);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  // A refresh can bring a new first-page cursor without a new first page (the
  // key stays the same): the extra pages start over from it.
  const [base, setBase] = useState(cursor);
  if (cursor !== base) {
    setBase(cursor);
    setRows([]);
    setNext(cursor);
    setFailure(null);
  }

  const fail = () => {
    const f = callFailure();
    setFailure({ message: f.message, reload: f.code === "reload", stale: false });
  };

  const load = (): Promise<void> => {
    const at = next;
    if (!at || pending || refreshing) return Promise.resolve();
    if (isOffline()) {
      fail();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          const value: unknown = await loadMoreLeadsAction({ params, cursor: at });
          startTransition(() => {
            if (!isResult(value)) {
              fail();
              return;
            }
            const res = value as LeadPageResult;
            if (!res.ok) {
              setFailure({ message: res.message, reload: false, stale: res.message === COPY.staleList });
              return;
            }
            const arrived = Date.now();
            setRows((prev) => [...prev, ...res.items.map((lead) => ({ lead, nowMs: arrived }))]);
            setNext(res.nextCursor);
            setFailure(null);
          });
        } catch {
          startTransition(fail);
        } finally {
          resolve();
        }
      });
    });
  };

  const refreshList = () => {
    if (refreshing) return;
    if (isOffline()) {
      // Still stale: Refresh stays, with the reason it did nothing.
      setFailure({ message: COPY.network, reload: false, stale: true });
      return;
    }
    startRefresh(() => {
      setRows([]);
      setNext(cursor);
      setFailure(null);
      router.refresh();
    });
  };

  const seen = new Set(seenIds);
  const visible: Appended[] = [];
  for (const row of rows) {
    if (seen.has(row.lead.id)) continue;
    seen.add(row.lead.id);
    visible.push(row);
  }

  return (
    <>
      {visible.map(({ lead, nowMs }) => (
        <LeadRow key={lead.id} lead={lead} nowMs={nowMs} showAssignee={showAssignee} />
      ))}
      {next && (
        <li className="py-3">
          {failure?.stale ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-x-2 rounded-xl border border-signal/40 bg-signal/[0.06] py-1 pl-3 pr-1 text-sm text-ink"
            >
              <span className="min-w-0 flex-1 py-2">{failure.message}</span>
              <button
                type="button"
                onClick={refreshList}
                disabled={refreshing}
                aria-busy={refreshing}
                className={cn(btnGhost, "shrink-0 px-3 text-gold hover:text-gold-deep")}
              >
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
          ) : failure ? (
            <RetryNotice compact message={failure.message} reload={failure.reload} onRetry={load} />
          ) : (
            <button
              type="button"
              onClick={() => void load()}
              disabled={pending || refreshing}
              aria-busy={pending || refreshing}
              className={cn(btnSecondary, "w-full")}
            >
              {pending ? "Loading more leads" : refreshing ? "Refreshing" : "Show more leads"}
            </button>
          )}
        </li>
      )}
    </>
  );
}
