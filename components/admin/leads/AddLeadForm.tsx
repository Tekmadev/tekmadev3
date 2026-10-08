"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Notice } from "@/components/admin/ui";
import { Field } from "@/components/portal/ui";
import { fieldCls, fieldSelectCls } from "@/lib/leads-ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { addLeadAction } from "@/app/admin/(dashboard)/leads/actions";
import { INITIAL_ADD_LEAD_STATE } from "./add-lead-state";
import { useRevealRefusal } from "./use-reveal-refusal";

/**
 * The web admin's Add lead form, built for a phone in the field: one column,
 * 16px inputs (iPhone Safari does not zoom), the right keyboard per field and
 * a full-width submit. The same fields, copy and rules as the app's Add a lead
 * sheet. A failed try keeps everything typed, puts the server's message
 * under the field it is about and brings it into view. "They want a demo"
 * shows once the need is a website (Webline), for people who can request
 * one, and opens the demo request form for the new lead.
 */
export function AddLeadForm({
  idempotencyKey,
  needs,
  canDemo,
}: {
  idempotencyKey: string;
  needs: { value: string; label: string }[];
  canDemo: boolean;
}) {
  const [state, action] = useActionState(addLeadAction, INITIAL_ADD_LEAD_STATE);
  const v = state.values;
  // Which need is picked: "They want a demo" only shows for a website.
  const [need, setNeed] = useState(v.need);
  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useRevealRefusal(state.attempt, state.fields, formRef, noticeRef);
  const err = (field: string) =>
    state.fields[field] ? (
      <p id={`${field}-error`} className="text-sm text-signal">
        {state.fields[field]}
      </p>
    ) : null;
  const invalid = (field: string) => (state.fields[field] ? { "aria-invalid": true, "aria-describedby": `${field}-error` } : {});

  return (
    // The key remounts the fields after a failed try, so they show what was typed.
    <form key={state.attempt} ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

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
        <select id="need" name="need" defaultValue={v.need} onChange={(e) => setNeed(e.target.value)} className={fieldSelectCls} {...invalid("need")}>
          <option value="">Not sure yet</option>
          {needs.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
        {err("need")}
      </Field>
      {canDemo && need === "website" && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm text-ink-2">
          <input type="checkbox" name="wants_demo" defaultChecked={state.wantsDemo} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-gold)]" />
          <span>
            They want a demo
            <span className="block text-xs text-ink-4">After the lead is added, the demo request opens so you can add what they want to see.</span>
          </span>
        </label>
      )}
      <Field label="Note" htmlFor="message" help="What you know about them: where you found them, what they asked.">
        <textarea id="message" name="message" defaultValue={v.message} rows={4} maxLength={5000} className={fieldCls} {...invalid("message")} />
        {err("message")}
      </Field>

      <SubmitButton pendingLabel="Adding" className="w-full sm:w-auto sm:self-start">
        Add lead
      </SubmitButton>
    </form>
  );
}
