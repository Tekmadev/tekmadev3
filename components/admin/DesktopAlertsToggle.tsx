"use client";

import { useEffect, useState } from "react";
import { desktopAlertsEnabled, setDesktopAlerts } from "@/components/admin/NotificationBell";

/**
 * iPhone or iPad, including the home-screen app (its user agent still names
 * the device) and an iPad asking for the desktop site (it says Macintosh but
 * has a touch screen). Never `"standalone" in navigator`: Safari on a Mac can
 * have that property too, and a Mac can show desktop alerts.
 */
function isAppleMobile(): boolean {
  try {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  } catch {
    return false;
  }
}

/**
 * Opt-in desktop alerts for this browser: a system notification when something
 * new arrives while the admin is open in a background tab. The browser only
 * allows the permission prompt from a click, which is why this is a button.
 *
 * Not on iPhone or iPad: iOS throws on new Notification(), and real alerts
 * there need Web Push. The bell still shows new items while the app is open.
 */
export function DesktopAlertsToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);

  useEffect(() => {
    setAppleMobile(isAppleMobile());
    setOn(desktopAlertsEnabled());
    setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
  }, []);

  if (on === null) return null;
  if (appleMobile) {
    return <p className="text-sm text-ink-4">Not on iPhone yet. New items show in the bell.</p>;
  }
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
        className="min-h-11 rounded-full border border-line-strong px-3.5 py-1.5 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {on ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
