"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { btnPrimary, btnSecondary } from "@/components/portal/ui";

/** Form submit with a pending state so taps on mobile get instant feedback. */
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
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={cn(variant === "primary" ? btnPrimary : btnSecondary, className)}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
