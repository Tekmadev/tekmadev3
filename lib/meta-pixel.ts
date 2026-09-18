/**
 * Meta Pixel, browser side. Client only.
 *
 * Nothing here runs until the visitor accepts advertising cookies
 * (lib/consent.ts), and fbevents.js is not even requested before that, so a
 * visitor who declines never contacts Meta at all.
 *
 * Conversions are also reported from the server (lib/meta-capi.ts). Each pair
 * shares an event id so Meta counts one conversion, not two.
 */

import { tracking } from "@/config/site";
import { hasMarketingConsent } from "@/lib/consent";
import { isPortalHost } from "@/lib/portal-host";

type Fbq = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: Fbq;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const CONTEXT_KEY = "tmd_meta_ctx";

export type MetaEvent = "PageView" | "ViewContent" | "Lead" | "Schedule" | "InitiateCheckout";

/** The pixel runs on the live marketing site only, never the portal, admin or localhost. */
export function pixelEnabledHere(): boolean {
  if (typeof window === "undefined" || !tracking.metaPixelId) return false;
  const host = window.location.hostname;
  if (isPortalHost(host)) return false;
  if (tracking.metaDebug) return true;
  return tracking.metaHosts.includes(host);
}

/** Meta's own loader, unchanged, run once. */
export function loadPixel(): void {
  if (window.fbq) return;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue.push(args);
  } as Fbq;
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  const t = document.createElement("script");
  t.async = true;
  t.src = "https://connect.facebook.net/en_US/fbevents.js";
  const s = document.getElementsByTagName("script")[0];
  s?.parentNode?.insertBefore(t, s);
  window.fbq("init", tracking.metaPixelId);
}

/**
 * Report an event to the pixel. A no-op without consent or off the live site,
 * so callers never need to check. `eventId` must match the id the server
 * sends for the same conversion.
 */
export function trackMeta(event: MetaEvent, params?: Record<string, unknown>, eventId?: string): void {
  try {
    if (!pixelEnabledHere() || !hasMarketingConsent() || !window.fbq) return;
    if (eventId) window.fbq("track", event, params ?? {}, { eventID: eventId });
    else window.fbq("track", event, params ?? {});
  } catch {
    /* tracking must never break the page */
  }
}

function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Meta's click id cookie, or the same value built from the fbclid in the URL
 * when the pixel has not written it yet. Format per Meta: fb.1.<ms>.<fbclid>.
 */
export function readFbc(): string | null {
  const fromCookie = cookie("_fbc");
  if (fromCookie) return fromCookie;
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  return fbclid ? `fb.1.${Date.now()}.${fbclid}` : null;
}

export function readFbp(): string | null {
  return cookie("_fbp");
}

/** The server-side context id for this visitor, present only after consent. */
export function getMetaContextId(): string | null {
  try {
    return hasMarketingConsent() ? sessionStorage.getItem(CONTEXT_KEY) : null;
  } catch {
    return null;
  }
}

export function setMetaContextId(id: string): void {
  try {
    sessionStorage.setItem(CONTEXT_KEY, id);
  } catch {
    /* ignore */
  }
}

/** On a withdrawn consent: tell the pixel, drop its cookies, forget the context. */
export function revokePixel(): void {
  try {
    window.fbq?.("consent", "revoke");
    sessionStorage.removeItem(CONTEXT_KEY);
    const host = window.location.hostname;
    const domains = [host, `.${host.replace(/^www\./, "")}`];
    for (const name of ["_fbp", "_fbc"]) {
      for (const d of domains) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
      }
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  } catch {
    /* ignore */
  }
}

/** A fresh id for one conversion, shared by the browser event and the server event. */
export function newEventId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${prefix}:${id}`;
}
