import { track } from "@vercel/analytics";
import posthog from "posthog-js";

/**
 * Fire a custom event to both analytics backends:
 *  - Vercel Web Analytics (cookieless, aggregate)
 *  - PostHog (cookieless behavioral; only if it has been initialized)
 *
 * Safe to call anywhere on the client; no-ops cleanly if a backend isn't ready.
 */
export function captureEvent(name: string, props?: Record<string, string>) {
  try {
    track(name, props);
  } catch {
    /* analytics must never break the UI */
  }
  try {
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) {
      posthog.capture(name, props);
    }
  } catch {
    /* analytics must never break the UI */
  }
}
