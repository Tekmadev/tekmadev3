"use client";

import { useEffect, useState } from "react";

/**
 * A reminder, in the admin's own browser, that Webline checkout is in test
 * mode. It reads a plain cookie that exists only to draw this bar. It decides
 * nothing: the server checks the admin session on every checkout, so faking
 * the cookie shows a bar and changes nothing else.
 */
export function TestModeBar() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(document.cookie.split("; ").some((c) => c === "tmd_stripe_test_ui=1"));
  }, []);

  if (!on) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[58] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-signal px-4 py-2 text-center text-xs font-medium text-white">
      <span className="font-mono uppercase tracking-[0.18em]">Test mode</span>
      <span>Webline checkout uses the Stripe sandbox. Card 4242 4242 4242 4242.</span>
      <a href="/admin/test-mode" className="underline underline-offset-2">
        Switch off
      </a>
    </div>
  );
}
