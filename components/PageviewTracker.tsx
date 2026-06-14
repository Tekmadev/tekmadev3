"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Per-page-load id, kept in memory only (never stored on the device, so the
// whole thing stays cookieless and consent-free).
const sessionId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s_${Math.round(Math.random() * 1e12)}`;

/**
 * Sends a cookieless pageview to /api/track on first load and on every client
 * navigation. Skips the /admin area so dashboard views don't pollute the data.
 */
export function PageviewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (last.current === pathname) return;
    last.current = pathname;

    try {
      const u = new URLSearchParams(window.location.search);
      const data = JSON.stringify({
        type: "pageview",
        path: pathname,
        referrer: document.referrer || "",
        utm_source: u.get("utm_source") || "",
        utm_medium: u.get("utm_medium") || "",
        utm_campaign: u.get("utm_campaign") || "",
        utm_term: u.get("utm_term") || "",
        utm_content: u.get("utm_content") || "",
        session_id: sessionId,
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([data], { type: "application/json" }));
      } else {
        void fetch("/api/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: data,
          keepalive: true,
        });
      }
    } catch {
      /* tracking must never break the page */
    }
  }, [pathname]);

  return null;
}
