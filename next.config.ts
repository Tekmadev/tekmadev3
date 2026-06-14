import type { NextConfig } from "next";

/**
 * Content-Security-Policy. Allowlists exactly the third parties we load:
 *  - Cal.com (booking embed: script + iframe + API)
 *  - PostHog (cookieless analytics: assets + ingest, US + EU hosts)
 *  - Vercel Analytics (same-origin /_vercel/insights + vitals host)
 *  - Stripe (checkout: js + iframe + form post) — preloaded for the pricing flow
 * Fonts are self-hosted by next/font, so no Google Fonts host is needed.
 * 'unsafe-inline' is required for the pre-paint theme script, JSON-LD blocks,
 * Next.js hydration scripts, and Tailwind/Framer inline styles.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://app.cal.com https://*.cal.com https://js.stripe.com https://us-assets.i.posthog.com https://us.i.posthog.com https://eu-assets.i.posthog.com https://eu.i.posthog.com",
  "connect-src 'self' https://*.cal.com https://us.i.posthog.com https://us-assets.i.posthog.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.posthog.com https://vitals.vercel-insights.com https://*.vercel-insights.com",
  "frame-src 'self' https://*.cal.com https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
  "form-action 'self' https://checkout.stripe.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Baseline security headers applied to every response.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  // Force HTTPS for 2 years on this domain and all subdomains. `preload` makes
  // the domain eligible for the browser HSTS preload list at hstspreload.org.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Stop browsers from MIME-sniffing responses (defends against attackers
  // smuggling executable content disguised as an image, for example).
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // Never allow this site to be embedded in an iframe (clickjacking defense).
  // Modern browsers also accept CSP `frame-ancestors`; X-Frame-Options is kept
  // for older browser coverage.
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // When navigating off-site, only send the origin (not the full URL with query
  // strings or paths). Protects internal route names and UTM data from leaking.
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // Disable browser features we do not use. If a script (ours or injected)
  // tries to access these APIs, the browser blocks it.
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "interest-cohort=()",
      "browsing-topics=()",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
