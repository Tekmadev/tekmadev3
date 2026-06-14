import { requireOwner } from "@/lib/admin";
import { getAllPlans, type PlanFull } from "@/lib/pricing-data";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
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
  await requireOwner();
  const plans = await getAllPlans();
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
    </div>
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
