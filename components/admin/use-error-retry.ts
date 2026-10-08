"use client";

import { useEffect, useState } from "react";
import { COPY, isOffline } from "@/lib/leads-ui";

/** "Retrying" turns back into "Retry" after this long, so a retry that hangs never locks the button. */
const RETRY_TIMEOUT_MS = 15_000;

/**
 * The Retry behind the admin error screens (app/admin/error.tsx and
 * app/admin/(dashboard)/error.tsx).
 *
 * - Logs the error digest (a server error carries only that) and never shows
 *   the error text: `message` is the plain copy for staff.
 * - Retry calls Next's `unstable_retry`, which refreshes the router and
 *   resets the boundary in one transition, so the segment's server data is
 *   fetched again and rendered.
 * - Offline, Retry does nothing and the message says the connection is down:
 *   a refresh can fall back to a full page load, and the home-screen app's
 *   offline page has no buttons. Going back online clears it.
 * - `retrying` stays true until the retry fails again (a new error), or for
 *   15 seconds at most.
 */
export function useErrorRetry(
  error: Error & { digest?: string },
  unstableRetry: () => void,
): { message: string; retrying: boolean; retry: () => void } {
  const [offline, setOffline] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    console.error("[admin] page error", error.digest ?? error.message);
    // A retry that failed again arrives here as a new error.
    setRetrying(false);
  }, [error]);

  useEffect(() => {
    setOffline(isOffline());
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!retrying) return;
    const timer = window.setTimeout(() => setRetrying(false), RETRY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [retrying]);

  function retry() {
    if (isOffline()) {
      setOffline(true);
      return;
    }
    setOffline(false);
    setRetrying(true);
    unstableRetry();
  }

  return { message: offline ? COPY.network : COPY.loadFailed, retrying, retry };
}
