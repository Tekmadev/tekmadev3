/**
 * Start the top page-change bar (components/NavProgress.tsx) from code, for a
 * navigation that is not a link click: a `router.push` after a click handler.
 * It clears itself when the address changes, like a link navigation does.
 */
export const NAV_START_EVENT = "tmd:nav-start";

export function startNavProgress(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_START_EVENT));
}
