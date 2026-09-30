"use client";

import { useLinkStatus } from "next/link";
import { BlackHole } from "@/components/BlackHole";

/**
 * Drop inside a <Link>. Shows a spinner from the tap until the next page's
 * loading state takes over, so a slow server render never looks like a dead
 * button. `idle` is what to show when nothing is pending (an arrow, an icon).
 */
export function LinkPending({ idle, className }: { idle?: React.ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  if (pending) return <BlackHole size={14} className={className} label="Loading" />;
  return <>{idle ?? null}</>;
}
