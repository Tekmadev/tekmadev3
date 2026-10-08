"use client";

import { useRef, useState } from "react";
import { Globe } from "lucide-react";
import { btnGhost, btnPrimary, btnSecondary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { defaultFollowUpLocal, followUpPresets, instantToTorontoLocal, leadTitle, torontoLocalToInstant, type Lead } from "@/lib/leads-ui";
import { setLeadFollowUpAction } from "@/app/admin/(dashboard)/leads/actions";
import { ActionAlert } from "./ActionAlert";
import { DateTimeField } from "./DateTimeField";
import { chipCls, chipKeyDown } from "./editor-parts";
import { TORONTO_NOTE, followUpChipDraft, followUpSummary, normalizeLocal } from "./outreach-logic";
import { useEditorSave } from "./use-lead-action";

/**
 * The line under the follow-up picker: "Pick a date and time." while the
 * field is empty or partial, the range error in red for a time already gone,
 * else the Toronto time it will be saved as. It never throws, whatever the
 * field holds (Clear empties it, and iOS can send a partial value).
 */
export function FollowUpSummary({ draft, openedAt }: { draft: string; openedAt: number }) {
  const summary = followUpSummary(draft, openedAt);
  const cut = summary.kind === "ok" ? summary.text.lastIndexOf(TORONTO_NOTE) : -1;
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
        summary.kind === "error" ? "border-signal/40 bg-signal/[0.06] text-signal" : "border-line bg-bg-2 text-ink-3",
      )}
    >
      {summary.kind === "ok" ? <Globe aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      {cut > 0 ? (
        <span className="min-w-0">
          <span className="font-medium tabular-nums text-ink">{summary.text.slice(0, cut)}</span>
          {summary.text.slice(cut)}
        </span>
      ) : (
        <span className="min-w-0">{summary.text}</span>
      )}
    </p>
  );
}

/**
 * The next follow-up (the app's follow-up sheet, in place): Tomorrow, In 3
 * days or Next week in one tap (the time stays what was picked), or any
 * Toronto date and time. "Clear" removes the planned one. The clock is read
 * once, when the editor opens. The server turns the Toronto time into an
 * instant and checks the role again.
 */
export function FollowUpEditor({ lead, onSaved, onCancel }: { lead: Lead; onSaved: (message: string) => void; onCancel: () => void }) {
  const [openedAt] = useState(() => Date.now());
  const [draft, setDraft] = useState(() => defaultFollowUpLocal(lead.followUpAt, openedAt));
  const { pending, pressed, failure, save, label } = useEditorSave(onSaved);
  const last = useRef<"save" | "clear">("save");

  const presets = followUpPresets(openedAt);
  const instant = torontoLocalToInstant(draft);
  const summary = followUpSummary(draft, openedAt);
  const current = lead.followUpAt ? instantToTorontoLocal(lead.followUpAt) : "";
  const unchanged = !!current && normalizeLocal(draft) === current;
  const canSave = !!instant && summary.kind === "ok" && !unchanged;
  const fieldError = failure?.fields?.followUpAt ?? null;
  const chosenPreset = presets.find((p) => draft.slice(0, 10) === p.date)?.date ?? null;

  const send = (which: "save" | "clear", button: string = which) => {
    if (which === "save" && !canSave) return;
    last.current = which;
    const followUpAt = which === "clear" ? null : normalizeLocal(draft);
    void save(button, () => setLeadFollowUpAction({ leadId: lead.id, followUpAt }));
  };

  const pick = (date: string) => setDraft((d) => followUpChipDraft(date, d));

  return (
    <div className="flex flex-col gap-4">
      <ActionAlert failure={failure} onRetry={() => send(last.current, "retry")} pending={pending} retrying={pressed === "retry"} />
      <p className="break-words text-xs text-ink-4">{leadTitle(lead)}</p>

      <div role="radiogroup" aria-label="Quick dates" className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = chosenPreset === p.date;
          const focusable = active || (chosenPreset === null && p === presets[0]);
          return (
            <button
              key={p.label}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={focusable ? 0 : -1}
              disabled={pending}
              className={chipCls(active)}
              onClick={() => pick(p.date)}
              onKeyDown={(e) =>
                chipKeyDown(
                  e,
                  presets.map((x) => x.date),
                  chosenPreset,
                  pick,
                )
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <DateTimeField
        id="outreach-follow-up-at"
        label="Date and time"
        value={draft}
        onChange={setDraft}
        min={`${instantToTorontoLocal(openedAt).slice(0, 10)}T00:00`}
        error={fieldError}
        disabled={pending}
      />

      <FollowUpSummary draft={draft} openedAt={openedAt} />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" className={cn(btnPrimary, "w-full sm:w-auto")} disabled={pending || !canSave} onClick={() => send("save")}>
          {label("save", "Save", "Saving")}
        </button>
        {lead.followUpAt ? (
          <button type="button" className={cn(btnSecondary, "w-full sm:w-auto")} disabled={pending} onClick={() => send("clear")}>
            {label("clear", "Clear", "Clearing")}
          </button>
        ) : null}
        <button type="button" className={btnGhost} disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
