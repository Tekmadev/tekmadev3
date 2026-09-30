"use client";

import { cn } from "@/lib/cn";
import { btnPrimary, btnSecondary } from "@/components/portal/ui";
import { PendingSubmit } from "@/components/PendingSubmit";

/**
 * Portal form submit: the portal's button styles on the shared pending button,
 * so taps on mobile get the black hole spinner at once.
 */
export function SubmitButton({
  children,
  variant = "primary",
  className,
  name,
  value,
  pendingLabel,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  name?: string;
  value?: string;
  pendingLabel?: string;
}) {
  return (
    <PendingSubmit
      name={name}
      value={value}
      pendingLabel={pendingLabel}
      className={cn(variant === "primary" ? btnPrimary : btnSecondary, className)}
    >
      {children}
    </PendingSubmit>
  );
}
