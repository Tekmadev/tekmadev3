"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { BlackHole } from "@/components/BlackHole";
import { PendingSubmit } from "@/components/PendingSubmit";

/**
 * A form submit button with a refresh icon that turns into the black hole
 * spinner while the server action runs. Must sit inside the <form> whose
 * action it reports on.
 */
export function RefreshButton({
  children,
  className,
  pendingLabel = "Refreshing",
}: {
  children: React.ReactNode;
  className?: string;
  /** What the button says while the action runs, when "Refreshing" would be the wrong verb. */
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold disabled:cursor-wait disabled:opacity-70",
        className,
      )}
    >
      {pending ? <BlackHole size={14} /> : <RefreshCw className="h-3.5 w-3.5" />}
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * A submit button that asks first. For the destructive forms (delete a
 * category) where the server action is a plain redirecting one and the only
 * client-side job is the confirmation.
 */
export function ConfirmButton({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <PendingSubmit confirm={message} className={className}>
      {children}
    </PendingSubmit>
  );
}
