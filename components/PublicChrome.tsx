"use client";

import { usePathname } from "next/navigation";
import { AttributionTracker } from "@/components/AttributionTracker";
import { PageviewTracker } from "@/components/PageviewTracker";
import { ConsentBanner } from "@/components/ConsentBanner";
import { MetaPixel } from "@/components/MetaPixel";
import { TestModeBar } from "@/components/TestModeBar";

/**
 * Marketing-site chrome.
 *
 * Attribution and the pageview counter are first-party and cookieless, so
 * they run for everyone. The Meta Pixel sets cookies and reports to Meta, so
 * it sits behind the consent banner and loads only after a yes. Any other
 * cookie-setting tool added later belongs behind the same banner. The admin
 * and the portal are private tools, so none of this runs or renders there.
 *
 * Nor on /unsubscribe. That URL carries the person's unsubscribe token, which
 * the pixel would report to Meta as the page address, and on a phone the
 * cookie banner would sit on top of the unsubscribe button. Someone leaving
 * the list gets a clean page and no tracking.
 */
export function PublicChrome() {
  const pathname = usePathname();
  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/portal") ||
    pathname?.startsWith("/unsubscribe")
  ) {
    return null;
  }

  return (
    <>
      <AttributionTracker />
      <PageviewTracker />
      <MetaPixel />
      <ConsentBanner />
      <TestModeBar />
    </>
  );
}
