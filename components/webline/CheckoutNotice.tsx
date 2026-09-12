"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Section } from "@/components/Section";
import { attributionProps, getAttribution } from "@/lib/attribution";
import { captureEvent } from "@/lib/analytics";

type Banner = { kind: "success" | "cancelled"; text: string } | null;

/** Reads `?checkout=` after Stripe sends the buyer back, and says what happens next. */
export function CheckoutNotice({ productId }: { productId: string }) {
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("checkout");
    if (status === "success") {
      setBanner({
        kind: "success",
        text: "Payment received. Your client portal invite is on its way to your inbox (give it a few minutes). Set your password, fill in the 15-minute intake, and your build starts today.",
      });
      captureEvent("checkout_success", { product: productId, ...attributionProps(getAttribution()) });
    } else if (status === "cancelled") {
      setBanner({
        kind: "cancelled",
        text: "Checkout cancelled. No charge was made. Your build slot is here whenever you are ready.",
      });
    }
  }, [productId]);

  if (!banner) return null;

  return (
    <Section className="-mt-6 pb-6 sm:-mt-10">
      <div
        role="status"
        className={cn(
          "mx-auto max-w-3xl rounded-2xl border px-5 py-4 text-center text-sm",
          banner.kind === "success" ? "border-gold/40 bg-gold/[0.08] text-ink" : "border-line-strong bg-bg-2 text-ink-2",
        )}
      >
        {banner.text}
      </div>
    </Section>
  );
}
