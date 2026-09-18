import Stripe from "stripe";

/**
 * Which Stripe a request talks to: live, or the sandbox.
 *
 * The site takes real money with STRIPE_SECRET_KEY. Test mode lets an admin
 * rehearse a whole purchase with a sandbox key, on the real site, without
 * moving any. Three rules hold everywhere and are the reason this file exists:
 *
 *  1. Live is the default. With no test key configured, nothing here changes
 *     how the site behaves.
 *  2. Never fall back across modes. If the key for a mode is missing, the call
 *     fails. A test purchase must never quietly run against live Stripe, and a
 *     real one must never run against the sandbox.
 *  3. Mode follows the data. A checkout is test only when a signed-in admin
 *     turned it on; after that, Stripe's own `livemode` flag on the verified
 *     webhook stamps the order and the client, and every later Stripe call for
 *     that client uses the key of the mode it was born in.
 */

export type StripeMode = "live" | "test";

const LIVE_KEY = /^(sk|rk)_live_/;

function testSecret(): string | null {
  const key = process.env.STRIPE_TEST_SECRET_KEY?.trim();
  if (!key) return null;
  // The one mistake that would turn "test mode" into charging real cards with
  // test-mode rules. Refuse it outright rather than trust the variable's name.
  if (LIVE_KEY.test(key)) {
    console.error("[stripe mode] STRIPE_TEST_SECRET_KEY holds a LIVE key. Test mode is disabled.");
    return null;
  }
  return key;
}

export function stripeSecret(mode: StripeMode): string | null {
  return mode === "test" ? testSecret() : process.env.STRIPE_SECRET_KEY?.trim() || null;
}

/** A Stripe client for that mode, or null when that mode has no key. Never the other mode's. */
export function stripeFor(mode: StripeMode): Stripe | null {
  const secret = stripeSecret(mode);
  return secret ? new Stripe(secret) : null;
}

export function webhookSecret(mode: StripeMode): string | null {
  const v = mode === "test" ? process.env.STRIPE_TEST_WEBHOOK_SECRET : process.env.STRIPE_WEBHOOK_SECRET;
  return v?.trim() || null;
}

/** True when a sandbox key and its webhook secret are both present and sane. */
export function testModeConfigured(): boolean {
  return Boolean(testSecret() && webhookSecret("test"));
}

export function modeOfClient(client: { is_test?: boolean | null } | null | undefined): StripeMode {
  return client?.is_test ? "test" : "live";
}

export function modeOfLivemode(livemode: boolean): StripeMode {
  return livemode ? "live" : "test";
}

/** The Stripe ids a product uses in a given mode. Null means "not set up in that mode". */
export function productIds(
  row: {
    stripe_product_id: string | null;
    stripe_price_id: string | null;
    stripe_monthly_product_id: string | null;
    stripe_monthly_price_id: string | null;
    stripe_test_product_id?: string | null;
    stripe_test_price_id?: string | null;
    stripe_test_monthly_product_id?: string | null;
    stripe_test_monthly_price_id?: string | null;
  },
  mode: StripeMode,
): { productId: string | null; priceId: string | null; monthlyProductId: string | null; monthlyPriceId: string | null } {
  return mode === "test"
    ? {
        productId: row.stripe_test_product_id ?? null,
        priceId: row.stripe_test_price_id ?? null,
        monthlyProductId: row.stripe_test_monthly_product_id ?? null,
        monthlyPriceId: row.stripe_test_monthly_price_id ?? null,
      }
    : {
        productId: row.stripe_product_id,
        priceId: row.stripe_price_id,
        monthlyProductId: row.stripe_monthly_product_id,
        monthlyPriceId: row.stripe_monthly_price_id,
      };
}
