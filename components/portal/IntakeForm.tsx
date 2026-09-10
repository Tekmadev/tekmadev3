import { INTAKE_SECTIONS, type IntakeAnswers, type IntakeField } from "@/lib/intake-schema";
import { Field, inputCls, selectCls } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { PortalForm, type ActionResult } from "@/components/portal/PortalForm";

/**
 * Server-rendered intake form driven by the schema. Two submit buttons: save
 * a draft (no validation) or submit (browser-side required checks). Works with
 * no JavaScript and is comfortable to fill on a phone.
 */
export function IntakeForm({
  answers,
  action,
  readOnly = false,
}: {
  answers: IntakeAnswers;
  action: (formData: FormData) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  return (
    <PortalForm action={action} className="flex flex-col gap-8" messageAtBottom>
      {INTAKE_SECTIONS.map((section) => (
        <fieldset key={section.key} className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6" disabled={readOnly}>
          <legend className="px-1 text-base font-semibold text-ink">{section.title}</legend>
          <p className="mt-1 text-sm text-ink-3">{section.blurb}</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {section.fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" || f.type === "multiselect" ? "sm:col-span-2" : ""}>
                <FieldInput field={f} value={answers[f.key]} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <SubmitButton variant="secondary" name="intent" value="draft" pendingLabel="Saving" className="w-full sm:w-auto">
            Save draft
          </SubmitButton>
          <SubmitButton name="intent" value="submit" pendingLabel="Submitting" className="w-full sm:w-auto">
            Submit to Tekmadev
          </SubmitButton>
        </div>
      )}
    </PortalForm>
  );
}

function FieldInput({ field, value }: { field: IntakeField; value: unknown }) {
  const id = `f_${field.key}`;
  const str = value == null ? "" : Array.isArray(value) ? "" : String(value);

  if (field.type === "textarea") {
    return (
      <Field label={field.label} help={field.help} required={field.required} htmlFor={id}>
        <textarea id={id} name={field.key} defaultValue={str} required={field.required} rows={3} placeholder={field.placeholder} className={inputCls + " min-h-24"} />
      </Field>
    );
  }
  if (field.type === "select") {
    return (
      <Field label={field.label} help={field.help} required={field.required} htmlFor={id}>
        <select id={id} name={field.key} defaultValue={str} required={field.required} className={selectCls}>
          <option value="">Choose one</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (field.type === "multiselect") {
    const chosen = new Set(Array.isArray(value) ? (value as string[]) : []);
    return (
      <Field label={field.label} help={field.help} required={field.required}>
        <div className="grid gap-2 sm:grid-cols-2">
          {field.options?.map((o) => (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line-strong bg-bg-2 px-3 py-2 text-sm text-ink-2">
              <input type="checkbox" name={field.key} value={o.value} defaultChecked={chosen.has(o.value)} className="h-4 w-4 accent-[var(--color-gold)]" />
              {o.label}
            </label>
          ))}
        </div>
      </Field>
    );
  }
  const inputMode = field.type === "number" ? "decimal" : field.type === "tel" ? "tel" : field.type === "email" ? "email" : field.type === "url" ? "url" : "text";
  return (
    <Field label={field.label} help={field.help} required={field.required} htmlFor={id}>
      <input
        id={id}
        name={field.key}
        type={field.type === "number" ? "text" : field.type}
        inputMode={inputMode}
        defaultValue={str}
        required={field.required}
        placeholder={field.placeholder}
        autoComplete={field.type === "tel" ? "tel" : field.type === "email" ? "email" : field.type === "url" ? "url" : "off"}
        className={inputCls}
      />
    </Field>
  );
}
