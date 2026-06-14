"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/**
 * Captures first-touch / last-touch traffic source on load, then renders
 * nothing. Mounted once in the root layout. See lib/attribution.ts.
 */
export function AttributionTracker() {
  useEffect(() => {
    captureAttribution();
  }, []);

  return null;
}
