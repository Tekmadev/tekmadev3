import { CalendarClock, ExternalLink } from "lucide-react";
import { Panel, Row } from "@/components/portal/ui";
import { CopyButton } from "@/components/admin/leads/CopyButton";
import { cn } from "@/lib/cn";
import {
  COPY,
  asksQualifiers,
  bookingDistance,
  formatFieldDateTime,
  formatPhone,
  isOutreachLead,
  isUpcoming,
  mailtoHref,
  needLabelOf,
  revenueLabelOf,
  telHref,
  type Lead,
} from "@/lib/leads-ui";

/**
 * The read-only parts of a lead's page (the app's lead detail): the booked
 * call, Details, the message or note, and Attribution. Plain components (no
 * hooks), so the server renders them; only the copy buttons run in the browser.
 * A missing value reads "Not set", never a made-up one.
 */

function NotSet({ children = COPY.notSet }: { children?: string }) {
  return <span className="text-ink-4">{children}</span>;
}

/** A value with its buttons beside it; long values wrap instead of widening the page. */
function WithActions({ children }: { children: React.ReactNode }) {
  return <span className="flex min-w-0 flex-wrap items-center gap-x-2">{children}</span>;
}

/** A plain value plus a copy button, or "Not set" (or the given fallback) when empty. */
function CopyableValue({ value, copyLabel, fallback }: { value: string | null; copyLabel: string; fallback?: string }) {
  const text = value?.trim();
  if (!text) return <NotSet>{fallback ?? COPY.notSet}</NotSet>;
  return (
    <WithActions>
      <span className="min-w-0 break-all">{text}</span>
      <CopyButton value={text} label={copyLabel} />
    </WithActions>
  );
}

const SITE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i;

/** An http or https address for a value that looks like a site ("acme.ca" -> "https://acme.ca"), else null. */
function websiteHref(raw: string): string | null {
  const value = raw.trim();
  if (!SITE.test(value)) return null;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** The booked call in Toronto time, with how far it is ("tomorrow", "3 days ago"). */
export function BookedCallCard({ at, nowMs }: { at: string; nowMs: number }) {
  const upcoming = isUpcoming(at, nowMs);
  const when = formatFieldDateTime(at, nowMs);
  const distance = bookingDistance(at, nowMs);
  const spoken = `${upcoming ? "Call booked for" : "Call was booked for"} ${when}, Toronto time${distance ? `, ${distance}` : ""}`;
  return (
    <div role="group" aria-label={spoken} className="flex items-center gap-4 rounded-2xl border border-line-strong bg-surface p-4 sm:p-5">
      <span
        aria-hidden
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          upcoming ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-bg-3 text-ink-4",
        )}
      >
        <CalendarClock className="h-5 w-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs uppercase tracking-wide text-ink-4">{upcoming ? "Booked call" : "Call was booked for"}</p>
        <p className="break-words font-semibold text-ink tabular-nums">{when}</p>
        <p className="text-sm text-ink-3">{distance ? `Toronto time · ${distance}` : "Toronto time"}</p>
      </div>
    </div>
  );
}

/**
 * Details: business, email, phone, website, need and revenue (when the form
 * asked for them), and when it came in. Revenue is money: it shows only with
 * `showRevenue` (overview.revenue), and the server already blanked it for
 * everyone else, so the row is left out rather than shown as "Not set".
 */
export function LeadDetails({ lead, nowMs, showRevenue }: { lead: Lead; nowMs: number; showRevenue: boolean }) {
  const email = lead.email.trim();
  const mailto = mailtoHref(email);
  const phone = lead.phone?.trim() ?? "";
  const tel = telHref(phone || null);
  const website = lead.website?.trim() ?? "";
  const site = website ? websiteHref(website) : null;
  const qualifiers = asksQualifiers(lead);
  const need = needLabelOf(lead.need);
  const revenue = revenueLabelOf(lead.revenue);

  return (
    <Panel title="Details">
      <dl className="-my-2.5 divide-y divide-line">
        <Row label="Business">{lead.business?.trim() ? lead.business : <NotSet />}</Row>

        <Row label="Email">
          {mailto ? (
            <WithActions>
              <a href={mailto} className="inline-flex min-h-11 min-w-0 items-center break-all text-gold hover:underline">
                {email}
              </a>
              <CopyButton value={email} label="Copy email" />
            </WithActions>
          ) : email ? (
            <span className="break-all">{email}</span>
          ) : (
            <NotSet />
          )}
        </Row>

        <Row label="Phone">
          {tel ? (
            <WithActions>
              <a href={tel} className="inline-flex min-h-11 min-w-0 items-center whitespace-nowrap text-gold tabular-nums hover:underline">
                {formatPhone(phone)}
              </a>
              <CopyButton value={phone} label="Copy phone number" />
            </WithActions>
          ) : phone ? (
            <span className="break-all">{phone}</span>
          ) : (
            <NotSet />
          )}
        </Row>

        {website ? (
          <Row label="Website">
            <WithActions>
              <span className="min-w-0 break-all">{website}</span>
              <CopyButton value={website} label="Copy website" />
              {site && (
                <a
                  href={site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-gold hover:underline"
                >
                  Open
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </WithActions>
          </Row>
        ) : null}

        {qualifiers ? <Row label="Need">{need ?? <NotSet />}</Row> : null}
        {qualifiers && showRevenue ? <Row label="Revenue">{revenue ?? <NotSet />}</Row> : null}

        <Row label={isOutreachLead(lead) ? "Added" : "Received"}>
          <span className="tabular-nums">{formatFieldDateTime(lead.createdAt, nowMs)}</span>
        </Row>
      </dl>
    </Panel>
  );
}

/** The lead's message as typed (a note, for a lead added by hand). Nothing when it is blank. */
export function LeadMessage({ lead }: { lead: Lead }) {
  if (!lead.message || !lead.message.trim()) return null;
  return (
    <Panel title={isOutreachLead(lead) ? "Note" : "Message"}>
      <p className="select-text whitespace-pre-wrap break-words text-sm text-ink-2">{lead.message}</p>
    </Panel>
  );
}

/** Where a lead from the site came from. A lead added by hand never visited the site: nothing to show. */
export function LeadAttribution({ lead }: { lead: Lead }) {
  if (isOutreachLead(lead)) return null;
  return (
    <Panel title="Attribution">
      <dl className="-my-2.5 divide-y divide-line">
        <Row label="UTM source">
          <CopyableValue value={lead.utm.source} copyLabel="Copy UTM source" />
        </Row>
        <Row label="UTM medium">
          <CopyableValue value={lead.utm.medium} copyLabel="Copy UTM medium" />
        </Row>
        <Row label="UTM campaign">
          <CopyableValue value={lead.utm.campaign} copyLabel="Copy UTM campaign" />
        </Row>
        <Row label="Referrer">
          <CopyableValue value={lead.referrer} copyLabel="Copy referrer" fallback="Direct visit" />
        </Row>
      </dl>
    </Panel>
  );
}
