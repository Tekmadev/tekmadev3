import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { PublicChrome } from "@/components/PublicChrome";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { NavProgress } from "@/components/NavProgress";
import { getLoaderSettings } from "@/lib/site-settings";
import { loaderCssVars } from "@/config/loader";
import { organizationJsonLd, personJsonLd, websiteJsonLd } from "@/lib/seo";
import { brand, business, theme, themeDark } from "@/config/site";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistDisplay = Geist({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["700", "800", "900"],
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: theme.bg },
    { media: "(prefers-color-scheme: dark)", color: themeDark.bg },
  ],
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(business.url),
  title: {
    default: `${business.name}. ${brand.slogan}`,
    template: `%s · ${business.name}`,
  },
  description: business.description,
  applicationName: business.name,
  authors: [{ name: business.legalName, url: business.url }],
  generator: "Next.js",
  publisher: business.legalName,
  creator: business.legalName,
  category: "Business Services",
  keywords: [...brand.keywords],
  // No canonical here on purpose. A default at the root is inherited by every
  // page that forgets its own, which quietly told Google that the 404 page, the
  // login page and anything new were copies of the homepage. Each page sets its
  // own. No hreflang either: one language, one URL.
  formatDetection: { email: false, address: false, telephone: false },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: business.name,
    url: business.url,
    title: brand.slogan,
    description: brand.subhead,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: brand.slogan,
    description: brand.subhead,
    creator: business.social.twitter,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [
      { rel: "android-chrome", url: "/android-chrome-192x192.png", sizes: "192x192" },
      { rel: "android-chrome", url: "/android-chrome-512x512.png", sizes: "512x512" },
    ],
  },
  manifest: "/manifest.webmanifest",
  referrer: "origin-when-cross-origin",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The loader's look, tuned in Admin, Loader. Cached, never a per-visit read.
  const loader = loaderCssVars(await getLoaderSettings());
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistDisplay.variable} ${geistMono.variable}`}
      style={loader as React.CSSProperties}
    >
      <body className="bg-bg text-ink antialiased">
        {/* Set theme before paint to avoid a flash. Default is light; only
            applies dark if the visitor previously chose it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
        <JsonLd data={organizationJsonLd} />
        <JsonLd data={personJsonLd} />
        <JsonLd data={websiteJsonLd} />
        {/* useSearchParams needs a boundary, or every static page would render on the client. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
        <PublicChrome />
        <SiteAnalytics />
      </body>
    </html>
  );
}
