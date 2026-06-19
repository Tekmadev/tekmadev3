import { track } from "@vercel/analytics";

/**
 * Fire a custom event to Vercel Web Analytics (cookieless, aggregate).
 * Safe to call anywhere on the client; no-ops cleanly if it isn't ready.
 */
export function captureEvent(name: string, props?: Record<string, string>) {
  try {
    track(name, props);
  } catch {
    /* analytics must never break the UI */
  }
}
