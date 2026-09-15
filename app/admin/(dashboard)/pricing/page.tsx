import { requireOwner } from "@/lib/admin";
import { getAllPlans, type PlanFull } from "@/lib/pricing-data";
import { getAllProducts, type ProductRow } from "@/lib/products-data";
import { getProductMeta } from "@/config/products";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { updatePlanAction, updateProductAction } from "./actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { kind: "ok" | "err"; text: string }> = {
  "1": { kind: "ok", text: "Saved. The site and Stripe are updated." },
  input: { kind: "err", text: "Enter valid, non-negative numbers." },
  notfound: { kind: "err", text: "Plan or product not found." },
  config: { kind: "err", text: "Supabase is not configured." },
  stripe: { kind: "err", text: "Saved to the site, but the Stripe sync failed. Check STRIPE_SECRET_KEY." },
  db: { kind: "err", text: "Could not save to the database." },
};

export default async function PricingAdmin({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  await requireOwner();
  const [plans, products] = await Promise.all([getAllPlans(), getAllProducts()]);
  const { ok, e } = await searchParams;
  const notice = ok ? NOTICES["1"] : e ? NOTICES[e] : null;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader title="Pricing" subtitle="Edit a price and save. The site updates instantly and Stripe stays in sync." />

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <p className="text-sm text-ink-3">
        Saving creates a new Stripe price and archives the old one (Stripe prices are immutable). Existing
        subscribers keep their current price; only new checkouts use the new amount.
      </p>

      <div className="flex flex-col gap-5">
        {plans.length === 0 && <Notice kind="err">No plans found. Check the Supabase env.</Notice>}
        {plans.map((plan) => (
          <PlanForm key={plan.id} plan={plan} />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-ink">Products</h2>
        <p className="text-sm text-ink-3">
          A one-time fee at checkout, where buyers can split it with Afterpay, Klarna, or Affirm, plus the monthly care
          plan they add in their portal afterwards (a card on file, first charge after the delay you set). Saving a new
          amount creates a new Stripe price and archives the old one. Existing care plans keep their current price.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {products.length === 0 && <Notice kind="err">No products found. Run the Webline migration.</Notice>}
        {products.map((product) => (
          <ProductForm key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

function ProductForm({ product }: { product: ProductRow }) {
  const meta = getProductMeta(product.id);
  const currency = (product.currency || "cad").toUpperCase();
  const care = meta?.care;
  const synced = Boolean(product.stripe_price_id) && (!care || Boolean(product.stripe_monthly_price_id));

  return (
    <Panel
      title={product.name}
      action={
        <span className={"text-xs " + (synced ? "text-ink-4" : "text-signal")}>
          {synced ? "Live in Stripe" : "Not yet in Stripe"}
        </span>
      }
    >
      {meta && <p className="mb-4 text-sm text-ink-3">{meta.tagline}</p>}
      <form action={updateProductAction}>
        <input type="hidden" name="product" value={product.id} />
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            One-time fee ({currency})
            <input
              name="amount"
              type="number"
              min="0"
              step="1"
              defaultValue={(product.amount ?? 0) / 100}
              className="rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            Compare-at price ({currency}, optional)
            <input
              name="compare_at"
              type="number"
              min="0"
              step="1"
              defaultValue={product.compare_at_amount != null ? product.compare_at_amount / 100 : ""}
              placeholder="Shown struck through"
              className="rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold"
            />
          </label>
        </div>
        {care && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="text-sm font-medium text-ink">{care.name}</p>
            <p className="mt-1 text-xs text-ink-4">Required with every {product.name}. Cancel anytime.</p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5 text-sm text-ink-2">
                Monthly ({currency})
                <input
                  name="monthly"
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue={product.monthly_amount != null ? product.monthly_amount / 100 : care.defaultMonthlyAmount / 100}
                  className="rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-ink-2">
                First charge after (days)
                <input
                  name="trial_days"
                  type="number"
                  min="1"
                  max="365"
                  step="1"
                  required
                  defaultValue={product.monthly_trial_days ?? care.defaultTrialDays}
                  className="rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold"
                />
              </label>
            </div>
          </div>
        )}
        <label className="mt-4 flex min-h-11 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="active" defaultChecked={product.active} className="h-4 w-4 accent-[var(--color-gold)]" />
          Purchasable (uncheck to pause sales; the page stays up with a Book a call button)
        </label>
        {meta && (
          <p className="mt-3 text-xs text-ink-4">
            Public page: <a href={meta.path} className="underline hover:text-ink">{meta.path}</a>
          </p>
        )}
        <button
          type="submit"
          className="mt-5 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
        >
          Save {product.name}
        </button>
      </form>
    </Panel>
  );
}

function PlanForm({ plan }: { plan: PlanFull }) {
  const currency = (plan.currency || "cad").toUpperCase();
  const synced = Boolean(plan.stripe_monthly_price_id);

  return (
    <Panel
      title={plan.name}
      action={
        <span className={"text-xs " + (synced ? "text-ink-4" : "text-signal")}>
          {synced ? "Live in Stripe" : "Not yet in Stripe"}
        </span>
      }
    >
      <form action={updatePlanAction}>
        <input type="hidden" name="tier" value={plan.id} />
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            Monthly ({currency})
            <input
              name="monthly"
              type="number"
              min="0"
              step="1"
              defaultValue={(plan.monthly_amount ?? 0) / 100}
              className="rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            Setup fee ({currency})
            <input
              name="setup"
              type="number"
              min="0"
              step="1"
              defaultValue={(plan.setup_amount ?? 0) / 100}
              className="rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold"
            />
          </label>
        </div>

        <button
          type="submit"
          className="mt-5 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
        >
          Save {plan.name}
        </button>
      </form>
    </Panel>
  );
}
