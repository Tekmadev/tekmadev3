"use client";

import { useEffect, useState } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { business, theme, themeDark } from "@/config/site";
import { attributionProps, getAttribution } from "@/lib/attribution";
import { captureEvent } from "@/lib/analytics";

type Theme = "light" | "dark";

export function BookingEmbed() {
  const [calTheme, setCalTheme] = useState<Theme>("light");
  const [utm, setUtm] = useState<Record<string, string>>({});

  // Read initial theme + attribution, and keep Cal in sync with the toggle.
  useEffect(() => {
    setCalTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    setUtm(attributionProps(getAttribution()));
    const onTheme = (e: Event) =>
      setCalTheme((e as CustomEvent<Theme>).detail === "dark" ? "dark" : "light");
    window.addEventListener("tmd-theme", onTheme);
    return () => window.removeEventListener("tmd-theme", onTheme);
  }, []);

  // Apply Cal UI config; re-apply theme when it changes.
  useEffect(() => {
    (async () => {
      const cal = await getCalApi({ namespace: business.booking.namespace });
      cal("ui", {
        hideEventTypeDetails: false,
        layout: "month_view",
        theme: calTheme,
        cssVarsPerTheme: {
          light: {
            "cal-brand": theme.gold,
            "cal-text": theme.ink,
            "cal-text-emphasis": theme.ink,
            "cal-text-muted": theme.ink3,
            "cal-bg": theme.surface,
            "cal-bg-emphasis": theme.bg,
            "cal-bg-muted": theme.bg2,
            "cal-border": theme.line,
            "cal-border-emphasis": theme.lineStrong,
            "cal-border-subtle": theme.lineSoft,
          },
          dark: {
            "cal-brand": themeDark.gold,
            "cal-text": themeDark.ink,
            "cal-text-emphasis": themeDark.ink,
            "cal-text-muted": themeDark.ink3,
            "cal-bg": themeDark.surface,
            "cal-bg-emphasis": themeDark.bg2,
            "cal-bg-muted": themeDark.bg3,
            "cal-border": themeDark.line,
            "cal-border-emphasis": themeDark.lineStrong,
            "cal-border-subtle": themeDark.lineSoft,
          },
        },
      });
    })();
  }, [calTheme]);

  // Stamp every completed booking with its traffic source (Vercel Analytics event).
  useEffect(() => {
    let active = true;
    (async () => {
      const cal = await getCalApi({ namespace: business.booking.namespace });
      if (!active) return;
      cal("on", {
        action: "bookingSuccessful",
        callback: () => {
          captureEvent("booking", attributionProps(getAttribution()));
        },
      });
    })();
    return () => {
      active = false;
    };
  }, []);

  // Forward only the utm_* keys to Cal so each booking record carries its source.
  const calUtm = Object.fromEntries(
    Object.entries(utm).filter(([k]) => k.startsWith("utm_")),
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_30px_80px_-50px_rgba(13,12,10,0.25)]">
      <Cal
        namespace={business.booking.namespace}
        calLink={business.booking.link}
        style={{ width: "100%", minHeight: "720px", height: "100%", overflow: "auto" }}
        config={{ layout: "month_view", theme: calTheme, ...calUtm }}
      />
    </div>
  );
}
