import { requireOwner } from "@/lib/admin";
import { getCouponsView, type CouponRow } from "@/lib/coupon-data";
import { getAllPlans } from "@/lib/pricing-data";
import { PageHeader, Panel, Notice, DataTable, Badge, fmtMoney, fmtDate } from "@/components/admin/ui";
import { CouponForm } from "@/components/admin/CouponForm";
import { DealLink } from "@/components/admin/DealLink";
import { business } from "@/config/site";
import { deactivateCouponAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  nostripe: "Stripe is not configured (missing STRIPE_SECRET_KEY), so coupons can't be created.",
  config: "Supabase is not configured.",
  input: "Something was missing. Please try again.",
  percent: "Percent off must be between 1 and 100.",
  amount: "Enter a fixed amount greater than zero.",
  months: "Enter a valid number of months (1 or more).",
  max: "Max redemptions must be 1 or more.",
  expires: "Enter a valid expiry date.",
  code: "That code isn't valid. Use letters, numbers and dashes.",
  expirespast: "The expiry date must be in the future.",
  dupe: "A coupon with that code already exists. Pick a different code.",
  noproducts: "No matching Stripe products yet. Save a price on the Pricing page first.",
  stripe: "Stripe rejected the request. Please check the values and try again.",
  db: "Saved in Stripe, but the database write failed. The code was rolled back.",
};

function discountLabel(c: CouponRow): string {
  if (c.discount_type === "percent") return `${c.percent_off}% off`;
  return `${fmtMoney(c.amount_off, c.currency)} off`;
}

function scopeLabel(c: CouponRow): string {
  return c.applies_to === "monthly" ? "Monthly" : c.applies_to === "setup" ? "Setup fee" : "Whole order";
}

function durationLabel(c: CouponRow): string {
  if (c.applies_to === "setup") return "Setup charge";
  if (c.duration === "forever") return "Forever";
  if (c.duration === "repeating") return `${c.duration_in_months} months`;
  return "First month";
}

export default async function CouponsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; code?: string; msg?: string }>;
}) {
  await requireOwner();
  const [coupons, plans] = await Promise.all([getCouponsView(), getAllPlans()]);
  const { ok, e, code, msg } = await searchParams;

  const stripeReady = plans.some((p) => p.stripe_product_id);
  const currency = plans[0]?.currency || "cad";

  const notice =
    ok === "created"
      ? { kind: "ok" as const, text: `Coupon ${code ? `"${code}" ` : ""}created and live at checkout.` }
      : ok === "disabled"
        ? { kind: "ok" as const, text: "Coupon disabled. It can no longer be redeemed." }
        : e
          ? {
              kind: "err" as const,
              text: e === "stripe" && msg ? `Stripe: ${msg}` : ERRORS[e] || "Something went wrong.",
            }
          : null;

  const rows = coupons.map((c) => [
    <span key="code" className="font-mono text-xs font-medium text-ink">
      {c.code}
    </span>,
    discountLabel(c),
    scopeLabel(c),
    durationLabel(c),
    <span key="red">
      {c.times_redeemed}
      {c.max_redemptions ? ` / ${c.max_redemptions}` : ""}
    </span>,
    c.redeem_by ? fmtDate(c.redeem_by) : "-",
    c.active ? <Badge key="s" tone="gold">active</Badge> : <Badge key="s" tone="muted">disabled</Badge>,
    c.active && (c.applies_to === "monthly" || c.applies_to === "order") ? (
      <DealLink key="dl" url={`${business.url}/start?deal=${encodeURIComponent(c.code)}`} />
    ) : (
      <span key="dl" className="text-ink-4">
        -
      </span>
    ),
    c.active ? (
      <form key="a" action={deactivateCouponAction}>
        <input type="hidden" name="id" value={c.id} />
        <button
          type="submit"
          className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-signal/50 hover:text-signal"
        >
          Disable
        </button>
      </form>
    ) : (
      <span key="a" className="text-ink-4">
        -
      </span>
    ),
  ]);

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader title="Coupons" subtitle="Create discount codes customers redeem at checkout." />

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {!stripeReady && (
        <Notice kind="err">
          No Stripe products are set up yet. Save a price on the Pricing page first, then create coupons here.
        </Notice>
      )}

      <p className="text-sm text-ink-3">
        Codes are entered in the &ldquo;Add promotion code&rdquo; field on the Stripe checkout page (already
        enabled). Scope a code to the <strong className="text-ink-2">monthly</strong> subscription, the{" "}
        <strong className="text-ink-2">setup fee</strong> only, or the whole order, because setup and monthly
        are billed as separate Stripe products. Stripe only allows one code per checkout, so codes can&rsquo;t
        be stacked.
      </p>
      <p className="-mt-4 text-sm text-ink-3">
        Need to combine <strong className="text-ink-2">free setup + a monthly discount</strong>? Use a{" "}
        <strong className="text-ink-2">Deal link</strong>: share it instead of a code and checkout skips the
        setup fee and auto-applies that code, no stacking needed.
      </p>

      <Panel title="New coupon">
        <CouponForm currency={currency} />
      </Panel>

      <Panel title="Existing coupons">
        <DataTable
          head={["Code", "Discount", "Applies to", "Duration", "Redeemed", "Expires", "Status", "Deal link", ""]}
          rows={rows}
          empty="No coupons yet. Create one above."
        />
      </Panel>
    </div>
  );
}
