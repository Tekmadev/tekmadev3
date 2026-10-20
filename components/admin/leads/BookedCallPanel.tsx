import { CalendarClock, ExternalLink } from "lucide-react";
import { Badge, Row, btnSecondary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { formatPhone, mailtoHref, telHref } from "@/lib/leads-ui";
import {
  BOOKING_COPY,
  bookingBadge,
  bookingChange,
  bookingStatusAt,
  bookingTheirTime,
  bookingWhen,
  joinFieldsOf,
  joinLinkOf,
  type Booking,
} from "@/lib/booking-ui";
import { CopyButton } from "./CopyButton";
import { CopyLinkButton, JoinCallLink } from "./BookedCall";

/**
 * The lead page's "Booked call" (the app's booked call card, the same copy):
 * when it is in Toronto with the end, the booker's own time when their clock
 * differs, a cancelled call's reason or a moved call's old time, how it
 * happens, Join call, Copy link and Open in Cal.com, then their answers,
 * notes and guests. On a cancelled call Join call and Copy link are hidden
 * (Cal.com closes the room), as in the app; Open in Cal.com stays. Plain
 * markup (no hooks), so the server renders it; only Join call and the copy
 * buttons run in the browser.
 */

const SECTION_TITLE = "text-xs uppercase tracking-wide text-ink-4";

/** How the call happens: the label, then the phone number (a tel: link) or the address under it. */
function HowValue({ how }: { how: Booking["how"] }) {
  const detail = how.detail?.trim() || null;
  const tel = how.kind === "phone" ? telHref(detail) : null;
  return (
    <span className="flex min-w-0 flex-col">
      <span>{how.label}</span>
      {detail && tel ? (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          <a href={tel} className="inline-flex min-h-11 items-center whitespace-nowrap text-gold tabular-nums hover:underline">
            {formatPhone(detail)}
          </a>
          <CopyButton value={detail} label="Copy phone number" />
        </span>
      ) : detail ? (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          <span className="min-w-0 whitespace-pre-wrap break-words text-ink">{detail}</span>
          <CopyButton value={detail} label={how.kind === "in_person" ? "Copy address" : "Copy details"} />
        </span>
      ) : null}
    </span>
  );
}

export function BookedCallPanel({ booking, nowMs }: { booking: Booking; nowMs: number }) {
  const status = bookingStatusAt(booking, nowMs);
  const badge = bookingBadge(booking, nowMs);
  const when = bookingWhen(booking, nowMs);
  const theirTime = bookingTheirTime(booking, nowMs);
  const change = bookingChange(booking, nowMs);
  const join = joinLinkOf(booking);
  const hasButtons = !!join || !!booking.manageUrl;

  return (
    <section aria-labelledby="booked-call-title" className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            status === "booked" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-bg-3 text-ink-4",
          )}
        >
          <CalendarClock className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="booked-call-title" className="text-base font-semibold text-ink">
              {BOOKING_COPY.title}
            </h2>
            {badge ? <Badge tone={badge === BOOKING_COPY.cancelled ? "signal" : "muted"}>{badge}</Badge> : null}
          </div>
          <p className={cn("break-words font-semibold tabular-nums", status === "booked" ? "text-ink" : "text-ink-3")}>{when}</p>
          {theirTime ? <p className="break-words text-sm text-ink-3 tabular-nums">{theirTime}</p> : null}
          {change.moved ? <p className="break-words text-sm text-ink-3 tabular-nums">{change.moved}</p> : null}
          {change.reason ? <p className="select-text whitespace-pre-wrap break-words text-sm text-ink-2">{change.reason}</p> : null}
        </div>
      </div>

      {hasButtons ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
          {join ? (
            <>
              <JoinCallLink booking={{ ...joinFieldsOf(booking), joinUrl: join }} nowMs={nowMs} className="w-full sm:w-auto" />
              <CopyLinkButton url={join} />
            </>
          ) : null}
          {booking.manageUrl ? (
            <a href={booking.manageUrl} target="_blank" rel="noopener noreferrer" className={cn(btnSecondary, "w-full sm:w-auto")}>
              <ExternalLink className="h-4 w-4" aria-hidden />
              {BOOKING_COPY.openCal}
              <span className="sr-only">{` ${BOOKING_COPY.newTab}`}</span>
            </a>
          ) : null}
        </div>
      ) : null}

      <dl className="mt-4 border-t border-line pt-1.5">
        <Row label={BOOKING_COPY.how}>
          <HowValue how={booking.how} />
        </Row>
      </dl>

      {booking.answers.length > 0 ? (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className={SECTION_TITLE}>{BOOKING_COPY.answers}</h3>
          <dl className="mt-1 divide-y divide-line">
            {booking.answers.map((a) => (
              <div key={a.key} className="py-2.5">
                <dt className="break-words text-sm text-ink-3">{a.label}</dt>
                <dd className="mt-0.5 select-text whitespace-pre-wrap break-words text-sm text-ink">{a.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {booking.notes ? (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className={SECTION_TITLE}>{BOOKING_COPY.notes}</h3>
          <p className="mt-2 select-text whitespace-pre-wrap break-words text-sm text-ink-2">{booking.notes}</p>
        </div>
      ) : null}

      {booking.guests.length > 0 ? (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className={SECTION_TITLE}>{BOOKING_COPY.guests}</h3>
          <ul className="mt-1">
            {booking.guests.map((email) => {
              const mailto = mailtoHref(email);
              return (
                <li key={email} className="min-w-0">
                  {mailto ? (
                    <a href={mailto} className="inline-flex min-h-11 min-w-0 items-center break-all text-sm text-gold hover:underline">
                      {email}
                    </a>
                  ) : (
                    <span className="break-all text-sm text-ink-2">{email}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
