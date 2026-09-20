import type Stripe from "stripe";
import { stripeFor, type StripeMode } from "@/lib/stripe-mode";
import { hourKey, notifyAdmins } from "@/lib/admin-notify";
import { getSalesTaxSetting } from "@/lib/site-settings";

/**
 * Sales tax (GST/HST) at checkout, through Stripe Tax.
 *
 * Tekmadev is a GST/HST registrant, so tax has to be charged and shown on the
 * invoice. Stripe Tax does the arithmetic (the rate follows the buyer's
 * province, and it is zero where we hold no registration), but only once the
 * owner has switched it on in the Stripe dashboard: a head office address plus
 * the Canadian registration. Sending `automatic_tax` before that makes Stripe
 * REJECT the checkout, which on a live site means nobody can pay.
 *
 * So two things must both be true before a checkout carries tax:
 *
 *  1. The owner switched it on for this site (Admin, Pricing). Stripe Tax being
 *     ready is NOT consent: the Stripe account is shared with another project,
 *     and tax was already active there before this site ever charged any.
 *     Adding 13% to what a buyer pays is the owner's call, made on purpose.
 *  2. Stripe reports its tax settings as complete, so the taxed checkout cannot
 *     be refused. That answer is remembered for a few minutes, per mode,
 *     because the sandbox has tax settings of its own.
 *
 * Whether the prices include the tax or have it added on top is also the
 * owner's choice, made once in Stripe (Tax settings, "include tax in prices").
 * Nothing here decides it.
 */

export type TaxStatus = {
  /** True only when Stripe reports its tax settings as complete. */
  active: boolean;
  reason: "active" | "pending" | "no_key" | "error";
  /** What Stripe says is still missing, for the admin screen. */
  missing: string[];
  /** "exclusive" adds tax on top of the price, "inclusive" takes it out of the price. */
  behavior: string | null;
  /** Where Stripe will actually collect: tax is only charged where a registration is active. */
  registrations: string[];
};

const TTL_MS = 5 * 60_000;
// A failed lookup is retried sooner: the usual cause is a passing network error.
const ERROR_TTL_MS = 30_000;
const cache = new Map<StripeMode, { at: number; ttl: number; status: TaxStatus }>();

export async function getTaxStatus(mode: StripeMode, opts: { fresh?: boolean } = {}): Promise<TaxStatus> {
  const hit = cache.get(mode);
  if (!opts.fresh && hit && Date.now() - hit.at < hit.ttl) return hit.status;

  const stripe = stripeFor(mode);
  let status: TaxStatus;
  if (!stripe) {
    status = { active: false, reason: "no_key", missing: [], behavior: null, registrations: [] };
  } else {
    try {
      const [settings, regs] = await Promise.all([
        stripe.tax.settings.retrieve(),
        stripe.tax.registrations.list({ status: "active", limit: 100 }),
      ]);
      status = {
        active: settings.status === "active",
        reason: settings.status === "active" ? "active" : "pending",
        missing: settings.status_details?.pending?.missing_fields ?? [],
        behavior: settings.defaults?.tax_behavior ?? null,
        registrations: [...new Set(regs.data.map((r) => r.country))],
      };
    } catch (err) {
      // A key without permission to read tax settings lands here too. Tax stays
      // off, checkout keeps working, and the admin screen shows why.
      console.error("[stripe tax] could not read tax settings", err instanceof Error ? err.message : String(err));
      status = { active: false, reason: "error", missing: [], behavior: null, registrations: [] };
    }
  }
  cache.set(mode, { at: Date.now(), ttl: status.reason === "error" ? ERROR_TTL_MS : TTL_MS, status });
  return status;
}

/** The same session, with tax switched on. A returning customer's address is refreshed from what they type. */
export function withTax(params: Stripe.Checkout.SessionCreateParams): Stripe.Checkout.SessionCreateParams {
  return {
    ...params,
    automatic_tax: { enabled: true },
    // The rate depends on where the buyer is, so an address is always collected.
    billing_address_collection: "required",
    ...(params.customer ? { customer_update: { ...params.customer_update, address: "auto" } } : {}),
  };
}

/**
 * Create a Checkout Session, with tax when Stripe Tax is ready.
 *
 * If Stripe refuses the taxed session, the buyer still gets a payment page:
 * the session is created again without tax and the owner is alerted at once.
 * Losing the sale helps nobody; selling once without tax is a bookkeeping fix.
 */
export async function createCheckoutSession(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
  mode: StripeMode,
): Promise<Stripe.Checkout.Session> {
  // The owner's switch first: it is the cheaper check and the one that decides.
  const wanted = (await getSalesTaxSetting())[mode];
  if (!wanted) return stripe.checkout.sessions.create(params);

  const tax = await getTaxStatus(mode);
  if (!tax.active) {
    // Switched on here, but Stripe is not ready. Sell without tax rather than
    // not at all, and say so, once an hour at most.
    await notifyAdmins({
      event: "checkout.tax_failed",
      title: "Sales tax is switched on, but Stripe Tax is not ready",
      body: "A checkout was started WITHOUT GST/HST because Stripe Tax is not set up for this mode. Open Pricing to see what Stripe still needs.",
      url: "/admin/pricing",
      needsAction: true,
      isTest: mode === "test",
      dedupeKey: hourKey("checkout_tax_not_ready"),
      collapse: true,
    });
    return stripe.checkout.sessions.create(params);
  }

  try {
    return await stripe.checkout.sessions.create(withTax(params));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe tax] taxed checkout was refused, retrying without tax", message);
    // Let the plain attempt speak for itself: if it fails too, the caller
    // reports a checkout error and this alert would only be noise beside it.
    const session = await stripe.checkout.sessions.create(params);
    await notifyAdmins({
      event: "checkout.tax_failed",
      title: "A checkout was started WITHOUT sales tax",
      body: `Stripe refused the taxed checkout, so the buyer was sent to pay without GST/HST: ${message}. Check Stripe Tax settings, then correct this sale with your accountant.`,
      url: "/admin/pricing",
      needsAction: true,
      isTest: mode === "test",
      dedupeKey: hourKey("checkout_tax_failed"),
      collapse: true,
    });
    return session;
  }
}
