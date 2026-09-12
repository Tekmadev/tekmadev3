"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Notice } from "@/components/portal/ui";

/**
 * Shown when a lead comes back from Stripe before the webhook has turned
 * their account into an onboarding. Reloads a few times; the server renders
 * the onboarding dashboard as soon as the status flips.
 */
export function AwaitOnboarding({ tries = 8, everyMs = 4000 }: { tries?: number; everyMs?: number }) {
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt >= tries) return;
    const t = window.setTimeout(() => {
      setAttempt((a) => a + 1);
      window.location.reload();
    }, everyMs);
    return () => window.clearTimeout(t);
  }, [attempt, tries, everyMs]);

  return (
    <Notice kind="ok">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Payment received. Setting up your onboarding, one moment.
      </span>
    </Notice>
  );
}
