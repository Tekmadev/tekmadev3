"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";
import { isPortalHost } from "@/lib/portal-host";

/**
 * Captures first-touch / last-touch traffic source on load, then renders
 * nothing. Mounted once in the root layout. See lib/attribution.ts.
 */
export function AttributionTracker() {
  useEffect(() => {
    // The client portal is not a marketing surface; no attribution there.
    if (isPortalHost(window.location.hostname)) return;
    captureAttribution();
  }, []);

  return null;
}
