import { ExternalLink } from "lucide-react";
import { getTierMeta } from "@/config/pricing";
import { requireClient } from "@/lib/portal-auth";
import { getLatestSubscriptionForClient } from "@/lib/clients-data";
import { getPlan } from "@/lib/pricing-data";
import { Badge, PageHeader, Panel, Row, fmtDate, humanize, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm } from "@/components/portal/PortalForm";
import { billingPortalAction } from "../actions";

export const dynamic = "force-dynamic";

function money(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents == null) return "-";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: (currency || "cad").toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
}

const SUB_TONE: Record<string, Tone> = {
  active: "ok",
  trialing: "gold",
  past_due: "warn",
  unpaid: "signal",
  canceled: "muted",
  cancelled: "muted",
  incomplete: "warn",
  paused: "muted",
};

export default async function BillingPage() {
  const { client, member } = await requireClient();
  const [sub, plan] = await Promise.all([getLatestSubscriptionForClient(client), client.plan_id ? getPlan(client.plan_id) : Promise.resolve(null)]);
  const tier = client.plan_id ? getTierMeta(client.plan_id) : undefined;
  const canManage = member.role === "owner" || member.role === "admin";
  const status = sub?.status ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Billing" subtitle="Your plan, your next charge, and where to update your card or download invoices." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Plan" action={tier ? <Badge tone="gold">{tier.name}</Badge> : undefined}>
          <dl className="divide-y divide-line">
            <Row label="Plan">{tier?.name ?? humanize(client.plan_id) ?? "Custom"}</Row>
            <Row label="Monthly">{plan ? `${money(plan.monthly_amount, plan.currency)} / month` : "Custom"}</Row>
            <Row label="Status">
              {status ? <Badge tone={SUB_TONE[status] ?? "neutral"}>{humanize(status)}</Badge> : <span className="text-ink-4">No subscription on file</span>}
            </Row>
            <Row label={status === "trialing" ? "First monthly charge" : "Next renewal"}>{sub?.current_period_end ? fmtDate(sub.current_period_end) : "-"}</Row>
            <Row label="Guarantee">{client.guarantee_eligible ? `${client.guarantee_target} booked calls in ${client.guarantee_window_days} days` : "Not included on this plan"}</Row>
          </dl>
          {status === "trialing" && (
            <p className="mt-4 text-xs text-ink-4">
              Your monthly starts about 30 days after setup, so the build happens on a month you are not paying for.
            </p>
          )}
        </Panel>

        <Panel title="Manage billing" description="Update your card, change billing email, view and download invoices. Handled securely by Stripe.">
          {canManage ? (
            <PortalForm action={billingPortalAction}>
              <SubmitButton className="w-full sm:w-auto" pendingLabel="Opening">
                Open billing portal
                <ExternalLink className="h-4 w-4" />
              </SubmitButton>
            </PortalForm>
          ) : (
            <p className="text-sm text-ink-3">Only account owners and admins can manage billing.</p>
          )}
          <p className="mt-4 text-sm text-ink-3">
            Cancel any month. No long-term contract. If the system stops booking, we stop billing.
          </p>
        </Panel>
      </div>
    </div>
  );
}
