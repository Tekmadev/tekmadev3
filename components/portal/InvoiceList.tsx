import { Download, ExternalLink } from "lucide-react";
import type { PortalInvoice } from "@/lib/portal-invoices";
import { Badge, fmtDate, type Tone } from "@/components/portal/ui";

const TONE: Record<PortalInvoice["status"], Tone> = { paid: "ok", open: "warn", uncollectible: "signal" };
const LABEL: Record<PortalInvoice["status"], string> = { paid: "Paid", open: "Payment due", uncollectible: "Unpaid" };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

const linkCls =
  "inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-gold hover:text-gold";

/** Every invoice Stripe has issued to this client, newest first, each with its PDF. */
export function InvoiceList({ invoices }: { invoices: PortalInvoice[] }) {
  return (
    <ul className="divide-y divide-line">
      {invoices.map((inv) => (
        <li key={inv.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{inv.description}</p>
            <p className="mt-0.5 text-xs text-ink-3">
              {fmtDate(inv.date)}
              {inv.number ? ` · ${inv.number}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0 sm:justify-end">
            <div className="sm:text-right">
              <p className="text-sm font-semibold tabular-nums text-ink">{money(inv.total, inv.currency)}</p>
              {inv.tax > 0 && <p className="text-xs tabular-nums text-ink-4">incl. {money(inv.tax, inv.currency)} tax</p>}
            </div>
            <Badge tone={TONE[inv.status]}>{LABEL[inv.status]}</Badge>
            <div className="flex items-center gap-2">
              {inv.status !== "paid" && inv.hostedUrl ? (
                <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  Pay now <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {inv.pdfUrl ? (
                <a href={inv.pdfUrl} rel="noopener noreferrer" className={linkCls} aria-label={`Download invoice ${inv.number ?? ""} as PDF`}>
                  PDF <Download className="h-3.5 w-3.5" />
                </a>
              ) : inv.hostedUrl ? (
                <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  View <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
