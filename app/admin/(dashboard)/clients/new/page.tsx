import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { tierMeta } from "@/config/pricing";
import { productMeta } from "@/config/products";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { Field, inputCls, selectCls } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { createClientAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdmin();
  const { e } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Add client" subtitle="For Let's Talk deals and anyone who did not pay through the site. Paid checkouts create accounts automatically." />

      {e === "required" && <Notice kind="err">Business name and a valid email are required.</Notice>}

      <Panel title="Account">
        <form action={createClientAction} className="grid gap-5 sm:grid-cols-2">
          <Field label="Business name" required htmlFor="business_name">
            <input id="business_name" name="business_name" required className={inputCls} />
          </Field>
          <Field label="Owner email" required htmlFor="email" help="The portal invite goes here.">
            <input id="email" name="email" type="email" required className={inputCls} />
          </Field>
          <Field label="Owner name" htmlFor="name">
            <input id="name" name="name" className={inputCls} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <input id="phone" name="phone" type="tel" className={inputCls} />
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
          <Field label="Assigned strategist" htmlFor="assigned_strategist" help="Email shown to the client as their contact.">
            <input id="assigned_strategist" name="assigned_strategist" type="email" className={inputCls} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink-2 sm:col-span-2">
            <input type="checkbox" name="send_invite" defaultChecked className="h-4 w-4 accent-[var(--color-gold)]" />
            Send the portal invite email now
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center">
            <SubmitButton pendingLabel="Creating">Create client</SubmitButton>
            <Link href="/admin/clients" className="text-sm text-ink-3 hover:text-ink sm:ml-3">
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
