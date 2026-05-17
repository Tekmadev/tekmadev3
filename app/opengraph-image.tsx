import { ImageResponse } from "next/og";
import { brand, business, theme } from "@/config/site";

export const alt = `${business.name}. ${brand.slogan} ${brand.subhead}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: `radial-gradient(closest-side at 70% 30%, ${theme.goldSoft}33, transparent 60%), radial-gradient(closest-side at 20% 80%, ${theme.goldMid}26, transparent 65%), ${theme.bg}`,
          color: theme.ink,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          fontFamily: "Geist, Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: -0.8,
              color: theme.ink,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: `linear-gradient(180deg, ${theme.goldSoft} 0%, ${theme.gold} 100%)`,
              }}
            />
            {business.name}
          </div>
          <div
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: `1px solid ${theme.gold}55`,
              background: `${theme.goldTint}`,
              color: theme.goldDeep,
              fontSize: 16,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Performance-based
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: -3,
              lineHeight: 1.02,
              color: theme.ink,
            }}
          >
            30 Booked Calls In 60 Days.
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: -3,
              lineHeight: 1.02,
              backgroundImage: `linear-gradient(135deg, ${theme.gold} 0%, ${theme.goldDeep} 100%)`,
              backgroundClip: "text",
              color: "transparent",
              marginTop: 6,
            }}
          >
            Or You Don&apos;t Pay.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: theme.ink3,
            fontSize: 22,
          }}
        >
          <span>Done-for-you AI + automation growth system for B2B service businesses</span>
          <span style={{ color: theme.goldDeep }}>{business.domain}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
