"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Notice, btnGhost, btnSecondary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { COPY, isOffline } from "@/lib/leads-ui";

/**
 * A failed load: the message and a Retry, never an empty list. The default
 * Retry refreshes the page's server data. Offline it never refreshes (a failed
 * refresh can fall back to a full page load, and the home-screen app's offline
 * page has no buttons): it says the connection is down instead.
 */
export function RetryNotice({
  message,
  compact,
  onRetry,
  reload,
}: {
  message: string;
  compact?: boolean;
  onRetry?: () => void | Promise<void>;
  reload?: boolean;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [waiting, setWaiting] = useState(false);
  const [offline, setOffline] = useState(false);
  const busy = refreshing || waiting;
  const shown = offline ? COPY.network : message;

  const retry = () => {
    if (busy) return;
    if (!onRetry) {
      if (isOffline()) {
        setOffline(true);
        return;
      }
      setOffline(false);
      startTransition(() => router.refresh());
      return;
    }
    setOffline(false);
    let result: void | Promise<void>;
    try {
      result = onRetry();
    } catch {
      return;
    }
    if (result && typeof (result as Promise<void>).then === "function") {
      setWaiting(true);
      (result as Promise<void>).then(
        () => setWaiting(false),
        () => setWaiting(false),
      );
    }
  };

  const reloadPage = () => {
    if (isOffline()) {
      setOffline(true);
      return;
    }
    window.location.reload();
  };

  const retryLabel = busy ? "Retrying" : "Retry";

  if (compact) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-x-2 rounded-xl border border-signal/40 bg-signal/[0.06] py-1 pl-3 pr-1 text-sm text-ink"
      >
        <span className="min-w-0 flex-1 py-2">{shown}</span>
        <span className="flex shrink-0 items-center">
          <button type="button" onClick={retry} disabled={busy} aria-busy={busy} className={cn(btnGhost, "px-3 text-gold hover:text-gold-deep")}>
            {retryLabel}
          </button>
          {reload && (
            <button type="button" onClick={reloadPage} className={cn(btnGhost, "px-3")}>
              Reload
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div role="alert">
      <Notice kind="err">
        <p>{shown}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={retry} disabled={busy} aria-busy={busy} className={btnSecondary}>
            {retryLabel}
          </button>
          {reload && (
            <button type="button" onClick={reloadPage} className={btnGhost}>
              Reload
            </button>
          )}
        </div>
      </Notice>
    </div>
  );
}

/**
 * "Refresh" for pages a home-screen app cannot reload (no address bar, no pull
 * to refresh). Offline it says so next to the button and never refreshes.
 */
export function RefreshControl({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [offline, setOffline] = useState(false);

  const refresh = () => {
    if (pending) return;
    if (isOffline()) {
      setOffline(true);
      return;
    }
    setOffline(false);
    startTransition(() => router.refresh());
  };

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-x-2", className)}>
      <button type="button" onClick={refresh} disabled={pending} aria-busy={pending} className={btnGhost}>
        <RefreshCw aria-hidden="true" className={cn("h-4 w-4", pending && "motion-safe:animate-spin")} />
        {pending ? "Refreshing" : "Refresh"}
      </button>
      {offline && (
        <p role="alert" className="text-xs text-signal">
          {COPY.network}
        </p>
      )}
    </div>
  );
}
