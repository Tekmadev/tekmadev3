"use client";

import { btnGhost } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { fieldCls } from "@/lib/leads-ui";

/**
 * An iPhone-proof `datetime-local`: 16px below lg (portrait and landscape
 * phones, so iOS does not zoom), the value left aligned and never collapsed
 * when empty (iOS centres it and shrinks an empty date input), and a "Clear"
 * beside it while it holds a value. The value is a Toronto wall time
 * ("YYYY-MM-DDTHH:mm"): turn it into an instant only with
 * torontoLocalToInstant, never the Date constructor (that reads the phone's zone).
 */
export function DateTimeField({
  id,
  label,
  help,
  value,
  onChange,
  min,
  max,
  error,
  aside,
  disabled,
  announce,
}: {
  id: string;
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  error?: string | null;
  aside?: React.ReactNode;
  disabled?: boolean;
  /** Read the error out at once (a server's answer, or a try to send), not only show it. */
  announce?: boolean;
}) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <input
          id={id}
          type="datetime-local"
          step={60}
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            fieldCls,
            "min-h-11 min-w-0 flex-1 appearance-none text-left [&::-webkit-date-and-time-value]:min-h-[1.5em] [&::-webkit-date-and-time-value]:text-left",
          )}
        />
        {value ? (
          <button
            type="button"
            className={cn(btnGhost, "shrink-0 px-3")}
            onClick={() => onChange("")}
            disabled={disabled}
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            Clear
          </button>
        ) : null}
      </div>
      {error ? (
        // A new element when it turns into an alert, so screen readers read it out.
        <p key={announce ? "alert" : "note"} id={errorId} role={announce ? "alert" : undefined} className="text-sm text-signal">
          {error}
        </p>
      ) : null}
      {help ? (
        <p id={helpId} className="text-xs text-ink-4">
          {help}
        </p>
      ) : null}
    </div>
  );
}
