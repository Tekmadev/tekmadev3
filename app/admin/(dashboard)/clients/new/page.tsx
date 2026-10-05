import Link from "next/link";
import { adminCan, requireAdminCapability } from "@/lib/admin";
import { getLead, type Lead } from "@/lib/admin-api/leads";
import { webApiContext } from "@/lib/admin-web-context";
import { tierMeta } from "@/config/pricing";
import { productMeta } from "@/config/products";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { Field, btnGhost, btnPrimary, inputCls, selectCls } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { createClientAction } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = { required: "Business name and a valid email are required." };

/** A lead as it reads on screen: the business, else the person, else the email. */
const leadLabel = (lead: Lead) => lead.business || lead.name || lead.email || "this lead";

/**
 * Add a client by hand (`clients.create`: owners, managers and staff). With
 * `?leadId=` (the lead page's "Create client") it is filled in from the lead
 * and creates the client from it, by the same shared code as POST /clients
 * with `leadId` (needs `leads.convert`): the lead points at its new client and
 * the lead's finder and booker get the credit. Added directly, the person
 * adding it gets the credit. Nothing about money shows here: plans are names
 * only, and the client page hides billing from roles without it.
 */
export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ e?: string; leadId?: string }> }) {
  const ctx = await requireAdminCapability("clients.create");
  const { e, leadId: rawLeadId } = await searchParams;
  const leadId = rawLeadId?.trim() ?? "";

  let lead: Lead | null = null;
  let leadNote: string | null = null;
  if (leadId) {
    if (!adminCan(ctx, "leads.convert")) {
      leadNote = "Your role cannot create a client from a lead. You can still add the client on its own.";
    } else {
      try {
        lead = await getLead(webApiContext(ctx), leadId);
        if (!lead) leadNote = "That lead no longer exists. You can still add the client on its own.";
      } catch (err) {
        console.error("[clients] lead for a new client failed", err instanceof Error ? err.message : String(err));
        leadNote = "Could not load that lead just now. Reload to try again, or add the client on its own.";
      }
    }
  }

  // One lead, one client: a lead that already became a client opens it instead.
  if (lead?.convertedClientId) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Add client" subtitle={`From the lead ${leadLabel(lead)}`} />
        <Notice kind="ok">This lead is already a client.</Notice>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href={`/admin/clients/${lead.convertedClientId}`} className={btnPrimary}>
            Open client
          </Link>
          <Link href="/admin/clients" className={btnGhost}>
            Back to clients
          </Link>
        </div>
      </div>
    );
  }

  const error = e ? (ERRORS[e] ?? e) : null;
  const canDemo = adminCan(ctx, "demos.request");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Add client"
        subtitle={
          lead
            ? `From the lead ${leadLabel(lead)}. The lead's finder and booker get the credit.`
            : "For Let's Talk deals, outreach and anyone who did not pay through the site. Paid checkouts create accounts automatically."
        }
      />

      {error && (
        <div role="alert">
          <Notice kind="err">{error}</Notice>
        </div>
      )}
      {leadNote && <Notice kind="err">{leadNote}</Notice>}

      <Panel title="Account">
        <form action={createClientAction} className="grid gap-5 sm:grid-cols-2">
          {lead && <input type="hidden" name="lead_id" value={lead.id} />}
          <Field label="Business name" required htmlFor="business_name">
            <input
              id="business_name"
              name="business_name"
              required
              maxLength={200}
              autoComplete="organization"
              defaultValue={lead ? (lead.business ?? lead.name ?? "") : ""}
              className={inputCls}
            />
          </Field>
          <Field label="Owner email" required htmlFor="email" help="The portal invite goes here.">
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={200}
              defaultValue={lead?.email ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Owner name" htmlFor="name">
            <input id="name" name="name" maxLength={120} autoComplete="name" defaultValue={lead?.name ?? ""} className={inputCls} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <input id="phone" name="phone" type="tel" inputMode="tel" maxLength={40} autoComplete="tel" defaultValue={lead?.phone ?? ""} className={inputCls} />
          </Field>
          <Field label="Plan" htmlFor="plan_id" help="Drives which checklist tasks are created and whether the guarantee applies.">
            <select id="plan_id" name="plan_id" defaultValue="grow" className={selectCls}>
              <optgroup label="Growth plans">
                {tierMeta.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.guarantee ? " (guarantee)" : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="One-time products">
                {productMeta.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name} (one-time, website only)
                  </option>
                ))}
              </optgroup>
              <option value="">No plan yet</option>
            </select>
          </Field>
          <Field label="Assigned strategist" htmlFor="assigned_strategist" help="Email shown to the client as their contact. You by default.">
            <input
              id="assigned_strategist"
              name="assigned_strategist"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={200}
              defaultValue={ctx.email}
              className={inputCls}
            />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-2 sm:col-span-2">
            <input type="checkbox" name="send_invite" defaultChecked className="h-5 w-5 shrink-0 accent-[var(--color-gold)]" />
            Send the portal invite email now
          </label>
          {canDemo && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm text-ink-2 sm:col-span-2">
              <input type="checkbox" name="wants_demo" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-gold)]" />
              <span>
                Client wants a demo
                <span className="block text-xs text-ink-4">After the client is created, the demo request form opens for them.</span>
              </span>
            </label>
          )}
          {!lead && (
            <p className="text-xs text-ink-4 sm:col-span-2">You get the credit for a client you add here (finder and booker). Owners and managers can change it on the client page.</p>
          )}
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center">
            <SubmitButton pendingLabel="Creating" className="w-full sm:w-auto">
              Create client
            </SubmitButton>
            <Link href="/admin/clients" className={btnGhost}>
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
