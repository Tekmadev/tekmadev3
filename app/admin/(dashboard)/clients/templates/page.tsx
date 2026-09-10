import Link from "next/link";
import { requireOwner } from "@/lib/admin";
import { listTemplates, STAGES, type OnboardingTaskTemplate } from "@/lib/onboarding-data";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { Badge, Field, inputCls, selectCls } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { deleteTemplateAction, saveTemplateAction } from "../actions";

export const dynamic = "force-dynamic";

const OWNERS = ["client", "tekmadev"];
const KINDS = ["form", "upload", "access_grant", "approval", "esign", "call", "internal", "checklist"];

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string; e?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const templates = await listTemplates();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Checklist templates"
        subtitle="The master onboarding checklist. New clients get every active task that matches their plan. Existing runs are not changed."
      >
        <Link href="/admin/clients" className="text-sm text-ink-3 hover:text-ink">
          Back to clients
        </Link>
      </PageHeader>

      {params.saved === "1" && <Notice kind="ok">Template saved.</Notice>}
      {params.deleted === "1" && <Notice kind="ok">Template deleted.</Notice>}
      {params.e === "required" && <Notice kind="err">Key and title are required.</Notice>}
      {params.e === "json" && <Notice kind="err">Payload must be valid JSON.</Notice>}

      <Panel title="Add a task">
        <TemplateForm />
      </Panel>

      {STAGES.filter((s) => s.key !== "complete").map((stage) => {
        const items = templates.filter((t) => t.stage === stage.key);
        if (items.length === 0) return null;
        return (
          <Panel key={stage.key} title={`${stage.label} (${items.length})`}>
            <div className="flex flex-col divide-y divide-line">
              {items.map((t) => (
                <details key={t.id} className="group py-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                    <span className={"text-sm font-medium " + (t.active ? "text-ink" : "text-ink-4 line-through")}>{t.title}</span>
                    <Badge tone={t.owner === "client" ? "gold" : "muted"}>{t.owner}</Badge>
                    <Badge tone="neutral">{t.kind}</Badge>
                    {t.plan_ids.length > 0 && <Badge tone="neutral">{t.plan_ids.join(", ")}</Badge>}
                    {!t.required && <Badge tone="muted">optional</Badge>}
                    <span className="ml-auto text-xs text-ink-4">{t.key}</span>
                  </summary>
                  <div className="mt-4">
                    <TemplateForm template={t} />
                  </div>
                </details>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function TemplateForm({ template }: { template?: OnboardingTaskTemplate }) {
  const t = template;
  return (
    <form action={saveTemplateAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Key" required help="Stable id, e.g. build.website">
        <input name="key" defaultValue={t?.key ?? ""} required readOnly={!!t} className={inputCls + (t ? " opacity-70" : "")} />
      </Field>
      <Field label="Title" required>
        <input name="title" defaultValue={t?.title ?? ""} required className={inputCls} />
      </Field>
      <Field label="Stage">
        <select name="stage" defaultValue={t?.stage ?? "build"} className={selectCls}>
          {STAGES.filter((s) => s.key !== "complete").map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Owner">
        <select name="owner" defaultValue={t?.owner ?? "tekmadev"} className={selectCls}>
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Kind">
        <select name="kind" defaultValue={t?.kind ?? "checklist"} className={selectCls}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Plans" help="Comma-separated tier ids. Empty = all.">
        <input name="plan_ids" defaultValue={t?.plan_ids.join(", ") ?? ""} placeholder="grow, lets-talk" className={inputCls} />
      </Field>
      <Field label="Due (days after start)">
        <input name="due_offset_days" type="number" defaultValue={t?.due_offset_days ?? ""} className={inputCls} />
      </Field>
      <Field label="Sort order">
        <input name="sort_order" type="number" defaultValue={t?.sort_order ?? 0} className={inputCls} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <Field label="Description" help="Shown to the client for client-owned tasks.">
          <textarea name="description" defaultValue={t?.description ?? ""} rows={2} className={inputCls} />
        </Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <Field label="Payload (JSON)" help='e.g. {"provider":"google_ads"} or {"approval_kind":"website"}'>
          <input name="payload" defaultValue={t ? JSON.stringify(t.payload) : ""} className={inputCls + " font-mono text-xs"} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-5 sm:col-span-2 lg:col-span-4">
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="required" defaultChecked={t?.required ?? true} className="h-4 w-4 accent-[var(--color-gold)]" />
          Required
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="active" defaultChecked={t?.active ?? true} className="h-4 w-4 accent-[var(--color-gold)]" />
          Active
        </label>
        <SubmitButton pendingLabel="Saving">{t ? "Save" : "Add task"}</SubmitButton>
      </div>
      {t && (
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" formAction={deleteTemplateAction} name="id" value={t.id} className="text-xs text-ink-4 hover:text-signal">
            Delete this template
          </button>
        </div>
      )}
    </form>
  );
}
