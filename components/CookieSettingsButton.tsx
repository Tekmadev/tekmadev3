"use client";

import { consentCopy } from "@/config/site";
import { openConsentSettings } from "@/lib/consent";

/** Reopens the cookie banner, so a choice can be changed as easily as it was made. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      {consentCopy.settingsLabel}
    </button>
  );
}
