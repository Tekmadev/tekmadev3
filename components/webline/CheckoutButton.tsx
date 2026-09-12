"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { attributionProps, getAttribution } from "@/lib/attribution";
import { captureEvent } from "@/lib/analytics";

const VARIANT = {
  primary: "bg-ink text-bg hover:bg-ink-2",
  gold: "bg-gold text-bg hover:bg-gold-deep",
  outline: "border border-line-strong bg-bg-2/40 text-ink hover:border-ink",
} as const;

const SIZE = {
  md: "px-6 py-3.5 text-sm",
  lg: "px-7 py-4 text-base",
  sm: "px-4 py-2.5 text-sm",
} as const;

/**
 * Starts a Stripe Checkout session for a one-time product. When the product
 * is not purchasable yet (no Stripe price, or sales paused), it degrades to a
 * "book a call" link so the page never shows a dead button.
 */
export function CheckoutButton({
  productId,
  purchasable,
  children,
  className,
  variant = "primary",
  size = "md",
  location = "page",
}: {
  productId: string;
  purchasable: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  /** Where on the page this button sits (for analytics). */
  location?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = cn(
    "group inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 disabled:opacity-60",
    VARIANT[variant],
    SIZE[size],
    className,
  );

  if (!purchasable) {
    return (
      <a href="/#book" className={base}>
        Book a call to get started
        <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
      </a>
    );
  }

  async function go() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const attribution = attributionProps(getAttribution());
    captureEvent("begin_checkout", { product: productId, location, ...attribution });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product: productId, attribution }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Something went wrong. Please try again or book a call.");
    } catch {
      setError("Network error. Please try again or book a call.");
    }
    setLoading(false);
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button type="button" onClick={go} disabled={loading} className={base}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening secure checkout
          </>
        ) : (
          <>
            {children}
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="text-xs text-signal">
          {error}
        </p>
      )}
    </div>
  );
}
