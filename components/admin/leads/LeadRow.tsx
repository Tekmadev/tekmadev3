import Link from "next/link";
import { Phone, Video } from "lucide-react";
import { joinFieldsOf, rowCallLine } from "@/lib/booking-ui";
import { CallLink } from "./CallLink";
import { RowJoinLink } from "./BookedCall";
import { FollowUpTag, LeadAvatar, StatusBadge } from "./LeadBadges";
import {
  finderOf,
  followUpSpoken,
  formatDateTime,
  formatPhone,
  leadTitle,
  needLabelOf,
  revenueLabelOf,
  rowMeta,
  rowSubtitle,
  staffName,
  statusLabel,
  type Lead,
} from "@/lib/leads-ui";

/** The first non-blank line of a message, kept short (the row truncates it anyway). */
function firstLine(message: string | null): string | null {
  if (!message) return null;
  const line = message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return line ? line.slice(0, 200) : null;
}

/** "Assigned to Maya Chen" or "Nobody assigned". */
function assigneeLine(lead: Lead): string {
  return lead.assignedTo ? `Assigned to ${staffName(lead.assignedTo)}` : "Nobody assigned";
}

/**
 * The desktop details line (decision D9), in order: booked call (unless the
 * call line above already says when it is), need, revenue band (only when
 * the server sent it: owners and managers), found by, booked by, assigned
 * to, UTM source and campaign, the message's first line.
 */
function detailItems(lead: Lead, nowMs: number, showAssignee: boolean, callShown: boolean): { text: string; message?: boolean }[] {
  const items: { text: string; message?: boolean }[] = [];
  if (lead.bookingAt && !callShown) {
    const what = lead.booking?.status === "cancelled" ? "Cancelled call" : "Booked call";
    items.push({ text: `${what} ${formatDateTime(lead.bookingAt, nowMs)}` });
  }
  const need = needLabelOf(lead.need);
  if (need) items.push({ text: need });
  if (lead.revenue !== null) {
    const revenue = revenueLabelOf(lead.revenue);
    if (revenue) items.push({ text: revenue });
  }
  const finder = finderOf(lead);
  if (finder) items.push({ text: `Found by ${staffName(finder)}` });
  if (lead.bookedBy) items.push({ text: `Booked by ${staffName(lead.bookedBy)}` });
  if (lead.assignedTo && !showAssignee) items.push({ text: `Assigned to ${staffName(lead.assignedTo)}` });
  const utm = [lead.utm?.source, lead.utm?.campaign].filter(Boolean).join(" / ");
  if (utm) items.push({ text: `UTM ${utm}` });
  const message = firstLine(lead.message);
  if (message) items.push({ text: message, message: true });
  return items;
}

/**
 * One lead in a list: the whole row opens the lead, and a separate round Call
 * button (a plain tel: link, never inside the row's link) calls it; its label
 * says who ("Call Olivia Chen, (416) 555-0100"). With
 * `showAssignee` (everyone's follow-ups) the row says who owns it on every
 * width. On desktop a details line adds what the old tables showed.
 *
 * A lead with a call coming (booked, not cancelled, not over) says when on
 * every width ("Call today, 3:00 p.m."). From 15 minutes before the start to
 * the end, a "Join" button opens the join link: beside Call from sm, on its
 * own line under the row on a phone, where the name needs the room.
 */
export function LeadRow({ lead, nowMs, showAssignee }: { lead: Lead; nowMs: number; showAssignee?: boolean }) {
  const title = leadTitle(lead);
  const subtitle = rowSubtitle(lead);
  const meta = rowMeta(lead, nowMs);
  const call = rowCallLine(lead.booking, nowMs);
  const owner = showAssignee ? assigneeLine(lead) : null;
  const details = detailItems(lead, nowMs, !!showAssignee, call !== null);
  const label = [title, subtitle, meta, call, followUpSpoken(lead.followUpAt, nowMs), statusLabel(lead.status), owner, ...details.map((d) => d.text)]
    .filter(Boolean)
    .join(", ");
  const phone = formatPhone(lead.phone);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <Link
        href={`/admin/leads/${encodeURIComponent(lead.id)}`}
        aria-label={label}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        {/* Below sm the name needs the room more than the initials do: with the
            badges and the Call button beside it, a 375px phone left it about 110px. */}
        <span className="hidden shrink-0 sm:block">
          <LeadAvatar title={title} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{title}</p>
          {subtitle && <p className="truncate text-sm text-ink-3">{subtitle}</p>}
          <p className="truncate text-xs text-ink-4">{meta}</p>
          {call && (
            <p className="flex min-w-0 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <Video aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate tabular-nums">{call}</span>
            </p>
          )}
          {owner && <p className="truncate text-xs text-ink-3">{owner}</p>}
          {details.length > 0 && (
            <p className="hidden text-xs text-ink-4 lg:flex lg:flex-wrap lg:gap-x-3 lg:gap-y-0.5">
              {details.map((d, i) => (
                <span key={i} className={d.message ? "max-w-md truncate" : "max-w-full truncate"}>
                  {d.text}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <FollowUpTag followUpAt={lead.followUpAt} nowMs={nowMs} />
          <StatusBadge status={lead.status} />
        </div>
      </Link>
      {lead.booking?.joinUrl ? (
        <RowJoinLink booking={joinFieldsOf(lead.booking)} nowMs={nowMs} who={title} className="max-sm:order-last max-sm:w-full" />
      ) : null}
      <CallLink
        lead={lead}
        label={title === phone ? `Call ${phone}` : `Call ${title}, ${phone}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-2 transition-colors hover:border-gold hover:text-gold"
      >
        <Phone aria-hidden="true" className="h-4 w-4" />
      </CallLink>
    </li>
  );
}
