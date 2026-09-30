"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BlackHole } from "@/components/BlackHole";
import { NAV_START_EVENT } from "@/lib/nav-progress";

/**
 * Feedback for every page change, on every part of the site.
 *
 * The moment someone clicks a link (or submits a search form) a thin gold bar
 * starts across the top. If the next page is still not there after the
 * owner's delay (Admin, Loader), the black hole loader fades in over the page.
 * Both clear as soon as the address changes.
 *
 * Pages with their own loading.tsx take over from here: their address changes
 * at once and the loading screen shows inside the page instead. Links that
 * leave the site, open a new tab, download, or only jump to an anchor on the
 * same page are left alone, and so is a link marked `data-no-progress`.
 */
type State = "idle" | "loading" | "done";

// A navigation that never lands (a cancelled server render, a network drop)
// must not leave the bar up forever.
const GIVE_UP_MS = 15_000;

function isSameDocument(url: URL): boolean {
  return url.pathname === window.location.pathname && url.search === window.location.search;
}

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<State>("idle");
  const stateRef = useRef<State>("idle");
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const set = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

  // The address changed: whatever was loading has landed.
  useEffect(() => {
    if (stateRef.current !== "loading") return;
    clearTimers();
    set("done");
    timers.current.push(window.setTimeout(() => set("idle"), 450));
  }, [pathname, search]);

  useEffect(() => {
    const start = () => {
      clearTimers();
      set("loading");
      timers.current.push(
        window.setTimeout(() => {
          set("done");
          timers.current.push(window.setTimeout(() => set("idle"), 450));
        }, GIVE_UP_MS),
      );
    };

    const onClick = (e: MouseEvent) => {
      // No defaultPrevented check: next/link always cancels the browser's own
      // navigation to do its client-side one, so a cancelled click is normal.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.hasAttribute("download") || a.dataset.noProgress !== undefined) return;
      const target = a.getAttribute("target");
      if (target && target !== "_self") return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || isSameDocument(url)) return;
      start();
    };

    // GET forms (search boxes, filters) change the page like a link does.
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (e.defaultPrevented || !form || (form.method || "get").toLowerCase() !== "get") return;
      if (form.target && form.target !== "_self") return;
      try {
        if (new URL(form.action, window.location.href).origin !== window.location.origin) return;
      } catch {
        return;
      }
      start();
    };

    // Capture phase: runs before any link's own handler, on every click.
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    // A router.push from code (lib/nav-progress.ts).
    window.addEventListener(NAV_START_EVENT, start);
    const all = timers.current;
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener(NAV_START_EVENT, start);
      all.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]">
        <div data-state={state} className="nav-progress h-full w-full bg-gold" />
      </div>
      {state === "loading" && (
        // Feedback only: it never blocks a click, and it stays invisible
        // until the owner's delay has passed (.bh-appear).
        <div
          role="status"
          aria-live="polite"
          className="bh-appear pointer-events-none fixed inset-0 z-[190] flex items-center justify-center bg-bg/60 backdrop-blur-[2px]"
        >
          <BlackHole size={72} variant="page" className="text-gold" />
          <span className="sr-only">Loading</span>
        </div>
      )}
    </>
  );
}
