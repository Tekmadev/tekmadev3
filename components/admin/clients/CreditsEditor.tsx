"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { BlackHole } from "@/components/BlackHole";
import { Notice, btnPrimary, btnSecondary, inputCls, selectCls } from "@/components/portal/ui";
import { CREDIT_ROLES, CREDIT_ROLE_HELP, CREDIT_ROLE_LABELS, type CreditRole } from "@/lib/staff-constants";
import { saveClientCreditsAction, type CreditsFormState } from "@/app/admin/(dashboard)/clients/credit-actions";
import { cn } from "@/lib/cn";

export type EditorCredit = { email: string; role: CreditRole; share: number };
export type EditorPerson = { email: string; name: string | null };

type Row = { key: number; email: string; role: CreditRole; share: string };

const MAX_ROWS = 20;
const NOTE_MAX = 500;

/** Row keys for React only (never rendered into the HTML). */
let rowSeq = 0;
const newKey = () => ++rowSeq;
const toRows = (list: EditorCredit[]): Row[] => list.map((c) => ({ key: newKey(), email: c.email, role: c.role, share: String(c.share) }));

/** Two decimals at most: 33.333 -> 33.33. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Edits a client's credits (owners and managers, `clients.credits.edit`):
 * people from the team, a role each, shares adding up to exactly 100 (or no
 * rows: nobody gets credit), and a note saying why. The server checks every
 * rule again (saveClientCreditsAction, the same copy as the admin API).
 *
 * Sent with startTransition instead of `<form action>`, so a refused save
 * keeps everything typed (React resets a form after its action).
 */
export function CreditsEditor({
  clientId,
  initial,
  team,
  suggestion,
}: {
  clientId: string;
  initial: EditorCredit[];
  team: EditorPerson[];
  /** The lead's finder and booker with the default split, offered when the client has no credits. */
  suggestion: EditorCredit[];
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<CreditsFormState, FormData>(saveClientCreditsAction, null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) setNote("");
    noticeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state]);

  const total = round2(rows.reduce((sum, r) => sum + (Number.isFinite(Number(r.share)) && r.share.trim() !== "" ? Number(r.share) : 0), 0));
  const totalOk = rows.length === 0 || total === 100;

  const update = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((list) => list.filter((r) => r.key !== key));
  const add = () =>
    setRows((list) => {
      if (list.length >= MAX_ROWS) return list;
      const left = round2(100 - list.reduce((sum, r) => sum + (Number(r.share) || 0), 0));
      return [...list, { key: newKey(), email: "", role: "other", share: left > 0 ? String(left) : "" }];
    });
  const splitEvenly = () =>
    setRows((list) => {
      if (list.length === 0) return list;
      // Hundredths, so the shares add up to exactly 100: the first rows take the leftover cent.
      const base = Math.floor(10_000 / list.length);
      let extra = 10_000 - base * list.length;
      return list.map((r) => {
        const cents = base + (extra-- > 0 ? 1 : 0);
        return { ...r, share: String(cents / 100) };
      });
    });

  const known = new Set(team.map((p) => p.email));
  const label = (p: EditorPerson) => (p.name ? `${p.name} (${p.email})` : p.email);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="client_id" value={clientId} />

      {state && (
        <div ref={noticeRef} role="status" aria-live="polite">
          <Notice kind={state.ok ? "ok" : "err"}>{state.message}</Notice>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm text-ink-3">
          <p>Nobody gets credit. Add a person, or save with no rows to clear the credits.</p>
          {suggestion.length > 0 && (
            <button type="button" onClick={() => setRows(toRows(suggestion))} className={cn(btnSecondary, "self-start")}>
              Fill from the lead
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line bg-bg-2 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_auto] sm:items-end">
              <label className="col-span-2 flex flex-col gap-1 text-xs text-ink-3 sm:col-span-1">
                Person
                <select
                  name="credit_email"
                  required
                  value={r.email}
                  onChange={(e) => update(r.key, { email: e.target.value })}
                  className={cn(selectCls, "py-2.5")}
                >
                  <option value="" disabled>
                    Pick someone on the team
                  </option>
                  {r.email && !known.has(r.email) && <option value={r.email}>{r.email} (not on the team)</option>}
                  {team.map((p) => (
                    <option key={p.email} value={p.email}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-3">
                Role
                <select
                  name="credit_role"
                  value={r.role}
                  onChange={(e) => update(r.key, { role: e.target.value as CreditRole })}
                  title={CREDIT_ROLE_HELP[r.role]}
                  className={cn(selectCls, "py-2.5")}
                >
                  {CREDIT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {CREDIT_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink-3">
                Share
                <span className="relative">
                  <input
                    name="credit_share"
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    max={100}
                    step={0.01}
                    required
                    value={r.share}
                    onChange={(e) => update(r.key, { share: e.target.value })}
                    className={cn(inputCls, "py-2.5 pr-8")}
                  />
                  <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-4">
                    %
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => remove(r.key)}
                aria-label={`Remove credit row ${i + 1}`}
                className="row-start-1 col-start-2 inline-flex h-11 w-11 items-center justify-center self-start rounded-full text-ink-4 transition-colors hover:bg-bg-3 hover:text-signal sm:row-auto sm:col-auto sm:self-end"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={add} disabled={rows.length >= MAX_ROWS} className={btnSecondary}>
          <Plus className="h-4 w-4" aria-hidden />
          Add a person
        </button>
        {rows.length > 1 && (
          <button type="button" onClick={splitEvenly} className={btnSecondary}>
            Split evenly
          </button>
        )}
        {rows.length > 0 && (
          <p className={cn("ml-auto text-sm tabular-nums", totalOk ? "text-ink-3" : "font-medium text-signal")} aria-live="polite">
            Total {total}%{totalOk ? "" : ". Shares must add up to 100."}
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        <span>
          Note <span className="text-gold">*</span>
        </span>
        <textarea
          name="note"
          rows={2}
          required
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why the credit changed"
          className={inputCls}
        />
        <span className="text-xs font-normal text-ink-4">
          Kept in this client&apos;s activity with the credits before and after. {note.length}/{NOTE_MAX}
        </span>
      </label>

      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={cn(btnPrimary, "self-start")}>
        {pending ? (
          <span className="inline-flex items-center gap-1.5">
            <BlackHole />
            Saving
          </span>
        ) : (
          "Save credits"
        )}
      </button>
    </form>
  );
}
