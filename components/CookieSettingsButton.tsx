"use client";

import { reopenConsent } from "@/lib/consent";

/** Footer link that reopens the consent banner so visitors can change their choice. */
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={reopenConsent}
      className="text-left text-sm text-ink-2 transition-colors duration-200 hover:text-gold"
    >
      Cookie settings
    </button>
  );
}
