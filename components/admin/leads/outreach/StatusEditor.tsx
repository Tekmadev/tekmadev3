"use client";

import { useState } from "react";
import { btnGhost, btnPrimary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { leadTitle, type Lead, type LeadStatus } from "@/lib/leads-ui";
import { setLeadStatusAction } from "@/app/admin/(dashboard)/leads/actions";
import { ActionAlert } from "./ActionAlert";
import { FieldError, RadioRow, footerCls } from "./editor-parts";
import { statusOptions } from "./outreach-logic";
import { useEditorSave } from "./use-lead-action";

/**
 * The lead's status (the app's status sheet, in place): every status in the
 * app's order. Booked can be picked for a call booked by phone, DM or email
 * (the server gives the booking credit to whoever saves it when nobody has
 * it); on a lead the booking calendar owns it cannot, and Cancelled never can.
 * The server checks the same rules and the role again.
 */
export function StatusEditor({ lead, onSaved, onCancel }: { lead: Lead; onSaved: (message: string) => void; onCancel: () => void }) {
  const options = statusOptions(lead);
  const [draft, setDraft] = useState<LeadStatus>(lead.status);
  const { pending, pressed, failure, save, label } = useEditorSave(onSaved);

  const chosen = options.find((o) => o.value === draft);
  const blocked = !chosen || chosen.disabled;
  const unchanged = draft === lead.status;
  const fieldError = failure?.fields?.status ?? null;

  const submit = (button: "save" | "retry") => {
    if (blocked || unchanged) return;
    void save(button, () => setLeadStatusAction({ leadId: lead.id, status: draft }));
  };

  return (
    <div className="flex flex-col gap-4">
      <ActionAlert failure={failure} onRetry={() => submit("retry")} pending={pending} retrying={pressed === "retry"} />
      {lead.bookingAt ? (
        <p className="text-xs text-ink-3">
          This lead booked a call. The booking calendar sets Booked or Cancelled again if the call is moved or cancelled.
        </p>
      ) : null}
      <fieldset className="min-w-0" aria-describedby={fieldError ? "outreach-status-error" : undefined}>
        <legend className="sr-only">Lead status</legend>
        <p className="mb-1 break-words text-xs text-ink-4">{leadTitle(lead)}</p>
        <div className="flex flex-col">
          {options.map((o) => (
            <RadioRow
              key={o.value}
              name="outreach-status"
              value={o.value}
              label={o.label}
              hint={o.hint}
              checked={draft === o.value}
              disabled={o.disabled || pending}
              dimmed={o.disabled}
              invalid={!!fieldError}
              onChange={(v) => setDraft(v as LeadStatus)}
            />
          ))}
        </div>
        <FieldError id="outreach-status-error" message={fieldError} />
      </fieldset>
      <div className={footerCls}>
        <button type="button" className={cn(btnPrimary, "w-full sm:w-auto")} disabled={pending || unchanged || blocked} onClick={() => submit("save")}>
          {label("save", "Save status", "Saving")}
        </button>
        <button type="button" className={btnGhost} disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
