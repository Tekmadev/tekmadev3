"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

/**
 * The booking calendar sits at the bottom of the homepage, but Cal.com's embed
 * is a separate script plus an iframe, and loading it on first paint made every
 * visitor pay for it, including the ones who never scroll that far.
 *
 * So the calendar, and the Cal.com code with it, loads only when the visitor is
 * heading there: the section is within about a screen and a half, or the page
 * opened on (or jumped to) #book. The placeholder holds the same height, so
 * nothing shifts when the calendar arrives.
 */

const Placeholder = () => (
  <div
    role="status"
    aria-label="Loading the booking calendar"
    className="flex min-h-[720px] items-center justify-center rounded-2xl border border-line-strong bg-surface text-sm text-ink-3"
  >
    Loading the calendar…
  </div>
);

const BookingEmbed = dynamic(() => import("@/components/BookingEmbed").then((m) => m.BookingEmbed), {
  ssr: false,
  loading: Placeholder,
});

export function LazyBookingEmbed() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const load = () => setShow(true);
    const onHash = () => window.location.hash === "#book" && load();

    if (window.location.hash === "#book" || !("IntersectionObserver" in window)) {
      load();
      return;
    }
    window.addEventListener("hashchange", onHash);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && load(), {
      rootMargin: "1200px 0px",
    });
    if (ref.current) io.observe(ref.current);
    return () => {
      window.removeEventListener("hashchange", onHash);
      io.disconnect();
    };
  }, [show]);

  return <div ref={ref}>{show ? <BookingEmbed /> : <Placeholder />}</div>;
}
