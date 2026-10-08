"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

type CopyState = "idle" | "copied" | "failed";

const SHOW_MS = 2000;

/** Older iOS and non-secure pages have no async clipboard: copy through a hidden, selected textarea. */
function copyWithSelection(value: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  // 16px so iOS never zooms, off screen so nothing jumps.
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.fontSize = "16px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Blocked or unsupported: try the selection copy below.
  }
  try {
    return copyWithSelection(value);
  } catch {
    return false;
  }
}

/**
 * A 44px round icon button that copies `value` ("Copy email"). For two
 * seconds after a tap it shows a check and announces "Copied.", or shows
 * "Could not copy that." when the browser refused.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async () => {
    const ok = await copyText(value);
    if (timer.current !== null) clearTimeout(timer.current);
    setState(ok ? "copied" : "failed");
    timer.current = setTimeout(() => {
      timer.current = null;
      setState("idle");
    }, SHOW_MS);
  };

  const Icon = state === "copied" ? Check : Copy;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => void onCopy()}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 outline-none transition-colors hover:bg-bg-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-gold",
          state === "copied" && "text-emerald-700 dark:text-emerald-300",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
      <span role="status" className={state === "failed" ? "text-xs text-signal" : "sr-only"}>
        {state === "copied" ? "Copied." : state === "failed" ? "Could not copy that." : ""}
      </span>
    </span>
  );
}
