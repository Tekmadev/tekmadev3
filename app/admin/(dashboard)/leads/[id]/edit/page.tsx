import Link from "next/link";
import { requireAdminCapability } from "@/lib/admin";
import { growNeeds } from "@/config/grow";
import { LEAD_MESSAGES, type Lead } from "@/lib/admin-api/leads";
import { loadLeadForEdit, loadProblem } from "@/lib/leads-web";
import { COPY, leadTitle } from "@/lib/leads-ui";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { RetryNotice } from "@/components/admin/leads/RetryNotice";
import { EditLeadForm } from "@/components/admin/leads/EditLeadForm";
import type { EditLeadValues } from "@/components/admin/leads/edit-lead-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit lead" };

/** The form starts from what the lead shows ("" for a detail it does not have). */
function valuesOf(lead: Lead): EditLeadValues {
  return {
    name: lead.name ?? "",
    business: lead.business ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    website: lead.website ?? "",
    need: lead.need ?? "",
    message: lead.message ?? "",
  };
}

/**
 * Edit a lead's details (leads.update, and the lead's own canEdit: owners and
 * managers any lead, staff the leads they found or own). Add lead's form,
 * filled in; the same rules and copy as PATCH /leads/:id. Saving opens the
 * lead, which says "Lead updated.". One column on a phone.
 */
export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  // Outside any try: it redirects a signed-out, paused or forbidden person by throwing.
  const admin = await requireAdminCapability("leads.update");
  const { id } = await params;
  const back = (
    <Link href={`/admin/leads/${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center text-sm text-ink-3 hover:text-ink">
      Back to the lead
    </Link>
  );

  let lead: Lead | null;
  try {
    lead = await loadLeadForEdit(admin, id);
  } catch (err) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          {back}
          <PageHeader title="Edit lead" />
        </div>
        <RetryNotice message={loadProblem(err, "lead edit")} />
      </div>
    );
  }

  if (!lead || !lead.canEdit) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          {lead ? back : <BackToList />}
          <PageHeader title="Edit lead" />
        </div>
        <div role="alert">
          <Notice kind="err">{lead ? LEAD_MESSAGES.editNotYours : COPY.notFound}</Notice>
        </div>
      </div>
    );
  }

  const needs = growNeeds.map((n) => ({ value: n.value, label: n.label }));
  return (
    <div className="flex flex-col gap-6">
      <div>
        {back}
        <PageHeader title="Edit lead" />
        {/* Not PageHeader's subtitle: a long email (a lead with no name) wraps here instead of pushing a phone's page sideways. */}
        <p className="mt-1 min-w-0 break-words text-sm text-ink-3">{leadTitle(lead)}</p>
      </div>
      <Panel title="Lead">
        <p className="-mt-1 mb-5 text-sm text-ink-3">A name or a business, and an email or a phone number.</p>
        <EditLeadForm leadId={lead.id} initial={valuesOf(lead)} needs={needs} />
      </Panel>
    </div>
  );
}

function BackToList() {
  return (
    <Link href="/admin/leads" className="inline-flex min-h-11 items-center text-sm text-ink-3 hover:text-ink">
      Back to leads
    </Link>
  );
}
