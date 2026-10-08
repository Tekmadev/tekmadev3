import { randomUUID } from "node:crypto";
import Link from "next/link";
import { adminCan, requireAdminCapability } from "@/lib/admin";
import { growNeeds } from "@/config/grow";
import { PageHeader, Panel } from "@/components/admin/ui";
import { AddLeadForm } from "@/components/admin/leads/AddLeadForm";

export const dynamic = "force-dynamic";

/**
 * Add a lead by hand (staff, managers, owners: leads.create). Staff mostly
 * use this from an iPhone until the iPhone app ships, so it is one column on
 * a phone. One idempotency key per page load: a double tap or a retry after a
 * dropped connection adds the lead once. "They want a demo" (demos.request)
 * opens the demo request form for the new lead right after.
 */
export default async function NewLeadPage() {
  const ctx = await requireAdminCapability("leads.create");
  const needs = growNeeds.map((n) => ({ value: n.value, label: n.label }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/leads" className="inline-flex min-h-11 items-center text-sm text-ink-3 hover:text-ink">
          Back to leads
        </Link>
        <PageHeader title="Add a lead" subtitle="Someone you found or met" />
      </div>
      <Panel title="Lead">
        <p className="-mt-1 mb-5 text-sm text-ink-3">
          Source: Outreach. Assigned to you. A name or a business, and an email or a phone number.
        </p>
        <AddLeadForm idempotencyKey={randomUUID()} needs={needs} canDemo={adminCan(ctx, "demos.request")} />
      </Panel>
    </div>
  );
}
