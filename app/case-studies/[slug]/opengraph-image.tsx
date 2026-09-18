import { ImageResponse } from "next/og";
import { business, theme } from "@/config/site";
import { CASE_STUDIES_PATH, getCaseStudy, publishedCaseStudies } from "@/config/case-studies";

export const alt = `A ${business.name} case study`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return publishedCaseStudies().map((c) => ({ slug: c.slug }));
}

/** Same frame as the Webline share card, with the study's three lines. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  const lines = study?.og.lines ?? ["Real businesses.", "Real results.", "No projections."];
  const footer = study?.og.footer ?? "Case studies";
  const pill = study ? `Case study · ${study.location}` : "Case studies";

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
            {pill}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3.5, lineHeight: 0.95, display: "flex", flexDirection: "column" }}>
            <span>{lines[0]}</span>
            <span>{lines[1]}</span>
            <span style={{ color: theme.goldDeep }}>{lines[2]}</span>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: theme.ink3, lineHeight: 1.3, maxWidth: 900 }}>
            {footer}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 20, color: theme.ink3 }}>
          <span>{`${business.domain}${CASE_STUDIES_PATH}${study ? `/${study.slug}` : ""}`}</span>
          <span>Real results · no projections · Canadian owned</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
