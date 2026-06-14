import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getAllPlans, type PlanFull } from "@/lib/pricing-data";
import { updatePlanAction } from "./actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { kind: "ok" | "err"; text: string }> = {
  "1": { kind: "ok", text: "Saved. The site and Stripe are updated." },
  input: { kind: "err", text: "Enter valid, non-negative numbers." },
  notfound: { kind: "err", text: "Plan not found." },
  config: { kind: "err", text: "Supabase is not configured." },
  stripe: { kind: "err", text: "Saved to the site, but the Stripe sync failed. Check STRIPE_SECRET_KEY." },
  db: { kind: "err", text: "Could not save to the database." },
};

export default async function PricingAdmin({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  await requireAdmin();
  const plans = await getAllPlans();
  const { ok, e } = await searchParams;
  const notice = ok ? NOTICES["1"] : e ? NOTICES[e] : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Pricing</h1>
        <Link href="/admin" className="text-sm text-ink-3 transition-colors hover:text-ink">
          ← Dashboard
        </Link>
      </div>
      <p className="mt-2 text-sm text-ink-3">
        Edit a price and save. The site updates instantly, and a new Stripe price is created (the old
        one is archived). Existing subscribers keep their current price.
      </p>

      {notice && (
        <div
          className={
            "mt-6 rounded-xl border px-4 py-3 text-sm " +
            (notice.kind === "ok"
              ? "border-gold/40 bg-gold/[0.08] text-ink"
              : "border-signal/40 bg-signal/[0.06] text-ink")
          }
        >
          {notice.text}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-5">
        {plans.length === 0 && (
          <p className="rounded-2xl border border-line-strong bg-surface p-6 text-sm text-ink-2">
            No plans found. Check the Supabase env.
          </p>
        )}
        {plans.map((plan) => (
          <PlanForm key={plan.id} plan={plan} />
        ))}
      </div>
    </main>
  );
}

function PlanForm({ plan }: { plan: PlanFull }) {
  const currency = (plan.currency || "cad").toUpperCase();
  const synced = Boolean(plan.stripe_monthly_price_id);

  return (
    <form
      action={updatePlanAction}
      className="rounded-2xl border border-line-strong bg-surface p-6"
    >
      <input type="hidden" name="tier" value={plan.id} />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{plan.name}</h2>
        <span className={"text-xs " + (synced ? "text-ink-4" : "text-signal")}>
          {synced ? "Live in Stripe" : "Not yet in Stripe"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
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
  );
}
