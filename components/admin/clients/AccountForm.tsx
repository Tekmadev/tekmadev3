import { tierMeta } from "@/config/pricing";
import { productMeta } from "@/config/products";
import { CLIENT_STATUS_LABEL, type Client, type ClientStatus, type GuaranteeStatus } from "@/lib/clients-data";
import { Field, inputCls, selectCls } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { updateClientAction } from "@/app/admin/(dashboard)/clients/actions";

const STATUSES = Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[];
const GUARANTEE: GuaranteeStatus[] = ["not_started", "running", "met", "extended", "waived", "not_eligible"];

function dateInput(v: string | null): string {
  return v ? new Date(v).toISOString().slice(0, 10) : "";
}

export function AccountForm({ client }: { client: Client }) {
  return (
    <form action={updateClientAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="client_id" value={client.id} />
      <Field label="Business name" required>
        <input name="business_name" defaultValue={client.business_name} required className={inputCls} />
      </Field>
      <Field label="Legal name">
        <input name="legal_name" defaultValue={client.legal_name ?? ""} className={inputCls} />
      </Field>
      <Field label="Website">
        <input name="website_url" defaultValue={client.website_url ?? ""} className={inputCls} />
      </Field>
      <Field label="Primary email" required>
        <input name="primary_email" type="email" defaultValue={client.primary_email} required className={inputCls} />
      </Field>
      <Field label="Phone">
        <input name="primary_phone" defaultValue={client.primary_phone ?? ""} className={inputCls} />
      </Field>
      <Field label="Industry">
        <input name="industry" defaultValue={client.industry ?? ""} className={inputCls} />
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={client.status} className={selectCls}>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {CLIENT_STATUS_LABEL[st]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Plan">
        <select name="plan_id" defaultValue={client.plan_id ?? ""} className={selectCls}>
          <option value="">None</option>
          <optgroup label="Growth plans">
            {tierMeta.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="One-time products">
            {productMeta.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>
      <Field label="Timezone">
        <input name="timezone" defaultValue={client.timezone} className={inputCls} />
      </Field>
      <Field label="Assigned strategist" help="Shown to the client as their contact.">
        <input name="assigned_strategist" type="email" defaultValue={client.assigned_strategist ?? ""} className={inputCls} />
      </Field>
      <Field label="Live since">
        <input name="live_at" type="date" defaultValue={dateInput(client.live_at)} className={inputCls} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Service area" help="Defines what counts as in-area for the guarantee.">
          <textarea name="service_area" rows={2} defaultValue={client.service_area ?? ""} className={inputCls} />
        </Field>
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <p className="mb-3 text-xs uppercase tracking-wide text-ink-4">Guarantee terms</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="guarantee_eligible" defaultChecked={client.guarantee_eligible} className="h-4 w-4 accent-[var(--color-gold)]" />
            Eligible
          </label>
          <Field label="Target calls">
            <input name="guarantee_target" type="number" defaultValue={client.guarantee_target} className={inputCls} />
          </Field>
          <Field label="Window (days)">
            <input name="guarantee_window_days" type="number" defaultValue={client.guarantee_window_days} className={inputCls} />
          </Field>
          <Field label="Count rule">
            <select name="guarantee_count_rule" defaultValue={client.guarantee_count_rule} className={selectCls}>
              <option value="booked">On booking</option>
              <option value="showed">Only if showed</option>
            </select>
          </Field>
          <Field label="Guarantee status">
            <select name="guarantee_status" defaultValue={client.guarantee_status} className={selectCls}>
              {GUARANTEE.map((g) => (
                <option key={g} value={g}>
                  {g.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Clock started" help="Usually the go-live date.">
            <input name="guarantee_started_at" type="date" defaultValue={dateInput(client.guarantee_started_at)} className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Internal notes" help="Never shown to the client.">
          <textarea name="internal_notes" rows={3} defaultValue={client.internal_notes ?? ""} className={inputCls} />
        </Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <SubmitButton pendingLabel="Saving">Save account</SubmitButton>
      </div>
    </form>
  );
}
