"use client";

import { useState } from "react";
import { PendingSubmit } from "@/components/PendingSubmit";
import { CREDIT_ROLE_HELP, CREDIT_ROLE_LABELS } from "@/lib/staff-constants";

const inputCls =
  "w-full rounded-xl border border-line-strong bg-bg px-4 py-3 pr-9 text-sm text-ink outline-none transition-colors focus:border-gold";

/** Two decimals at most, without trailing zeros: 33.3333 -> "33.33", 50 -> "50". */
function rest(of: string): string {
  const n = Number(of);
  if (of.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) return "";
  return String(Math.round((100 - n) * 100) / 100);
}

/**
 * The default credit split (owners: `commission.settings`). Typing one share
 * fills in the other so they add up to 100; the server checks again
 * (saveCommissionSplitAction). Without `canEdit` it shows the split read only.
 */
export function CommissionSplitForm({
  finder,
  booker,
  canEdit,
  action,
}: {
  finder: number;
  booker: number;
  canEdit: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const [values, setValues] = useState({ finder: String(finder), booker: String(booker) });
  const total = Number(values.finder) + Number(values.booker);
  const adds = Number.isFinite(total) && Math.abs(total - 100) < 1e-9;

  if (!canEdit) {
    return (
      <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="rounded-xl border border-line bg-bg-2 px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-4">{CREDIT_ROLE_LABELS.finder}</dt>
          <dd className="mt-1 font-display text-2xl font-bold text-ink">{finder}%</dd>
        </div>
        <div className="rounded-xl border border-line bg-bg-2 px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-4">{CREDIT_ROLE_LABELS.booker}</dt>
          <dd className="mt-1 font-display text-2xl font-bold text-ink">{booker}%</dd>
        </div>
      </dl>
    );
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:max-w-md sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm text-ink-2">
        {CREDIT_ROLE_LABELS.finder}
        <span className="relative">
          <input
            name="finder"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            required
            value={values.finder}
            onChange={(e) => setValues({ finder: e.target.value, booker: rest(e.target.value) || values.booker })}
            className={inputCls}
          />
          <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-4">
            %
          </span>
        </span>
        <span className="text-xs text-ink-4">{CREDIT_ROLE_HELP.finder}</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-ink-2">
        {CREDIT_ROLE_LABELS.booker}
        <span className="relative">
          <input
            name="booker"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            required
            value={values.booker}
            onChange={(e) => setValues({ booker: e.target.value, finder: rest(e.target.value) || values.finder })}
            className={inputCls}
          />
          <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-4">
            %
          </span>
        </span>
        <span className="text-xs text-ink-4">{CREDIT_ROLE_HELP.booker}</span>
      </label>
      <p className={"text-xs sm:col-span-2 " + (adds ? "text-ink-4" : "text-signal")} aria-live="polite">
        {adds ? "Adds up to 100." : "Finder and booker must add up to 100."}
      </p>
      <PendingSubmit
        pendingLabel="Saving"
        className="self-start rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-colors hover:bg-ink-2 sm:col-span-2"
      >
        Save split
      </PendingSubmit>
    </form>
  );
}
