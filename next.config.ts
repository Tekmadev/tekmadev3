import type { NextConfig } from "next";

/**
 * Baseline security headers applied to every response.
 * Content-Security-Policy is intentionally NOT set here yet, because it needs
 * to be tuned against the live deployment (Cal.com, Google Fonts, OG images,
 * Vercel Analytics when added) to avoid false-positive blocks.
 */
const securityHeaders = [
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
