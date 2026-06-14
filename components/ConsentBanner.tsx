"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CONSENT_EVENT,
  CONSENT_REOPEN_EVENT,
  getConsent,
  setConsent,
} from "@/lib/consent";

/**
 * Bottom cookie-consent banner. Shows until the visitor makes a choice.
 * Accept and Decline carry equal weight (required under Quebec Law 25).
 * Reopen via the footer "Cookie settings" link to change a prior choice.
 */
export function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(getConsent() === null);
    const onChoice = () => setShow(false);
    const onReopen = () => setShow(true);
    window.addEventListener(CONSENT_EVENT, onChoice);
    window.addEventListener(CONSENT_REOPEN_EVENT, onReopen);
    return () => {
      window.removeEventListener(CONSENT_EVENT, onChoice);
      window.removeEventListener(CONSENT_REOPEN_EVENT, onReopen);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-5"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-2xl border border-line-strong bg-surface/95 p-5 shadow-[0_20px_60px_-30px_rgba(13,12,10,0.45)] backdrop-blur-xl sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <p className="text-sm leading-relaxed text-ink-2">
          We use cookies to understand how visitors use our site and make it better. You can
          accept or decline. See our{" "}
          <Link href="/cookies" className="text-ink underline decoration-line-strong underline-offset-2 hover:text-gold">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={() => setConsent("denied")}
            className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => setConsent("granted")}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
