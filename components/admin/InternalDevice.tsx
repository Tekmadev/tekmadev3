"use client";

import { useEffect, useState } from "react";
import { internalDeviceChoice, markInternalDeviceOnce, setInternalDevice } from "@/lib/internal-device";

/**
 * Sits in the admin layout and renders nothing. Reaching the admin means the
 * person is signed in as staff, so the first time that happens on a browser it
 * is marked as a team device and its visits stop counting as traffic.
 */
export function InternalDeviceMark() {
  useEffect(() => {
    markInternalDeviceOnce();
  }, []);
  return null;
}

/** The line on the Analytics page that says whether this browser is counted, with the switch. */
export function InternalDeviceNote() {
  // Unknown until mounted: the answer lives in this browser, not on the server.
  const [excluded, setExcluded] = useState<boolean | null>(null);

  useEffect(() => {
    markInternalDeviceOnce();
    setExcluded(internalDeviceChoice() === "1");
  }, []);

  if (excluded === null) return null;

  function toggle() {
    setInternalDevice(!excluded);
    setExcluded(!excluded);
  }

  return (
    <p className="-mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-4">
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${excluded ? "bg-gold" : "bg-signal"}`}
      />
      {excluded
        ? "Your own visits from this browser are not counted."
        : "Your own visits from this browser are being counted as traffic."}
      <button
        type="button"
        onClick={toggle}
        className="rounded underline decoration-line-strong underline-offset-2 transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        {excluded ? "Count them" : "Stop counting them"}
      </button>
    </p>
  );
}
