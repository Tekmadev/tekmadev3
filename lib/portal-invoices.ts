import { modeOfClient, stripeFor } from "@/lib/stripe-mode";

/**
 * A client's invoices, read straight from Stripe for the portal's Billing page.
 *
 * Stripe already makes a numbered invoice for every payment: one for a Webline
 * purchase, one for each plan charge. They are the legal record (our name and
 * tax number, the buyer, the tax line), so the portal lists Stripe's own
 * documents instead of drawing a copy that could drift from them.
 *
 * Read live, not stored: the download links Stripe hands out expire, and a
 * fresh read gives fresh links every time the page opens. `null` means the list
 * could not be loaded, which the page must not show as "no invoices yet".
 */

export type PortalInvoice = {
  id: string;
  number: string | null;
  /** When it was paid, or issued if it is still open. ISO string. */
  date: string;
  description: string;
  status: "paid" | "open" | "uncollectible";
  total: number;
  tax: number;
  amountDue: number;
  currency: string;
  /** Stripe's hosted page: view, pay if still open, download. */
  hostedUrl: string | null;
  pdfUrl: string | null;
};

const SHOWN = new Set(["paid", "open", "uncollectible"]);

export async function listInvoicesForClient(client: {
  stripe_customer_id: string | null;
  is_test?: boolean | null;
}): Promise<PortalInvoice[] | null> {
  if (!client.stripe_customer_id) return [];
  // The key follows the client: a test client's customer only exists in the sandbox.
  const stripe = stripeFor(modeOfClient(client));
  if (!stripe) return null;

  try {
    const res = await stripe.invoices.list({ customer: client.stripe_customer_id, limit: 36 });
    return res.data
      // Drafts and voided invoices are not documents the client should act on,
      // and the $0 invoice Stripe cuts when a trial starts is only noise.
      .filter((inv) => inv.status && SHOWN.has(inv.status) && inv.total !== 0)
      .map((inv) => {
        const lines = inv.lines?.data ?? [];
        const first = lines[0]?.description?.trim();
        const more = lines.length > 1 ? ` + ${lines.length - 1} more` : "";
        const when = inv.status_transitions?.paid_at ?? inv.effective_at ?? inv.created;
        return {
          id: inv.id ?? "",
          number: inv.number,
          date: new Date(when * 1000).toISOString(),
          description: first ? `${first}${more}` : inv.description?.trim() || "Invoice",
          status: inv.status as PortalInvoice["status"],
          total: inv.total,
          tax: (inv.total_taxes ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0),
          amountDue: inv.amount_remaining ?? inv.amount_due,
          currency: inv.currency,
          hostedUrl: inv.hosted_invoice_url ?? null,
          pdfUrl: inv.invoice_pdf ?? null,
        };
      });
  } catch (err) {
    console.error("[portal invoices]", err instanceof Error ? err.message : String(err));
    return null;
  }
}
