"use client";

import { usePathname } from "next/navigation";
import { AttributionTracker } from "@/components/AttributionTracker";
import { PageviewTracker } from "@/components/PageviewTracker";

/**
 * Marketing-site chrome (first-party attribution + cookieless pageview
 * tracking). Both are cookieless, so there is no cookie consent banner. If a
 * cookie-setting analytics tool (e.g. PostHog) is ever added back, a consent
 * mechanism must be reintroduced first. The admin app is a private tool, so
 * none of this runs or renders there.
 */
export function PublicChrome() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
      <AttributionTracker />
      <PageviewTracker />
    </>
  );
}
