import { requireAdmin } from "@/lib/admin";
import { getLeads } from "@/lib/admin-data";
import { PageHeader, Panel, DataTable, fmtDateTime, txt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  await requireAdmin();
  const leads = await getLeads();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Leads" subtitle={`${leads.length} most recent bookings, tool submissions and portal sign-ups`} />

      <Panel title="All leads">
        <DataTable
          head={["When", "Type", "Name", "Email", "Phone", "Status", "Booking", "Source", "Campaign"]}
          rows={leads.map((r) => [
            fmtDateTime(r.created_at),
            r.source === "portal_signup" ? "Portal sign-up" : r.source === "cal_booking" ? "Booked call" : r.source === "lead_magnet" ? "Free tool" : txt(r.source),
            txt(r.name),
            txt(r.email),
            txt(r.phone),
            txt(r.status),
            fmtDateTime(r.booking_start),
            txt(r.utm_source),
            txt(r.utm_campaign),
          ])}
          empty="No leads yet. Booked calls, free tool submissions and portal sign-ups appear here."
        />
      </Panel>
    </div>
  );
}
