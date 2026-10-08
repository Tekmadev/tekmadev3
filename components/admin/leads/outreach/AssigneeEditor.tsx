"use client";

import { useState } from "react";
import { btnGhost, btnPrimary } from "@/components/portal/ui";
import { RetryNotice } from "@/components/admin/leads/RetryNotice";
import { cn } from "@/lib/cn";
import { COPY, leadTitle, type AssigneesResult, type Lead } from "@/lib/leads-ui";
import { setLeadAssigneeAction } from "@/app/admin/(dashboard)/leads/actions";
import { ActionAlert } from "./ActionAlert";
import { FieldError, RadioRow, footerCls } from "./editor-parts";
import { assigneeOptions } from "./outreach-logic";
import { useEditorSave } from "./use-lead-action";

/**
 * Who owns the lead (the app's "Assigned to" sheet, in place): "Nobody", then
 * the team as the server sends it, the signed-in person marked "You". A team
 * that failed to load shows the message and a Retry, never an empty list, and
 * no Save. The server checks that the person is on the team, and the role.
 */
export function AssigneeEditor({
  lead,
  myEmail,
  assignees,
  onSaved,
  onCancel,
}: {
  lead: Lead;
  myEmail: string;
  assignees: AssigneesResult | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const current = lead.assignedTo?.email ?? "";
  const [draft, setDraft] = useState(current);
  const { pending, pressed, failure, save, label } = useEditorSave(onSaved);

  if (!assignees || !assignees.ok) {
    return (
      <div className="flex flex-col gap-4">
        <RetryNotice compact message={assignees?.message ?? COPY.loadFailed} />
        <div className={footerCls}>
          <button type="button" className={btnGhost} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const options = assigneeOptions(assignees.items, lead.assignedTo, myEmail);
  const unchanged = draft === current;
  const fieldError = failure?.fields?.assignedTo ?? null;

  const submit = (button: "save" | "retry") => {
    if (unchanged) return;
    void save(button, () => setLeadAssigneeAction({ leadId: lead.id, assignedTo: draft || null }));
  };

  return (
    <div className="flex flex-col gap-4">
      <ActionAlert failure={failure} onRetry={() => submit("retry")} pending={pending} retrying={pressed === "retry"} />
      <fieldset className="min-w-0" aria-describedby={fieldError ? "outreach-assignee-error" : undefined}>
        <legend className="sr-only">Assigned to</legend>
        <p className="mb-1 break-words text-xs text-ink-4">{leadTitle(lead)}</p>
        <div className="flex flex-col">
          {options.map((o) => (
            <RadioRow
              key={o.value || "nobody"}
              name="outreach-assignee"
              value={o.value}
              label={o.label}
              hint={o.hint}
              checked={draft === o.value}
              disabled={pending}
              invalid={!!fieldError}
              onChange={setDraft}
            />
          ))}
        </div>
        <FieldError id="outreach-assignee-error" message={fieldError} />
      </fieldset>
      <div className={footerCls}>
        <button type="button" className={cn(btnPrimary, "w-full sm:w-auto")} disabled={pending || unchanged} onClick={() => submit("save")}>
          {label("save", "Save", "Saving")}
        </button>
        <button type="button" className={btnGhost} disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
