import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { followUpBadge, followUpShort, initials, sourceLabel, statusLabel, statusTone } from "@/lib/leads-ui";

/*
 * Small lead badges shared by the list, the lead page and its outreach card.
 * A plain module (no hooks, no "use client"), so server and client components
 * both use it. Every badge carries text: colour is never the only signal.
 */

/** The lead's status: "New" gold, "Booked" green, the rest muted (the app's tones). */
export function StatusBadge({ status, dot }: { status: string; dot?: boolean }) {
  return (
    <Badge tone={statusTone(status)}>
      {dot && <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {statusLabel(status)}
    </Badge>
  );
}

/** Where the lead came from: "Lead form", "Booked call", "Outreach"... */
export function SourceBadge({ source }: { source: string }) {
  return <Badge tone="neutral">{sourceLabel(source)}</Badge>;
}

/** A row's follow-up: "2d overdue" (red), "Today" (gold), "Tomorrow" or "Oct 8". Nothing without one. */
export function FollowUpTag({ followUpAt, nowMs }: { followUpAt: string | null; nowMs: number }) {
  const short = followUpShort(followUpAt, nowMs);
  if (!short) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs",
        short.tone === "signal" && "font-semibold text-signal",
        short.tone === "gold" && "font-semibold text-gold-deep",
        short.tone === "muted" && "text-ink-4",
      )}
    >
      <CalendarClock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {short.text}
    </span>
  );
}

/** The badge beside a lead's follow-up: "Overdue", "Today", "Tomorrow", "In 3 days". Nothing without one. */
export function FollowUpBadge({ followUpAt, nowMs }: { followUpAt: string | null; nowMs: number }) {
  const badge = followUpBadge(followUpAt, nowMs);
  if (!badge) return null;
  return <Badge tone={badge.tone}>{badge.text}</Badge>;
}

/** A 40px circle with the lead's initials. Decorative: the title next to it says who it is. */
export function LeadAvatar({ title }: { title: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full bg-gold/15 font-display text-sm font-bold text-gold-deep"
    >
      {initials(title)}
    </span>
  );
}
