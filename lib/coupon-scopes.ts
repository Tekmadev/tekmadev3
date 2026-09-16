import { productMeta } from "@/config/products";

/**
 * What a discount code is allowed to discount. Kept apart from
 * lib/coupon-sync.ts (which imports the Stripe SDK) so the admin form, a
 * client component, can label scopes without pulling Stripe into the browser
 * bundle.
 *
 * Scoping works because every chargeable thing sits under its own Stripe
 * product: the growth monthly prices, the growth setup fees, a product's build
 * fee, and a product's care plan. The coupon carries `applies_to.products`, so
 * a code made for Webline is refused by Stripe on any other checkout.
 *
 * `product:<id>` and `care:<id>` name the product, so adding a second one-time
 * product gives it coupon scopes with no change here.
 */
export type CouponScope = "monthly" | "setup" | "order" | `product:${string}` | `care:${string}`;

/** Scopes that discount a single charge, so a duration choice is meaningless. */
export function isOneTimeScope(scope: CouponScope): boolean {
  return scope === "setup" || scope.startsWith("product:");
}

/** The product id inside a `product:<id>` or `care:<id>` scope, else null. */
export function scopeProductId(scope: CouponScope): string | null {
  const i = scope.indexOf(":");
  return i === -1 ? null : scope.slice(i + 1) || null;
}

export type ScopeOption = { value: CouponScope; label: string; help: string };

/**
 * The choices in the admin, in the order they are offered. Product scopes are
 * generated from config/products.ts, so a new product shows up on its own.
 */
export function scopeOptions(): ScopeOption[] {
  const options: ScopeOption[] = [
    {
      value: "monthly",
      label: "Growth plans: monthly",
      help: "Discounts the monthly subscription on Convert and Grow. Nothing else.",
    },
    {
      value: "setup",
      label: "Growth plans: setup fee",
      help: "Discounts the one-time setup charge on Convert and Grow. Nothing else.",
    },
  ];

  for (const p of productMeta) {
    options.push({
      value: `product:${p.id}`,
      label: `${p.name}: build fee`,
      help: `Only works on a ${p.name} checkout, and only against the one-time build fee.`,
    });
    if (p.care) {
      options.push({
        value: `care:${p.id}`,
        label: `${p.care.name}: monthly`,
        help: `Only works when the client sets up ${p.care.name}, and only against the monthly charge.`,
      });
    }
  }

  options.push({
    value: "order",
    label: "Anything (every offer)",
    help: "No product limit: this code discounts whatever is in the checkout, including Webline. Use with care.",
  });
  return options;
}

/** Short label for a stored scope, for lists and tables. */
export function scopeLabel(scope: CouponScope): string {
  const found = scopeOptions().find((o) => o.value === scope);
  if (found) return found.label;
  // A product that was removed from config after codes were made for it.
  const id = scopeProductId(scope);
  if (scope.startsWith("care:")) return `${id} care (removed)`;
  if (scope.startsWith("product:")) return `${id} (removed)`;
  return scope;
}
