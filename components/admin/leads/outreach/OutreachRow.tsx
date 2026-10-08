"use client";

import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const rowCls = "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left sm:px-5";
const labelCls = "w-28 shrink-0 text-sm text-ink-3";
const valueCls = "flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 text-sm text-ink";

/**
 * One line of the Outreach card, like the app's: the label on the left, the
 * value on the right. With `onToggle` (the person may change it) the whole row
 * is a button that opens its editor in place under it, with a chevron that
 * turns while open and the app's hint for screen readers. Without it the row
 * is read only, but still shown.
 */
export const OutreachRow = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    children: React.ReactNode;
    /** Opens or closes the editor; none: read only. */
    onToggle?: () => void;
    expanded?: boolean;
    panelId?: string;
    hint?: string;
    hintId?: string;
  }
>(function OutreachRow({ label, children, onToggle, expanded = false, panelId, hint, hintId }, ref) {
  if (!onToggle) {
    return (
      <div className={rowCls}>
        <span className={labelCls}>{label}</span>
        <span className={valueCls}>{children}</span>
      </div>
    );
  }
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          rowCls,
          "transition-colors hover:bg-bg-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold",
        )}
      >
        <span className={labelCls}>{label}</span>
        <span className={valueCls}>{children}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0 text-ink-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
        />
      </button>
      {hint ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}
    </>
  );
});
