"use client";

import { useEffect, useState } from "react";
import { desktopAlertsEnabled, setDesktopAlerts } from "@/components/admin/NotificationBell";

/**
 * Opt-in desktop alerts for this browser: a system notification when something
 * new arrives while the admin is open in a background tab. The browser only
 * allows the permission prompt from a click, which is why this is a button.
 */
export function DesktopAlertsToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setOn(desktopAlertsEnabled());
    setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
  }, []);

  if (on === null) return null;
  if (typeof Notification === "undefined") {
    return <p className="text-sm text-ink-4">This browser does not support desktop alerts.</p>;
  }

  async function toggle() {
    const next = await setDesktopAlerts(!on);
    setOn(next);
    setBlocked(Notification.permission === "denied");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-ink">Desktop alerts on this browser</p>
        <p className="mt-0.5 text-xs text-ink-3">
          {blocked
            ? "Blocked in your browser settings for this site. Allow notifications there, then turn this on."
            : "A system alert when something new arrives while the admin is open in another tab."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={blocked}
        className="rounded-full border border-line-strong px-3.5 py-1.5 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {on ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
