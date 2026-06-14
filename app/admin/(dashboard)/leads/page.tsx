import { requireAdmin } from "@/lib/admin";
import { getLeads } from "@/lib/admin-data";
import { PageHeader, Panel, DataTable, fmtDateTime, txt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  await requireAdmin();
  const leads = await getLeads();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Leads" subtitle={`${leads.length} most recent bookings and leads`} />

      <Panel title="All leads">
        <DataTable
          head={["When", "Name", "Email", "Phone", "Status", "Booking", "Source", "Campaign"]}
          rows={leads.map((r) => [
            fmtDateTime(r.created_at),
            txt(r.name),
            txt(r.email),
            txt(r.phone),
            txt(r.status),
            fmtDateTime(r.booking_start),
            txt(r.utm_source),
            txt(r.utm_campaign),
          ])}
          empty="No leads yet. They appear here once the Cal.com webhook is connected."
        />
      </Panel>
    </div>
  );
}
