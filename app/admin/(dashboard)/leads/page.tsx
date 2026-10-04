import { requireAdminCapability } from "@/lib/admin";
import { getLeads } from "@/lib/admin-data";
import { GROW_LEAD_SOURCE, GROW_PATH, needLabel, revenueBandLabel } from "@/config/grow";
import { PageHeader, Panel, DataTable, Badge, fmtDateTime, txt } from "@/components/admin/ui";
import { leadCreditPeople } from "@/lib/staff-admin";
import { teamMembers } from "@/lib/staff-credit";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  portal_signup: "Portal sign-up",
  cal_booking: "Booked call",
  lead_magnet: "Free tool",
  outreach: "Outreach",
  [GROW_LEAD_SOURCE]: "Lead form",
};

function websiteHref(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const url = /^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`;
  try {
    return new URL(url).protocol.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

export default async function LeadsPage() {
  await requireAdminCapability("leads.view");
  const leads = await getLeads();
  const formLeads = leads.filter((r) => r.source === GROW_LEAD_SOURCE);
  // Commission credit on each lead (docs/admin-api/staff.md section 3): who found it, who booked it.
  const [credit, names] = await Promise.all([
    leadCreditPeople(leads.map((r) => String(r.id ?? ""))),
    teamMembers().catch(() => new Map<string, string | null>()),
  ]);
  const person = (email: string | null | undefined) =>
    email ? (
      <span title={email} className="whitespace-nowrap">
        {names.get(email) || email}
      </span>
    ) : (
      "-"
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} most recent lead forms, bookings, tool submissions and portal sign-ups`}
      />

      <Panel title={`Lead forms (${formLeads.length})`}>
        <p className="-mt-1 mb-4 text-sm text-ink-3">
          From {GROW_PATH}. They asked to talk: call the new ones first. A lead who booked from the welcome page shows
          as booked here, with the call time.
        </p>
        <DataTable
          head={["When", "Name", "Business", "Needs", "Revenue", "Phone", "Email", "Status", "Call", "Booked by", "Source", "Note"]}
          rows={formLeads.map((r) => {
            const href = websiteHref(r.website);
            return [
              fmtDateTime(r.created_at),
              txt(r.name),
              <span key="b" className="flex flex-col">
                <span>{txt(r.business_name)}</span>
                {href && (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:underline">
                    {String(r.website)}
                  </a>
                )}
              </span>,
              needLabel(r.need as string) ?? txt(r.need),
              revenueBandLabel(r.revenue_band as string) ?? txt(r.revenue_band),
              typeof r.phone === "string" ? (
                <a key="p" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap hover:text-gold">
                  {r.phone}
                </a>
              ) : (
                "-"
              ),
              txt(r.email),
              <Badge key="s" tone={r.status === "new" ? "gold" : r.status === "booked" ? "ok" : "muted"}>
                {txt(r.status)}
              </Badge>,
              fmtDateTime(r.booking_start),
              person(credit.get(String(r.id))?.bookedBy),
              [txt(r.utm_source), r.utm_campaign ? txt(r.utm_campaign) : null].filter((v) => v && v !== "-").join(" / ") || "-",
              <span key="m" className="block max-w-xs whitespace-pre-wrap text-ink-3">
                {txt(r.message)}
              </span>,
            ];
          })}
          empty={`No lead forms yet. Share ${GROW_PATH} in an ad, your bio or a DM.`}
        />
      </Panel>

      <Panel title="All leads">
        <DataTable
          head={["When", "Type", "Name", "Email", "Phone", "Status", "Booking", "Found by", "Booked by", "Source", "Campaign"]}
          rows={leads.map((r) => [
            fmtDateTime(r.created_at),
            TYPE_LABELS[String(r.source)] ?? txt(r.source),
            txt(r.name),
            txt(r.email),
            txt(r.phone),
            txt(r.status),
            fmtDateTime(r.booking_start),
            person(credit.get(String(r.id))?.foundBy),
            person(credit.get(String(r.id))?.bookedBy),
            txt(r.utm_source),
            txt(r.utm_campaign),
          ])}
          empty="No leads yet. Lead forms, booked calls, free tool submissions and portal sign-ups appear here."
        />
      </Panel>
    </div>
  );
}
