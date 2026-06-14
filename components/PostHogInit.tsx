"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { CONSENT_EVENT, getConsent, type Consent } from "@/lib/consent";

// Module-scoped guard so we init PostHog at most once.
let inited = false;

/**
 * Enable PostHog WITH cookies. Called only once the visitor has consented
 * (on Accept, or on load for a returning visitor who previously accepted).
 */
function enable() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  if (!inited) {
    inited = true;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      persistence: "localStorage+cookie",
      capture_pageview: "history_change",
      autocapture: true,
      disable_session_recording: true,
      person_profiles: "identified_only",
    });
  } else {
    posthog.set_config({ persistence: "localStorage+cookie" });
    posthog.opt_in_capturing();
  }
}

/** Withdraw: stop capturing, drop cookies, clear any stored id. */
function disable() {
  if (!inited) return;
  try {
    posthog.opt_out_capturing();
  } catch {
    /* noop */
  }
  try {
    posthog.set_config({ persistence: "memory" });
  } catch {
    /* noop */
  }
  try {
    posthog.reset(true);
  } catch {
    /* noop */
  }
}

/**
 * Consent-gated PostHog. No tracking and no cookies until the visitor accepts.
 * Env-gated on NEXT_PUBLIC_POSTHOG_KEY. Renders nothing.
 */
export function PostHogInit() {
  useEffect(() => {
    if (getConsent() === "granted") enable();

    const onConsent = (e: Event) => {
      const choice = (e as CustomEvent<Consent>).detail;
      if (choice === "granted") enable();
      else disable();
    };
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);

  return null;
}
