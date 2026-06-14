"use client";

import { usePathname } from "next/navigation";
import { AttributionTracker } from "@/components/AttributionTracker";
import { PageviewTracker } from "@/components/PageviewTracker";
import { PostHogInit } from "@/components/PostHogInit";
import { ConsentBanner } from "@/components/ConsentBanner";

/**
 * Marketing-site chrome (attribution, pageview tracking, PostHog, the cookie
 * consent banner). The admin app is a private tool, so none of this should run
 * or render there. Everything stays mounted across public-page navigation.
 */
export function PublicChrome() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
      <AttributionTracker />
      <PageviewTracker />
      <PostHogInit />
      <ConsentBanner />
    </>
  );
}
