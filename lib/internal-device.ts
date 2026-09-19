/**
 * "This browser belongs to the team, not to a visitor."
 *
 * The owner builds this site and opens it all day, and every one of those page
 * loads used to land in the analytics as traffic. There is no honest way to
 * tell them apart on the server: we keep no IP and no device id, on purpose.
 * So the browser says so itself. A flag in localStorage, set the first time
 * someone signs in to the admin on that browser, and the trackers stay quiet
 * wherever they find it.
 *
 * It is per browser, so each one the team uses has to open the admin once, and
 * a private window never has it. It is only ever written inside the admin, so
 * a visitor can never end up with it. The Analytics page shows the state and
 * can switch it back off, for the day someone needs to test tracking for real.
 */

export const INTERNAL_DEVICE_KEY = "tmd_internal";

/** "1" excluded, "0" deliberately counted, null never decided. */
export function internalDeviceChoice(): "1" | "0" | null {
  try {
    const v = localStorage.getItem(INTERNAL_DEVICE_KEY);
    return v === "1" || v === "0" ? v : null;
  } catch {
    return null;
  }
}

export function isInternalDevice(): boolean {
  return internalDeviceChoice() === "1";
}

export function setInternalDevice(excluded: boolean): void {
  try {
    localStorage.setItem(INTERNAL_DEVICE_KEY, excluded ? "1" : "0");
  } catch {
    /* storage blocked: this browser simply keeps being counted */
  }
}

/** Mark the browser on its first admin visit. A choice already made, either way, is left alone. */
export function markInternalDeviceOnce(): void {
  if (internalDeviceChoice() === null) setInternalDevice(true);
}
