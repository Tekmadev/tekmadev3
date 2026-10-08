"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { BlackHole } from "@/components/BlackHole";
import { Field, Notice, btnPrimary, btnSecondary, inputCls, selectCls } from "@/components/portal/ui";
import { DEMO_LIMITS } from "@/lib/admin-api/demos/limits";
import { manageDemoAction, type DemoFormState } from "@/app/admin/(dashboard)/demos/actions";
import { cn } from "@/lib/cn";

export type ManageMove = {
  /** The status this button moves the request to. */
  status: string;
  label: string;
  /** Ask first (cancelling). */
  confirm?: string;
};

/**
 * The builder's side of a demo request (owners and managers, `demos.manage`):
 * who is building it, the demo link, a note to the salesperson, and the
 * status buttons the request allows now (MANAGE_MOVES, worked out by the
 * page). A status button saves the link, builder and note with it, so "Mark
 * ready" with a fresh link is one step. The server checks every rule again
 * (lib/admin-api/demos, the same copy as PATCH /demos/:id).
 */
export function DemoManageForm({
  demoId,
  builderEmail,
  demoUrl,
  builderNote,
  team,
  moves,
}: {
  demoId: string;
  builderEmail: string | null;
  demoUrl: string | null;
  builderNote: string | null;
  team: { email: string; name: string | null }[];
  moves: ManageMove[];
}) {
  const [state, formAction, pending] = useActionState<DemoFormState, FormData>(manageDemoAction, null);
  const [sentBy, setSentBy] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) noticeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state]);

  const fields = state && !state.ok ? state.fields : undefined;
  const known = new Set(team.map((p) => p.email));
  const busy = (key: string) => pending && sentBy === key;
  const label = (key: string, text: string, pendingText: string) =>
    busy(key) ? (
      <span className="inline-flex items-center gap-1.5">
        <BlackHole />
        {pendingText}
      </span>
    ) : (
      text
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const move = moves.find((m) => submitter?.value === m.status && submitter?.name === "status");
        if (move?.confirm && !window.confirm(move.confirm)) return;
        const data = new FormData(e.currentTarget, submitter);
        setSentBy(submitter?.name === "status" ? submitter.value : "save");
        startTransition(() => formAction(data));
      }}
      className="grid gap-5 sm:grid-cols-2"
    >
      <input type="hidden" name="demo_id" value={demoId} />

      {state && (
        <div ref={noticeRef} role="status" aria-live="polite" className="sm:col-span-2">
          <Notice kind={state.ok ? "ok" : "err"}>{state.message}</Notice>
        </div>
      )}

      <Field label="Who is building it" htmlFor="demo-builder">
        <select id="demo-builder" name="builder_email" defaultValue={builderEmail ?? ""} className={selectCls}>
          <option value="">Nobody yet</option>
          {builderEmail && !known.has(builderEmail) && <option value={builderEmail}>{builderEmail} (not on the team)</option>}
          {team.map((p) => (
            <option key={p.email} value={p.email}>
              {p.name ? `${p.name} (${p.email})` : p.email}
            </option>
          ))}
        </select>
        {fields?.builderEmail && <p className="text-xs text-signal">{fields.builderEmail}</p>}
      </Field>
      <Field label="Demo link" htmlFor="demo-url" help="Usually the demo's Vercel link. Needed before it can be marked ready.">
        <input
          id="demo-url"
          name="demo_url"
          type="url"
          inputMode="url"
          placeholder="https://name.vercel.app"
          maxLength={DEMO_LIMITS.demoUrl}
          defaultValue={demoUrl ?? ""}
          className={inputCls}
          aria-invalid={fields?.demoUrl ? true : undefined}
        />
        {fields?.demoUrl && <p className="text-xs text-signal">{fields.demoUrl}</p>}
      </Field>
      <div className="sm:col-span-2">
        <Field label="Note to the salesperson" htmlFor="demo-note">
          <textarea
            id="demo-note"
            name="builder_note"
            maxLength={DEMO_LIMITS.builderNote}
            defaultValue={builderNote ?? ""}
            className={cn(inputCls, "min-h-20 resize-y")}
          />
          {fields?.builderNote && <p className="text-xs text-signal">{fields.builderNote}</p>}
        </Field>
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="submit" disabled={pending} aria-busy={busy("save") || undefined} className={btnSecondary}>
          {label("save", "Save", "Saving")}
        </button>
        {moves.map((m) => (
          <button
            key={m.status}
            type="submit"
            name="status"
            value={m.status}
            disabled={pending}
            aria-busy={busy(m.status) || undefined}
            className={m.status === "cancelled" ? btnSecondary : btnPrimary}
          >
            {label(m.status, m.label, "Saving")}
          </button>
        ))}
      </div>
    </form>
  );
}
