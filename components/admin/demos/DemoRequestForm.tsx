"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { BlackHole } from "@/components/BlackHole";
import { Field, Notice, btnPrimary, inputCls } from "@/components/portal/ui";
import { DEMO_LIMITS } from "@/lib/admin-api/demos/limits";
import { createDemoAction, editDemoAction, type DemoFormState } from "@/app/admin/(dashboard)/demos/actions";
import { cn } from "@/lib/cn";

export type DemoFormValues = {
  businessName: string;
  businessType: string;
  area: string;
  offer: string;
  website: string;
  brand: string;
  customers: string;
  wants: string;
  neededBy: string;
};

export const EMPTY_DEMO_FORM: DemoFormValues = {
  businessName: "",
  businessType: "",
  area: "",
  offer: "",
  website: "",
  brand: "",
  customers: "",
  wants: "",
  neededBy: "",
};

const textareaCls = cn(inputCls, "min-h-24 resize-y");

/** The inline error under a field, by the API's field key. */
function FieldError({ fields, name }: { fields?: Record<string, string>; name: string }) {
  const message = fields?.[name];
  return message ? (
    <p id={`demo-${name}-error`} className="text-xs text-signal">
      {message}
    </p>
  ) : null;
}

/**
 * The demo request form: new (for a client or a lead) or editing the details
 * of one. The server checks every field again with the admin API's rules and
 * copy (lib/admin-api/demos/input.ts) and answers the same field errors.
 * A new request offers "Already built? Demo link" to people who build demos
 * (`canAddLink`, demos.manage): with a link it is saved ready to show, and
 * the button says "Save as ready to show" (the app's words).
 *
 * Sent with startTransition instead of `<form action>`, so a refused save
 * keeps everything typed (React resets a form after its action).
 */
export function DemoRequestForm({
  mode,
  initial,
  clientId,
  leadId,
  demoId,
  idempotencyKey,
  canAddLink = false,
}: {
  mode: "create" | "edit";
  initial: DemoFormValues;
  clientId?: string;
  leadId?: string;
  demoId?: string;
  /** One per form load: a double submit or a retry makes one request. */
  idempotencyKey?: string;
  /** New requests only: "Already built? Demo link" (demos.manage; the server checks it again). */
  canAddLink?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DemoFormState, FormData>(mode === "create" ? createDemoAction : editDemoAction, null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // The demo link as typed: with one, the request is saved ready to show, not sent to the builders.
  const [demoUrl, setDemoUrl] = useState("");
  const withLink = mode === "create" && canAddLink && demoUrl.trim() !== "";
  useEffect(() => {
    if (state) noticeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state]);

  const fields = state && !state.ok ? state.fields : undefined;
  const invalid = (name: string) =>
    fields?.[name] ? { "aria-invalid": true as const, "aria-describedby": `demo-${name}-error` } : {};

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="grid gap-5 sm:grid-cols-2"
    >
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      {leadId && <input type="hidden" name="lead_id" value={leadId} />}
      {demoId && <input type="hidden" name="demo_id" value={demoId} />}
      {idempotencyKey && <input type="hidden" name="idempotency_key" value={idempotencyKey} />}

      {state && (
        <div ref={noticeRef} role="status" aria-live="polite" className="sm:col-span-2">
          <Notice kind={state.ok ? "ok" : "err"}>{state.message}</Notice>
        </div>
      )}

      <Field label="Business name" required htmlFor="demo-business-name">
        <input
          id="demo-business-name"
          name="business_name"
          required
          maxLength={DEMO_LIMITS.businessName}
          defaultValue={initial.businessName}
          className={inputCls}
          {...invalid("businessName")}
        />
        <FieldError fields={fields} name="businessName" />
      </Field>
      <Field label="Kind of business" required htmlFor="demo-business-type" help="Plumber, hair salon, bakery.">
        <input
          id="demo-business-type"
          name="business_type"
          required
          maxLength={DEMO_LIMITS.businessType}
          defaultValue={initial.businessType}
          className={inputCls}
          {...invalid("businessType")}
        />
        <FieldError fields={fields} name="businessType" />
      </Field>
      <Field label="City or area they serve" required htmlFor="demo-area">
        <input id="demo-area" name="area" required maxLength={DEMO_LIMITS.area} defaultValue={initial.area} className={inputCls} {...invalid("area")} />
        <FieldError fields={fields} name="area" />
      </Field>
      <Field label="Needed by" htmlFor="demo-needed-by" help="When the salesperson wants to show it.">
        {/* iPhone Safari draws an empty date input with no height and its own width: keep it a full-size field. */}
        <input
          id="demo-needed-by"
          name="needed_by"
          type="date"
          defaultValue={initial.neededBy}
          className={cn(inputCls, "min-h-12 min-w-0 appearance-none text-left")}
          {...invalid("neededBy")}
        />
        <FieldError fields={fields} name="neededBy" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="What they sell or do" required htmlFor="demo-offer">
          <textarea
            id="demo-offer"
            name="offer"
            required
            maxLength={DEMO_LIMITS.offer}
            defaultValue={initial.offer}
            className={textareaCls}
            {...invalid("offer")}
          />
          <FieldError fields={fields} name="offer" />
        </Field>
      </div>
      <Field label="Current website or social links" htmlFor="demo-website">
        <textarea
          id="demo-website"
          name="website"
          maxLength={DEMO_LIMITS.website}
          defaultValue={initial.website}
          className={textareaCls}
          {...invalid("website")}
        />
        <FieldError fields={fields} name="website" />
      </Field>
      <Field label="Logo and brand colours" htmlFor="demo-brand">
        <textarea id="demo-brand" name="brand" maxLength={DEMO_LIMITS.brand} defaultValue={initial.brand} className={textareaCls} {...invalid("brand")} />
        <FieldError fields={fields} name="brand" />
      </Field>
      <Field label="Who their customers are" htmlFor="demo-customers">
        <textarea
          id="demo-customers"
          name="customers"
          maxLength={DEMO_LIMITS.customers}
          defaultValue={initial.customers}
          className={textareaCls}
          {...invalid("customers")}
        />
        <FieldError fields={fields} name="customers" />
      </Field>
      <Field label="What they want to see in the demo" htmlFor="demo-wants">
        <textarea id="demo-wants" name="wants" maxLength={DEMO_LIMITS.wants} defaultValue={initial.wants} className={textareaCls} {...invalid("wants")} />
        <FieldError fields={fields} name="wants" />
      </Field>
      {mode === "create" && canAddLink && (
        <div className="sm:col-span-2">
          <Field label="Already built? Demo link" htmlFor="demo-url" help="Paste the link and it is saved as ready to show.">
            {/* Text, not url: the browser would block a bad link with its own words instead of the server's. */}
            <input
              id="demo-url"
              name="demo_url"
              type="text"
              inputMode="url"
              placeholder="https://name.vercel.app"
              maxLength={DEMO_LIMITS.demoUrl}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setDemoUrl(e.target.value)}
              className={inputCls}
              {...invalid("demoUrl")}
            />
            <FieldError fields={fields} name="demoUrl" />
          </Field>
        </div>
      )}

      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={cn(btnPrimary, "w-full sm:w-auto")}>
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <BlackHole />
              {mode === "create" && !withLink ? "Sending" : "Saving"}
            </span>
          ) : withLink ? (
            "Save as ready to show"
          ) : mode === "create" ? (
            "Request a demo"
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </form>
  );
}
