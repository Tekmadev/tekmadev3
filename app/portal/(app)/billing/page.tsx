import { ExternalLink } from "lucide-react";
import { getTierMeta } from "@/config/pricing";
import { getProductMeta } from "@/config/products";
import { requireClient } from "@/lib/portal-auth";
import { careIsSetUp, getCareSubscriptionForClient, getLatestSubscriptionForClient } from "@/lib/clients-data";
import { getLatestOrderForClient, paymentMethodLabel } from "@/lib/orders-data";
import { getPlan } from "@/lib/pricing-data";
import { getDisplayProduct } from "@/lib/products-data";
import { formatMoney } from "@/lib/money";
import { Badge, Notice, PageHeader, Panel, Row, fmtDate, humanize, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm } from "@/components/portal/PortalForm";
import { billingPortalAction, startCarePlanAction } from "../actions";

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

const ORDER_TONE: Record<string, Tone> = {
  paid: "ok",
  pending: "warn",
  failed: "signal",
  refunded: "muted",
  partially_refunded: "warn",
  disputed: "signal",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ care?: string }> }) {
  const [{ client, member }, params] = await Promise.all([requireClient(), searchParams]);
  const product = getProductMeta(client.plan_id);
  const tier = client.plan_id ? getTierMeta(client.plan_id) : undefined;
  const canManage = member.role === "owner" || member.role === "admin";

  const [sub, plan, order, care, display] = await Promise.all([
    product ? Promise.resolve(null) : getLatestSubscriptionForClient(client),
    !product && client.plan_id ? getPlan(client.plan_id) : Promise.resolve(null),
    product ? getLatestOrderForClient(client) : Promise.resolve(null),
    product?.care ? getCareSubscriptionForClient(client.id) : Promise.resolve(null),
    product?.care ? getDisplayProduct(product.id) : Promise.resolve(null),
  ]);
  const status = sub?.status ?? null;
  const careReady = careIsSetUp(care);
  const monthly = display?.monthly ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing"
        subtitle={
          product
            ? "Your purchase, your hosting and care plan, and where to update your card or download receipts."
            : "Your plan, your next charge, and where to update your card or download invoices."
        }
      />

      {params.care === "success" && (
        <Notice kind="ok">
          {careReady
            ? `${product?.care?.name ?? "Your plan"} is set up. Thank you.`
            : "Card added. Stripe is confirming it now, so give this page a minute and refresh."}
        </Notice>
      )}
      {params.care === "cancelled" && !careReady && (
        <Notice kind="err">No card was added. Your plan still needs setting up before your site can go live.</Notice>
      )}

      {product?.care && monthly && (
        <Panel
          title={product.care.name}
          action={
            care ? <Badge tone={SUB_TONE[care.status ?? ""] ?? "neutral"}>{care.status === "trialing" ? "Set up" : humanize(care.status)}</Badge> : <Badge tone="warn">Needs setup</Badge>
          }
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm text-ink-3">Hosting and maintenance for your {product.name} site.</p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                {product.care.includes.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="text-gold">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <dl className="divide-y divide-line">
              <Row label="Monthly">{formatMoney(monthly.amount, display?.currency ?? "CAD")} / month</Row>
              <Row label={care?.status === "trialing" || !careReady ? "First charge" : "Next renewal"}>
                {care?.current_period_end
                  ? fmtDate(care.current_period_end)
                  : `${monthly.trialDays} days after your purchase`}
              </Row>
              <Row label="Cancel">Anytime, from Manage billing</Row>
            </dl>
          </div>

          {!careReady && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-sm text-ink-2">
                Add a card to set it up. Nothing is charged today: your first charge lands {monthly.trialDays} days after your
                purchase. Your site goes live once this is done.
              </p>
              {canManage ? (
                <PortalForm action={startCarePlanAction} className="mt-4">
                  <SubmitButton className="w-full sm:w-auto" pendingLabel="Opening secure page">
                    Set up {product.care.name}
                    <ExternalLink className="h-4 w-4" />
                  </SubmitButton>
                </PortalForm>
              ) : (
                <p className="mt-3 text-sm text-ink-3">Ask your account owner to set this up.</p>
              )}
            </div>
          )}
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {product ? (
          <Panel title="Purchase" action={<Badge tone="gold">{product.name}</Badge>}>
            <dl className="divide-y divide-line">
              <Row label="Product">{product.name}</Row>
              <Row label="Paid">{order ? money(order.amount_total, order.currency) : "-"}</Row>
              <Row label="Date">{order?.paid_at ? fmtDate(order.paid_at) : order ? fmtDate(order.created_at) : "-"}</Row>
              <Row label="Paid with">{order ? paymentMethodLabel(order.payment_method_type) : "-"}</Row>
              <Row label="Status">
                {order ? <Badge tone={ORDER_TONE[order.status] ?? "neutral"}>{humanize(order.status)}</Badge> : <span className="text-ink-4">No order on file</span>}
              </Row>
              <Row label="Monthly">{product.care ? `${product.care.name}, see above` : "None. One-time purchase."}</Row>
            </dl>
            {order?.payment_method_type && order.payment_method_type !== "card" && (
              <p className="mt-4 text-xs text-ink-4">
                Your instalments are managed by {paymentMethodLabel(order.payment_method_type)}. Log in to their app to see your schedule.
              </p>
            )}
          </Panel>
        ) : (
          <Panel title="Plan" action={tier ? <Badge tone="gold">{tier.name}</Badge> : undefined}>
            <dl className="divide-y divide-line">
              <Row label="Plan">{tier?.name ?? humanize(client.plan_id) ?? "Custom"}</Row>
              <Row label="Monthly">{plan ? `${money(plan.monthly_amount, plan.currency)} / month` : "Custom"}</Row>
              <Row label="Status">
                {status ? <Badge tone={SUB_TONE[status] ?? "neutral"}>{humanize(status)}</Badge> : <span className="text-ink-4">No subscription on file</span>}
              </Row>
              <Row label={status === "trialing" ? "First monthly charge" : "Next renewal"}>{sub?.current_period_end ? fmtDate(sub.current_period_end) : "-"}</Row>
              <Row label="Guarantee">{client.guarantee_eligible ? `${client.guarantee_target} booked appointments in ${client.guarantee_window_days} days` : "Not included on this plan"}</Row>
            </dl>
            {status === "trialing" && (
              <p className="mt-4 text-xs text-ink-4">
                Your monthly starts about 30 days after setup, so the build happens on a month you are not paying for.
              </p>
            )}
          </Panel>
        )}

        <Panel
          title={product && !careReady ? "Receipts and invoices" : "Manage billing"}
          description={
            product && !careReady
              ? "Download your receipt and invoice, or update your billing details. Handled securely by Stripe."
              : "Update your card, cancel, change billing email, view and download invoices. Handled securely by Stripe."
          }
        >
          {canManage ? (
            <PortalForm action={billingPortalAction}>
              <SubmitButton className="w-full sm:w-auto" pendingLabel="Opening">
                {product && !careReady ? "Open receipts" : "Open billing portal"}
                <ExternalLink className="h-4 w-4" />
              </SubmitButton>
            </PortalForm>
          ) : (
            <p className="text-sm text-ink-3">Only account owners and admins can manage billing.</p>
          )}
          <p className="mt-4 text-sm text-ink-3">
            {product
              ? "Want booked appointments on autopilot next? The Convert and Grow systems plug straight into your Webline site. Ask us anytime."
              : "Cancel any month. No long-term contract. If the system stops booking, we stop billing."}
          </p>
        </Panel>
      </div>
    </div>
  );
}
