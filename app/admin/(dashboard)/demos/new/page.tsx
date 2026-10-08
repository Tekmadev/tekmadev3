import Link from "next/link";
import { randomUUID } from "node:crypto";
import { adminCan, requireAdminCapability } from "@/lib/admin";
import { demoTargetFor } from "@/lib/demos-admin";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { DemoRequestForm, EMPTY_DEMO_FORM } from "@/components/admin/demos/DemoRequestForm";

export const dynamic = "force-dynamic";

/**
 * "Request a demo" for a client (?clientId=) or a lead (?leadId=), with the
 * business name filled in from them (or from ?businessName= and ?area=, which
 * the New client page and the client and lead cards pass). The same rules
 * and copy as POST /demos. New client (?created=1) and Add lead (?added=1)
 * land here when the person ticked that they want a demo. People who build
 * demos (demos.manage) also get "Already built? Demo link": with a link the
 * request is saved ready to show.
 */
export default async function NewDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; leadId?: string; businessName?: string; area?: string; created?: string; invite?: string; reused?: string; added?: string }>;
}) {
  const ctx = await requireAdminCapability("demos.request");
  const sp = await searchParams;
  const target = await demoTargetFor(ctx, { clientId: sp.clientId, leadId: sp.leadId });
  const clip = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Request a demo"
        subtitle={
          target
            ? `For ${target.kind === "client" ? "the client" : "the lead"} ${target.label}. Whoever builds it gets everything below.`
            : "A demo website for a client or a lead."
        }
      />

      {sp.created === "1" && (
        <Notice kind="ok">
          {sp.reused === "1" ? "That email is already a client, so the demo is for them." : "Client created."}
          {sp.invite === "failed" ? " The invite email failed: use Resend invite under Team on the client page." : ""} Now tell the builder about the
          demo.
        </Notice>
      )}

      {sp.added === "1" && target?.kind === "lead" && <Notice kind="ok">Lead added. Now tell the builder about the demo.</Notice>}

      {target ? (
        <Panel title="The business">
          <DemoRequestForm
            mode="create"
            clientId={target.kind === "client" ? target.id : undefined}
            leadId={target.kind === "lead" ? target.id : undefined}
            idempotencyKey={randomUUID()}
            canAddLink={adminCan(ctx, "demos.manage")}
            initial={{
              ...EMPTY_DEMO_FORM,
              businessName: clip(sp.businessName, 120) || target.businessName,
              area: clip(sp.area, 120) || target.area,
            }}
          />
        </Panel>
      ) : (
        <Notice kind="err">
          Pick the client or lead this demo is for. Open them from{" "}
          <Link href="/admin/clients" className="font-medium text-gold hover:underline">
            Clients
          </Link>{" "}
          or{" "}
          <Link href="/admin/leads" className="font-medium text-gold hover:underline">
            Leads
          </Link>{" "}
          and use Request a demo there.
        </Notice>
      )}

      <p className="flex flex-wrap items-center gap-x-4 text-xs text-ink-4">
        <Link href="/admin/demos" className="inline-flex min-h-11 items-center hover:text-ink">
          Back to demos
        </Link>
        {target?.kind === "client" && (
          <Link href={`/admin/clients/${target.id}`} className="inline-flex min-h-11 items-center hover:text-ink">
            Back to the client
          </Link>
        )}
        {target?.kind === "lead" && (
          <Link href={`/admin/leads/${target.id}`} className="inline-flex min-h-11 items-center hover:text-ink">
            Back to the lead
          </Link>
        )}
      </p>
    </div>
  );
}
