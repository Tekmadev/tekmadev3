"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { BlackHole } from "@/components/BlackHole";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** What the button says while it works, when the idle label would be the wrong verb. */
  pendingLabel?: React.ReactNode;
  /** Ask first (a destructive action). Cancelling submits nothing. */
  confirm?: string;
};

/**
 * The submit button for any form whose action is a server action. While the
 * action runs, the button that was pressed shows the black hole spinner
 * (components/BlackHole.tsx) and every submit button in the form is locked,
 * so a slow connection never looks like a dead button and nothing is sent
 * twice. Works inside server components: only the button is client code.
 *
 * With several submit buttons in one form, only the one that submitted spins.
 * A form with a plain URL action (a GET search) reports no pending state;
 * the page-change bar (components/NavProgress.tsx) covers those.
 */
export function PendingSubmit({ children, className, pendingLabel, confirm, onClick, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  const [mine, setMine] = useState(false);

  // Which button sent the form. Covers Enter in a field too, where the
  // browser picks the form's first submit button as the submitter.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = (e: SubmitEvent) => setMine(e.submitter === ref.current);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  useEffect(() => {
    if (!pending) setMine(false);
  }, [pending]);

  const busy = pending && mine;
  return (
    <button
      ref={ref}
      type="submit"
      {...rest}
      disabled={disabled || pending}
      aria-busy={busy || undefined}
      data-pending={busy ? "" : undefined}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={className}
    >
      {busy ? (
        // Wrapped, not restyled: the button keeps its own layout (block,
        // flex, full width, left-aligned) and the spinner sits by the label.
        <span className="inline-flex items-center justify-center gap-1.5">
          <BlackHole />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
