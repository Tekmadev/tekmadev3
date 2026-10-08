"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Fresh data when you come back to the admin. The home-screen app has no
 * reload button and no pull to refresh, and iOS keeps it frozen in the
 * background for hours, so on return:
 *
 * - under a minute away: nothing (unless iOS restored a frozen page);
 * - a minute or more: the page's data is fetched again (router.refresh());
 * - 30 minutes or more: a full reload, which also picks up a new deploy, so an
 *   old page never calls a server action that no longer exists. Never while a
 *   form holds typed text (then it only refreshes, which keeps the text);
 * - offline: nothing at all, and it runs once when the connection is back;
 * - on a "new" form (Add lead, New client, Request a demo): never anything.
 *   A refresh would hand the open form a new idempotency key, so a retry
 *   after a lost response could save twice, and a reload would lose the text.
 */

export type ResumeAction = "none" | "refresh" | "reload";

export const RESUME_REFRESH_MS = 60_000;
export const RESUME_RELOAD_MS = 30 * 60_000;

export type ResumeContext = {
  /** Some form holds typed, unsent text (hasUnsavedInput). */
  unsaved: boolean;
  pathname: string;
  /** navigator.onLine; false means offline. */
  online: boolean;
  /** pageshow with persisted: iOS restored a frozen page. */
  persisted: boolean;
};

/** True on a path whose last segment is "new": /admin/leads/new, /admin/clients/new, /admin/demos/new. */
export function isNewFormPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] === "new";
}

/** What to do after the page was hidden for hiddenMs. Pure, so the harness can pin the rules. */
export function resumeAction(hiddenMs: number, ctx: ResumeContext): ResumeAction {
  // A failed refresh can fall back to a full page load, and the home-screen
  // app's offline page has no buttons.
  if (ctx.online === false) return "none";
  if (isNewFormPath(ctx.pathname)) return "none";
  if (!(hiddenMs >= RESUME_REFRESH_MS)) return ctx.persisted ? "refresh" : "none";
  if (hiddenMs >= RESUME_RELOAD_MS && !ctx.unsaved) return "reload";
  return "refresh";
}

type ControlLike = {
  tagName?: string;
  type?: string;
  value?: string;
  defaultValue?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  multiple?: boolean;
  options?: ArrayLike<OptionLike>;
};

type OptionLike = { selected?: boolean; defaultSelected?: boolean; disabled?: boolean };

const SKIPPED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "file"]);

/**
 * Would a form reset change this select? For a single select with no default
 * option, the browser's default is the first option that is not disabled.
 */
function selectDiffers(options: OptionLike[], multiple: boolean): boolean {
  if (multiple) return options.some((o) => !!o.selected !== !!o.defaultSelected);
  let defaultIndex = -1;
  options.forEach((o, i) => {
    if (o.defaultSelected) defaultIndex = i;
  });
  if (defaultIndex === -1) defaultIndex = options.findIndex((o) => !o.disabled);
  const selectedIndex = options.findIndex((o) => !!o.selected);
  return selectedIndex !== defaultIndex;
}

function controlDiffers(el: ControlLike): boolean {
  const tag = String(el.tagName ?? "").toUpperCase();
  if (tag === "INPUT") {
    const type = String(el.type ?? "text").toLowerCase();
    if (SKIPPED_INPUT_TYPES.has(type)) return false;
    if (type === "checkbox" || type === "radio") return !!el.checked !== !!el.defaultChecked;
    return (el.value ?? "") !== (el.defaultValue ?? "");
  }
  if (tag === "TEXTAREA") return (el.value ?? "") !== (el.defaultValue ?? "");
  if (tag === "SELECT") return selectDiffers(Array.from(el.options ?? []), !!el.multiple);
  return false;
}

/**
 * True when a form holds typed, unsent text: some form[data-unsaved="true"]
 * (forms with controlled fields set it themselves, because React keeps
 * defaultValue equal to value on controlled inputs), or some control inside a
 * form that differs from its default.
 */
export function hasUnsavedInput(root: Pick<Document, "querySelectorAll">): boolean {
  try {
    if (root.querySelectorAll('form[data-unsaved="true"]').length > 0) return true;
    const controls = Array.from(root.querySelectorAll("form input, form textarea, form select")) as unknown as ControlLike[];
    return controls.some(controlDiffers);
  } catch {
    // When in doubt, keep the text: a refresh keeps it, a reload would not.
    return true;
  }
}

/** Two resume events for one return (pageshow and visibilitychange) act once. */
const DEDUPE_MS = 1500;

export function RefreshOnResume() {
  const router = useRouter();

  useEffect(() => {
    // Wall clock, not performance.now(): that can stand still while the phone sleeps.
    let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;
    let skippedOffline = false;
    let lastActedAt = 0;

    const resume = (persisted: boolean) => {
      const now = Date.now();
      const online = navigator.onLine !== false;
      const hiddenMs = hiddenAt === null ? 0 : now - hiddenAt;
      const action = resumeAction(hiddenMs, {
        unsaved: hasUnsavedInput(document),
        pathname: window.location.pathname,
        online,
        persisted,
      });
      if (!online) {
        // Keep hiddenAt: when the connection is back, the time away counts from then.
        skippedOffline = true;
        return;
      }
      skippedOffline = false;
      hiddenAt = null;
      if (action === "none") return;
      if (now - lastActedAt < DEDUPE_MS) return;
      lastActedAt = now;
      if (action === "reload") window.location.reload();
      else router.refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Keep the oldest time: after an offline skip the data is older still.
        if (hiddenAt === null) hiddenAt = Date.now();
      } else {
        resume(false);
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resume(true);
    };
    const onOnline = () => {
      if (skippedOffline && document.visibilityState === "visible") resume(false);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
