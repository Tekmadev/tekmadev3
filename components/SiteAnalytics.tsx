"use client";

import { Analytics } from "@vercel/analytics/next";
import { isInternalDevice } from "@/lib/internal-device";

/**
 * Vercel Web Analytics, minus the team's own browsers, so its numbers agree
 * with the first-party ones in the admin. A client wrapper only because
 * `beforeSend` is a function, and a function cannot be passed from the
 * server-rendered root layout.
 */
export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => (isInternalDevice() ? null : event)} />;
}
