import { requireAdmin } from "@/lib/admin";
import { getSubscriptions } from "@/lib/admin-data";
import { listOrders, paymentMethodLabel } from "@/lib/orders-data";
import { offerName } from "@/config/products";
import { PageHeader, Panel, DataTable, fmtDateTime, fmtMoney, txt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  await requireAdmin();
  const [subs, orders] = await Promise.all([getSubscriptions(), listOrders()]);
  const bnpl = orders.filter((o) => o.payment_method_type && o.payment_method_type !== "card" && o.payment_method_type !== "link").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Subscriptions and orders" subtitle={`${subs.length} subscriptions · ${orders.length} one-time orders${orders.length ? ` (${bnpl} paid in instalments)` : ""}`} />

      <Panel title="One-time orders">
        <DataTable
          head={["When", "Email", "Business", "Product", "Status", "Amount", "Paid with", "Source", "Campaign"]}
          rows={orders.map((o) => [
            fmtDateTime(o.created_at),
            txt(o.email),
            txt(o.business_name),
            offerName(o.product_id) ?? txt(o.product_id),
            txt(o.status),
            fmtMoney(o.amount_total, o.currency),
            paymentMethodLabel(o.payment_method_type),
            txt(o.utm_source),
            txt(o.utm_campaign),
          ])}
          empty="No one-time orders yet. Webline purchases appear here the moment Stripe confirms payment."
        />
      </Panel>

      <Panel title="All subscriptions">
        <DataTable
          head={["When", "Email", "Tier", "Status", "Amount", "Customer", "Source", "Campaign"]}
          rows={subs.map((r) => [
            fmtDateTime(r.created_at),
            txt(r.email),
            txt(r.tier),
            txt(r.status),
            fmtMoney(r.amount_total, r.currency),
            txt(r.stripe_customer_id),
            txt(r.utm_source),
            txt(r.utm_campaign),
          ])}
          empty="No subscriptions yet. They appear here once the Stripe webhook is connected."
        />
      </Panel>
    </div>
  );
}
