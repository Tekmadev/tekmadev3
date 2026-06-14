import { requireAdmin } from "@/lib/admin";
import { getSubscriptions } from "@/lib/admin-data";
import { PageHeader, Panel, DataTable, fmtDateTime, fmtMoney, txt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  await requireAdmin();
  const subs = await getSubscriptions();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Subscriptions" subtitle={`${subs.length} most recent subscriptions`} />

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
