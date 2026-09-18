"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, CONSENT_VERSION, getConsent, type Consent } from "@/lib/consent";
import {
  getMetaContextId,
  loadPixel,
  pixelEnabledHere,
  readFbc,
  readFbp,
  revokePixel,
  setMetaContextId,
  trackMeta,
} from "@/lib/meta-pixel";

/** Pages where a visit itself is a buying signal worth its own event. */
const INTENT_PATHS = [/^\/webline/, /^\/start/, /^\/case-studies\/.+/, /^\/tools\/.+/];

/**
 * Loads the Meta Pixel after consent, and only then. Renders nothing.
 *
 * Meta's stock snippet counts one PageView per full page load. This site
 * navigates without reloading, so PageView is fired on every route change
 * instead, or Meta would see a one-page site.
 */
export function MetaPixel() {
  const pathname = usePathname();
  const [granted, setGranted] = useState(false);
  const lastPath = useRef<string | null>(null);

  // Follow the visitor's choice, including a change of mind in either direction.
  useEffect(() => {
    setGranted(getConsent()?.marketing === true);
    const onConsent = (e: Event) => {
      const next = (e as CustomEvent<Consent>).detail.marketing;
      if (!next) revokePixel();
      setGranted(next);
    };
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);

  // Load once, then hand the server what it needs to attribute a later
  // booking or sale. fbevents.js writes _fbp a moment after it loads, so wait
  // for it briefly rather than registering a context without it.
  useEffect(() => {
    if (!granted || !pixelEnabledHere()) return;
    loadPixel();
    window.fbq?.("consent", "grant");
    if (getMetaContextId()) return;

    let cancelled = false;
    let tries = 0;
    const register = () => {
      if (cancelled) return;
      const fbp = readFbp();
      if (!fbp && tries++ < 10) {
        window.setTimeout(register, 250);
        return;
      }
      void fetch("/api/meta/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consent: true,
          consent_version: CONSENT_VERSION,
          fbp,
          fbc: readFbc(),
          url: window.location.href.slice(0, 1024),
        }),
        keepalive: true,
      })
        .then((r) => r.json())
        .then((j: { id?: string }) => {
          if (!cancelled && j.id) setMetaContextId(j.id);
        })
        .catch(() => undefined);
    };
    register();
    return () => {
      cancelled = true;
    };
  }, [granted]);

  useEffect(() => {
    if (!granted || !pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    trackMeta("PageView");
    if (INTENT_PATHS.some((re) => re.test(pathname))) trackMeta("ViewContent", { content_name: pathname });
  }, [granted, pathname]);

  return null;
}
