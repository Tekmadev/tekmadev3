"use client";

import { cn } from "@/lib/cn";

/*
 * Small pieces the Outreach editors share: a radio row (Status, Assigned to),
 * a field error line, and the chip style of the quick dates and the touch
 * kinds. Every target is at least 44px tall.
 */

/** One choice in a radio list: the radio, its label, and a hint in small muted text. Blocked choices are dimmed. */
export function RadioRow({
  name,
  value,
  label,
  hint,
  checked,
  disabled,
  dimmed,
  invalid,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  hint?: string | null;
  checked: boolean;
  disabled?: boolean;
  /** Blocked by a rule (not only busy): drawn at 60% opacity. */
  dimmed?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 py-1", dimmed && "cursor-not-allowed opacity-60")}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid && checked ? true : undefined}
        onChange={() => onChange(value)}
        className="h-5 w-5 shrink-0 accent-[var(--color-gold)]"
      />
      <span className="flex min-w-0 flex-col">
        <span className="break-words text-sm text-ink">{label}</span>
        {hint ? <span className="break-words text-xs text-ink-4">{hint}</span> : null}
      </span>
    </label>
  );
}

/** A server error under the field it is about (the field points at it with aria-describedby). */
export function FieldError({ id, message }: { id: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-signal">
      {message}
    </p>
  );
}

/** A chip in a chip radio group (quick dates, touch kinds). */
export function chipCls(active: boolean): string {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
    active ? "border-gold bg-gold/10 text-gold-deep" : "border-line-strong bg-surface text-ink-2 hover:border-gold",
  );
}

/**
 * Arrow keys move the choice in a chip radio group (role="radio" buttons with
 * a roving tabindex), like native radios.
 */
export function chipKeyDown<T>(event: React.KeyboardEvent<HTMLElement>, values: readonly T[], current: T | null, pick: (v: T) => void): void {
  const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const step = keys[event.key];
  if (!step || values.length === 0) return;
  event.preventDefault();
  const at = current === null ? -1 : values.indexOf(current);
  const next = at < 0 ? values[step > 0 ? 0 : values.length - 1] : values[(at + step + values.length) % values.length];
  pick(next);
  const group = event.currentTarget.closest('[role="radiogroup"]');
  const target = group?.querySelectorAll<HTMLElement>('[role="radio"]')[values.indexOf(next)];
  target?.focus();
}

/** The footer of an editor: the main button full width on phones, Cancel under it; side by side from sm. */
export const footerCls = "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center";
