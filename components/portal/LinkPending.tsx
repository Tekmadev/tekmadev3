"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Drop inside a <Link>. Shows a spinner from the tap until the next page's
 * loading state takes over, so a slow server render never looks like a dead
 * button. `idle` is what to show when nothing is pending (an arrow, an icon).
 */
export function LinkPending({ idle, className }: { idle?: React.ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  if (pending) return <Loader2 className={cn("h-3.5 w-3.5 animate-spin", className)} aria-label="Loading" />;
  return <>{idle ?? null}</>;
}
