"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { webline } from "@/config/webline";
import { CheckoutButton } from "@/components/webline/CheckoutButton";

/**
 * Phone and tablet only: a bottom bar with the price and the buy button that
 * appears once the hero's own button has scrolled away.
 */
export function StickyBar({
  productId,
  purchasable,
  price,
  installment,
  monthly,
}: {
  productId: string;
  purchasable: boolean;
  price: string;
  installment: string;
  monthly: string | null;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 560);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden={!shown}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur transition-transform duration-300 lg:hidden",
        shown ? "translate-y-0" : "translate-y-full",
      )}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-ink">
            {webline.sticky.label} · {price}
          </p>
          <p className="truncate text-xs text-ink-3">
            or 4 × {installment}, 0% interest{monthly ? `, then ${monthly}/mo care` : ""}
          </p>
        </div>
        <CheckoutButton productId={productId} purchasable={purchasable} size="sm" location="sticky" className="shrink-0">
          {webline.sticky.cta}
        </CheckoutButton>
      </div>
    </div>
  );
}
