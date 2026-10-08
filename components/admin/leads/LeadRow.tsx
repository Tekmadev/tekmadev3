import Link from "next/link";
import { Phone } from "lucide-react";
import { CallLink } from "./CallLink";
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
 * The desktop details line (decision D9), in order: booked call, need, revenue
 * band (only when the server sent it: owners and managers), found by, booked
 * by, assigned to, UTM source and campaign, the message's first line.
 */
function detailItems(lead: Lead, nowMs: number, showAssignee: boolean): { text: string; message?: boolean }[] {
  const items: { text: string; message?: boolean }[] = [];
  if (lead.bookingAt) items.push({ text: `Booked call ${formatDateTime(lead.bookingAt, nowMs)}` });
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
 */
export function LeadRow({ lead, nowMs, showAssignee }: { lead: Lead; nowMs: number; showAssignee?: boolean }) {
  const title = leadTitle(lead);
  const subtitle = rowSubtitle(lead);
  const meta = rowMeta(lead, nowMs);
  const owner = showAssignee ? assigneeLine(lead) : null;
  const details = detailItems(lead, nowMs, !!showAssignee);
  const label = [title, subtitle, meta, followUpSpoken(lead.followUpAt, nowMs), statusLabel(lead.status), owner, ...details.map((d) => d.text)]
    .filter(Boolean)
    .join(", ");
  const phone = formatPhone(lead.phone);

  return (
    <li className="flex items-center gap-3 py-3">
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
