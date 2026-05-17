"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { business, theme } from "@/config/site";

export function BookingEmbed() {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi({ namespace: business.booking.namespace });
      cal("ui", {
        hideEventTypeDetails: false,
        layout: "month_view",
        theme: "light",
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
            "cal-brand": theme.goldSoft,
          },
        },
      });
    })();
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_30px_80px_-50px_rgba(13,12,10,0.25)]">
      <Cal
        namespace={business.booking.namespace}
        calLink={business.booking.link}
        style={{ width: "100%", minHeight: "720px", height: "100%", overflow: "auto" }}
        config={{ layout: "month_view", theme: "light" }}
      />
    </div>
  );
}
