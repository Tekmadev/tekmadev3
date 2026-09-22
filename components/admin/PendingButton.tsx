"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A form submit button with a refresh icon that spins while the server action
 * runs, then stops. Must sit inside the <form> whose action it reports on.
 */
export function RefreshButton({ children, className }: { children: React.ReactNode; className?: string }) {
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
      <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
      {pending ? "Refreshing" : children}
    </button>
  );
}

/**
 * A submit button that asks first. For the destructive forms (delete a
 * category) where the server action is a plain redirecting one and the only
 * client-side job is the confirmation.
 */
export function ConfirmButton({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
