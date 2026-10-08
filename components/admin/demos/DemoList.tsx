import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge, fmtDate, type Tone } from "@/components/portal/ui";
import { DEMO_STATUS_LABELS, type DemoRequest, type DemoStatus } from "@/lib/admin-api/demos";

/** Badge tones for a demo status, the same everywhere a request shows. */
export const DEMO_STATUS_TONE: Record<DemoStatus, Tone> = {
  requested: "gold",
  building: "warn",
  ready: "ok",
  shown: "neutral",
  cancelled: "muted",
};

export function DemoStatusBadge({ status }: { status: DemoStatus }) {
  return <Badge tone={DEMO_STATUS_TONE[status]}>{DEMO_STATUS_LABELS[status]}</Badge>;
}

/** "Oct 9, 2026" for a YYYY-MM-DD calendar date (read at noon UTC so no time zone moves the day). */
export function fmtCalendarDate(date: string | null): string {
  return date ? fmtDate(`${date}T12:00:00Z`) : "-";
}

const person = (email: string | null, name: string | null) => (email ? name || email : "-");

/**
 * Demo requests as a list that reads the same on a phone and a desk: the
 * Demos page, the client and lead cards. Each row is one big link to the
 * request (a phone-sized tap target); "Open demo" sits beside it once there
 * is a link. `showTarget` adds who the demo is for (left out on a client's or
 * lead's own card).
 */
export function DemoList({ demos, empty, showTarget = true }: { demos: DemoRequest[]; empty: string; showTarget?: boolean }) {
  if (demos.length === 0) return <p className="text-sm text-ink-4">{empty}</p>;
  return (
    <ul className="-my-1 flex flex-col divide-y divide-line">
      {demos.map((d) => {
        const target = d.clientId ? `Client: ${d.clientName ?? "unnamed"}` : d.leadId ? `Lead: ${d.leadName ?? "unnamed"}` : null;
        return (
          <li key={d.id} className="flex items-start gap-2 py-1">
            <Link href={`/admin/demos/${d.id}`} className="group block min-h-11 min-w-0 flex-1 rounded-xl py-2 pr-1">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words font-medium text-ink group-hover:text-gold">{d.business.name}</span>
                <DemoStatusBadge status={d.status} />
              </span>
              <span className="mt-0.5 block truncate text-xs text-ink-4">
                {d.business.type} · {d.business.area}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-3">
                {showTarget && target && <span className="min-w-0 break-words">{target}</span>}
                <span>Asked by {person(d.requestedBy, d.requestedByName)}</span>
                {d.builderEmail && <span className="min-w-0 break-all">Builder: {d.builderEmail}</span>}
                <span>{d.neededBy ? `Needed by ${fmtCalendarDate(d.neededBy)}` : `Asked ${fmtDate(d.createdAt)}`}</span>
              </span>
            </Link>
            {d.demoUrl && (d.status === "ready" || d.status === "shown") && (
              <a
                href={d.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open demo for ${d.business.name}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium text-gold hover:underline"
              >
                Open demo
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
