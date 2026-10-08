"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Mail, MessageSquare, MoreHorizontal, Phone, Users, type LucideIcon } from "lucide-react";
import { btnGhost } from "@/components/portal/ui";
import { RetryNotice } from "@/components/admin/leads/RetryNotice";
import { loadMoreTouchesAction } from "@/app/admin/(dashboard)/leads/actions";
import { cn } from "@/lib/cn";
import {
  callFailure,
  formatDateTime,
  isResult,
  staffName,
  touchKindLabel,
  type Touch,
  type TouchPageResult,
} from "@/lib/leads-ui";

/** One icon per kind of outreach (the app's). */
const KIND_ICONS: Record<string, LucideIcon> = {
  call: Phone,
  email: Mail,
  dm: MessageSquare,
  meeting: Users,
  other: MoreHorizontal,
};

/** A page of older touches appended on this page, with the time it arrived (for its dates). */
type OlderPage = { items: Touch[]; nextCursor: string | null; nowMs: number };

type LoadFailure = { message: string; reload: boolean; cursor: string };

/** "Call · Left a voicemail" */
function headline(touch: Touch): string {
  const outcome = touch.outcome?.trim();
  return outcome ? `${touchKindLabel(touch.kind)} · ${outcome}` : touchKindLabel(touch.kind);
}

function TouchItem({ touch, nowMs }: { touch: Touch; nowMs: number }) {
  const Icon = KIND_ICONS[touch.kind] ?? MoreHorizontal;
  const note = touch.note && touch.note.trim() ? touch.note : null;
  return (
    <li className="relative pb-5 pl-6 last:pb-0">
      <span
        aria-hidden
        className="absolute -left-4 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-bg-3 text-ink-2 ring-4 ring-surface"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 pt-1">
        <p className="break-words text-sm font-semibold text-ink">{headline(touch)}</p>
        {note ? <p className="select-text whitespace-pre-wrap break-words text-sm text-ink-2">{note}</p> : null}
        <p className="break-words text-xs text-ink-4 tabular-nums">{`${staffName(touch.by)} · ${formatDateTime(touch.at, nowMs)}`}</p>
      </div>
    </li>
  );
}

/**
 * The outreach on a lead, newest first (by when it happened), as a timeline:
 * the kind's icon on a rail, the kind and outcome, the note as typed, then
 * who logged it and when (Toronto time). "Show older" appends a page at a
 * time. `initial` is the first page from the server: after a new touch is
 * logged the page revalidates and it holds the new touch. The lead page keys
 * this by the first page's touch ids, so a changed first page starts the older
 * pages over (paging on from an old cursor would skip the touch the new one
 * pushed off the first page). Touches cannot be edited or deleted.
 */
export function TouchTimeline({ leadId, initial, nowMs }: { leadId: string; initial: TouchPageResult; nowMs: number }) {
  const [older, setOlder] = useState<OlderPage[]>([]);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const hintId = useId();

  if (!initial.ok) return <RetryNotice compact message={initial.message} />;

  // Newest first, each touch once (pages loaded at different times can overlap).
  const seen = new Set<string>();
  const rows: { touch: Touch; nowMs: number }[] = [];
  const add = (items: Touch[], at: number) => {
    for (const touch of items) {
      if (seen.has(touch.id)) continue;
      seen.add(touch.id);
      rows.push({ touch, nowMs: at });
    }
  };
  add(initial.items, nowMs);
  for (const page of older) add(page.items, page.nowMs);

  const cursor = older.length > 0 ? older[older.length - 1].nextCursor : initial.nextCursor;

  const fetchOlder = async (from: string) => {
    let value: unknown;
    try {
      value = await loadMoreTouchesAction({ leadId, cursor: from });
    } catch {
      value = undefined;
    }
    if (!isResult(value)) {
      const f = callFailure();
      setFailure({ message: f.message, reload: f.code === "reload", cursor: from });
      return;
    }
    const result = value as TouchPageResult;
    if (!result.ok) {
      setFailure({ message: result.message, reload: false, cursor: from });
      return;
    }
    setOlder((prev) => [...prev, { items: result.items, nextCursor: result.nextCursor, nowMs: Date.now() }]);
  };

  const load = (from: string) =>
    new Promise<void>((resolve) => {
      if (busy.current) return resolve();
      busy.current = true;
      setFailure(null);
      startTransition(async () => {
        try {
          await fetchOlder(from);
        } finally {
          busy.current = false;
          resolve();
        }
      });
    });

  if (rows.length === 0 && !cursor) return <p className="text-sm text-ink-4">No outreach logged yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <ol aria-label="Outreach on this lead" className="ml-4 border-l border-line">
          {rows.map(({ touch, nowMs: at }) => (
            <TouchItem key={touch.id} touch={touch} nowMs={at} />
          ))}
        </ol>
      ) : null}

      {failure ? (
        <RetryNotice compact message={failure.message} reload={failure.reload} onRetry={() => load(failure.cursor)} />
      ) : cursor ? (
        <div>
          <button
            type="button"
            onClick={() => void load(cursor)}
            disabled={pending}
            aria-describedby={hintId}
            className={cn(btnGhost, "-ml-4")}
          >
            {pending ? "Loading" : "Show older"}
          </button>
          <span id={hintId} className="sr-only">
            Loads older outreach on this lead
          </span>
        </div>
      ) : null}
    </div>
  );
}
