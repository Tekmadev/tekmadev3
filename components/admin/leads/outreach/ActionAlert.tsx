"use client";

import { useState } from "react";
import { Notice, btnGhost } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { COPY, isOffline } from "@/lib/leads-ui";

export type ActionFailure = { code: string; message: string; fields?: Record<string, string> };

/**
 * A failed save, at the top of its editor: the server's message, or the
 * network or generic copy when the call itself failed. Those two can be tried
 * again ("Retry"); the generic one also offers "Reload", since an action a new
 * deploy removed, or a redirect after the session ended, only heals with a
 * reload. What was typed stays on screen until then, so it can be copied
 * first. Offline, Reload shows the network copy instead of reloading.
 */
export function ActionAlert({
  failure,
  onRetry,
  pending,
  retrying,
}: {
  failure: ActionFailure | null;
  onRetry?: () => void;
  pending?: boolean;
  retrying?: boolean;
}) {
  // The failure Reload found offline (a new failure starts fresh).
  const [offlineFor, setOfflineFor] = useState<ActionFailure | null>(null);
  if (!failure) return null;
  const transient = failure.code === "network" || failure.code === "reload";
  const message = offlineFor === failure ? COPY.network : failure.message;
  return (
    <div role="alert">
      <Notice kind="err">
        <p>{message}</p>
        {transient ? (
          <div className="-mx-4 -mb-2 mt-1 flex flex-wrap items-center">
            {onRetry ? (
              <button type="button" className={cn(btnGhost, "text-ink")} onClick={onRetry} disabled={pending}>
                {pending && retrying ? "Retrying" : "Retry"}
              </button>
            ) : null}
            {failure.code === "reload" ? (
              <button
                type="button"
                className={cn(btnGhost, "text-ink")}
                disabled={pending}
                onClick={() => {
                  if (isOffline()) {
                    setOfflineFor(failure);
                    return;
                  }
                  window.location.reload();
                }}
              >
                Reload
              </button>
            ) : null}
          </div>
        ) : null}
      </Notice>
    </div>
  );
}
