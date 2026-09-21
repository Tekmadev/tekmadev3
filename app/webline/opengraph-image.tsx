import { ImageResponse } from "next/og";
import { business, theme } from "@/config/site";
import { webline, WEBLINE_ID } from "@/config/webline";
import { WEBLINE_LIVE_DAYS } from "@/config/webline-delivery";
import { getDisplayProduct } from "@/lib/products-data";
import { formatMoney } from "@/lib/money";

export const alt = `Webline by ${business.name}: ${webline.meta.description}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const product = await getDisplayProduct(WEBLINE_ID);
  const price = product ? formatMoney(product.amount, product.currency) : "";
  const installment = product ? formatMoney(product.installment, product.currency, { cents: true }) : "";
  const monthly = product?.monthly ? formatMoney(product.monthly.amount, product.currency) : "";

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
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 32, fontWeight: 800, letterSpacing: -0.8 }}>
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
              background: theme.goldTint,
              color: theme.goldDeep,
              fontSize: 16,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Webline · for startups
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3.5, lineHeight: 0.95, display: "flex", flexDirection: "column" }}>
            <span>A startup website</span>
            <span>that gets found.</span>
            <span style={{ color: theme.goldDeep }}>Live within {WEBLINE_LIVE_DAYS} days.</span>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: theme.ink3, lineHeight: 1.3, maxWidth: 900 }}>
            {`SEO, GEO, and AEO built in. ${price ? `${price} to build, or 4 × ${installment} with Afterpay or Klarna.${monthly ? ` Hosting and care ${monthly}/mo.` : ""}` : "Pay in 4 with Afterpay or Klarna."}`}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 20, color: theme.ink3 }}>
          <span>{`${business.domain}/webline`}</span>
          <span>Custom design · 5 pages · copy written for you · you own it</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
