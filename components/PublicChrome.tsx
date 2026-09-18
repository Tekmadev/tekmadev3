"use client";

import { usePathname } from "next/navigation";
import { AttributionTracker } from "@/components/AttributionTracker";
import { PageviewTracker } from "@/components/PageviewTracker";
import { ConsentBanner } from "@/components/ConsentBanner";
import { MetaPixel } from "@/components/MetaPixel";

/**
 * Marketing-site chrome.
 *
 * Attribution and the pageview counter are first-party and cookieless, so
 * they run for everyone. The Meta Pixel sets cookies and reports to Meta, so
 * it sits behind the consent banner and loads only after a yes. Any other
 * cookie-setting tool added later belongs behind the same banner. The admin
 * and the portal are private tools, so none of this runs or renders there.
 */
export function PublicChrome() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/portal")) return null;

  return (
    <>
      <AttributionTracker />
      <PageviewTracker />
      <MetaPixel />
      <ConsentBanner />
    </>
  );
}
