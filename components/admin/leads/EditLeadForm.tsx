"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Notice } from "@/components/admin/ui";
import { Field, btnPrimary } from "@/components/portal/ui";
import { fieldCls, fieldSelectCls, leadDetailDiffers } from "@/lib/leads-ui";
import { PendingSubmit } from "@/components/PendingSubmit";
import { cn } from "@/lib/cn";
import { editLeadAction } from "@/app/admin/(dashboard)/leads/actions";
import { INITIAL_EDIT_LEAD_STATE, type EditLeadValues } from "./edit-lead-state";
import { useRevealRefusal } from "./use-reveal-refusal";

const DETAIL_KEYS: (keyof EditLeadValues)[] = ["name", "business", "email", "phone", "website", "need", "message"];

/** The details as the form holds them now. */
function formValues(form: HTMLFormElement): EditLeadValues {
  const data = new FormData(form);
  return Object.fromEntries(DETAIL_KEYS.map((key) => [key, String(data.get(key) ?? "")])) as EditLeadValues;
}

/**
 * The web admin's Edit lead form: Add lead's fields, labels, help and order
 * (AddLeadForm), filled in with the lead, for a phone in the field: one
 * column, 16px inputs (iPhone Safari does not zoom), the right keyboard per
 * field and a full-width save. What the form showed rides along hidden, so
 * only the fields the person changed are sent. Like the app, Save stays off
 * until a field differs from what the form showed. A failed try keeps
 * everything typed, puts the server's message under the field it is about
 * and brings it into view; until the save goes through the form counts as
 * unsaved (`data-unsaved`), so coming back to the home-screen app refreshes
 * it instead of reloading the typed changes away.
 */
export function EditLeadForm({ leadId, initial, needs }: { leadId: string; initial: EditLeadValues; needs: { value: string; label: string }[] }) {
  const [state, action] = useActionState(editLeadAction, INITIAL_EDIT_LEAD_STATE);
  const v = state.values ?? initial;
  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useRevealRefusal(state.attempt, state.fields, formRef, noticeRef);

  // What the fields hold now, for this try (the form remounts after each failed one with what was typed).
  const [typed, setTyped] = useState<{ attempt: number; values: EditLeadValues } | null>(null);
  // Also what the browser put in before the page came alive (typed early, or restored on Back).
  useEffect(() => {
    if (formRef.current) setTyped({ attempt: state.attempt, values: formValues(formRef.current) });
  }, [state.attempt]);
  const now = typed && typed.attempt === state.attempt ? typed.values : v;
  const changed = DETAIL_KEYS.some((key) => leadDetailDiffers(key, now[key], initial[key]));

  const err = (field: string) =>
    state.fields[field] ? (
      <p id={`${field}-error`} className="text-sm text-signal">
        {state.fields[field]}
      </p>
    ) : null;
  const invalid = (field: string) => (state.fields[field] ? { "aria-invalid": true, "aria-describedby": `${field}-error` } : {});

  return (
    // The key remounts the fields after a failed try, so they show what was typed.
    <form
      key={state.attempt}
      ref={formRef}
      action={action}
      onChange={(e) => setTyped({ attempt: state.attempt, values: formValues(e.currentTarget) })}
      data-unsaved={changed ? "true" : undefined}
      className="flex flex-col gap-5"
      noValidate
    >
      <input type="hidden" name="lead_id" value={leadId} />
      {DETAIL_KEYS.map((key) => (
        <input key={key} type="hidden" name={`was_${key}`} value={initial[key]} />
      ))}

      {state.message && (
        <div ref={noticeRef} role="alert">
          <Notice kind="err">
            <span>{state.message}</span>
            {state.duplicateEmail && (
              <>
                {" "}
                <Link href={`/admin/leads?q=${encodeURIComponent(state.duplicateEmail)}`} className="font-medium text-gold underline underline-offset-2">
                  Find it
                </Link>
              </>
            )}
          </Notice>
        </div>
      )}

      <Field label="Name" htmlFor="name">
        <input id="name" name="name" defaultValue={v.name} maxLength={120} autoCapitalize="words" autoComplete="off" className={fieldCls} {...invalid("name")} />
        {err("name")}
      </Field>
      <Field label="Business" htmlFor="business">
        <input id="business" name="business" defaultValue={v.business} maxLength={200} autoCapitalize="words" autoComplete="off" className={fieldCls} {...invalid("business")} />
        {err("business")}
      </Field>
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          defaultValue={v.email}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className={fieldCls}
          {...invalid("email")}
        />
        {err("email")}
      </Field>
      <Field label="Phone" htmlFor="phone">
        <input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={v.phone} autoComplete="off" className={fieldCls} {...invalid("phone")} />
        {err("phone")}
      </Field>
      <Field label="Website or profile" htmlFor="website" help="Their site, or a handle like instagram.com/name.">
        <input
          id="website"
          name="website"
          type="text"
          inputMode="url"
          defaultValue={v.website}
          maxLength={300}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className={fieldCls}
          {...invalid("website")}
        />
        {err("website")}
      </Field>
      <Field label="Need" htmlFor="need">
        <select id="need" name="need" defaultValue={v.need} className={fieldSelectCls} {...invalid("need")}>
          <option value="">Not sure yet</option>
          {needs.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
        {err("need")}
      </Field>
      <Field label="Note" htmlFor="message" help="What you know about them: where you found them, what they asked.">
        <textarea id="message" name="message" defaultValue={v.message} rows={4} maxLength={5000} className={fieldCls} {...invalid("message")} />
        {err("message")}
      </Field>

      <PendingSubmit disabled={!changed} pendingLabel="Saving" className={cn(btnPrimary, "w-full sm:w-auto sm:self-start")}>
        Save changes
      </PendingSubmit>
    </form>
  );
}
