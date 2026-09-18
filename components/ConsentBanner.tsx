"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { consentCopy } from "@/config/site";
import { CONSENT_OPEN_EVENT, getConsent, globalPrivacyControl, setConsent } from "@/lib/consent";

/**
 * The cookie banner. Advertising cookies are off until someone says yes.
 *
 * Accept and Decline are the same size and the same style on purpose: saying
 * no has to be exactly as easy as saying yes. It never blocks the page, and
 * it stays away entirely for a browser that sends Global Privacy Control,
 * which we read as a no. "Cookie settings" in the footer reopens it.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getConsent() && !globalPrivacyControl()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  function choose(marketing: boolean) {
    setConsent(marketing);
    setOpen(false);
  }

  const button =
    "inline-flex flex-1 items-center justify-center rounded-full border border-line-strong px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/40 hover:bg-ink/[0.04]";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-live="polite"
          aria-label={consentCopy.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          className="fixed inset-x-3 bottom-3 z-[55] sm:inset-x-auto sm:bottom-5 sm:left-5 sm:max-w-sm"
        >
          <div className="rounded-2xl border border-line-strong bg-bg/95 p-5 shadow-[0_24px_60px_-24px_rgba(13,12,10,0.4)] backdrop-blur-xl">
            <p className="text-sm font-semibold text-ink">{consentCopy.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              {consentCopy.body}{" "}
              <a
                href="/cookies"
                className="text-ink-2 underline decoration-line-strong underline-offset-2 transition-colors hover:text-gold"
              >
                {consentCopy.policyLabel}
              </a>
            </p>
            <div className="mt-4 flex gap-2.5">
              <button type="button" onClick={() => choose(false)} className={button}>
                {consentCopy.decline}
              </button>
              <button type="button" onClick={() => choose(true)} className={button}>
                {consentCopy.accept}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
