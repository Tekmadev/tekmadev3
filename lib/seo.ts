import { business, brand, faqs, systemSteps } from "@/config/site";
import { GUIDE_PUBLISHED, type Guide } from "@/lib/content";

export const SITE_URL = business.url;
export const SITE_NAME = business.name;
export const LEGAL_NAME = business.legalName;
export const SITE_DESCRIPTION = business.description;

const areaServedSchema = business.areasServed.map((a) => ({
  "@type": a.type,
  name: a.name,
}));

const areaServedCodes = business.areasServed.map((a) => a.code);

const postalAddress = {
  "@type": "PostalAddress",
  streetAddress: business.registeredOffice.line1,
  addressLocality: business.registeredOffice.city,
  addressRegion: "ON",
  postalCode: business.registeredOffice.postalCode,
  addressCountry: "CA",
};

// Built from the declared social handle so it stays in sync with config/site.ts.
const sameAs = [`https://x.com/${business.social.twitter.replace(/^@/, "")}`];

export const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${SITE_URL}#founder`,
  name: business.privacyOfficer.name,
  jobTitle: "Founder",
  worksFor: { "@id": `${SITE_URL}#organization` },
  url: SITE_URL,
};

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": ["Organization", "ProfessionalService"],
  "@id": `${SITE_URL}#organization`,
  name: SITE_NAME,
  legalName: LEGAL_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo/TMD2_logo.svg`,
  image: `${SITE_URL}/images/logo/TMD2_logo.svg`,
  description: SITE_DESCRIPTION,
  foundingDate: String(business.foundingYear),
  founder: { "@id": `${SITE_URL}#founder` },
  slogan: brand.slogan,
  knowsAbout: brand.knowsAbout,
  areaServed: areaServedSchema,
  address: postalAddress,
  telephone: business.phone.schemaOrg,
  email: business.email,
  sameAs,
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: business.phone.schemaOrg,
      email: business.email,
      availableLanguage: business.languages,
      areaServed: areaServedCodes,
    },
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: business.phone.schemaOrg,
      email: business.email,
      availableLanguage: business.languages,
    },
  ],
};

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}#website`,
  url: SITE_URL,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  publisher: { "@id": `${SITE_URL}#organization` },
  inLanguage: "en-US",
};

export const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": `${SITE_URL}#service`,
  serviceType: "AI Appointment Conversion System",
  name: `${SITE_NAME} Growth System`,
  description:
    "Done-for-you AI and automation system that answers every call 24/7, replies to leads in 11 seconds, runs 12-touch follow-up sequences, and books qualified appointments directly onto your calendar.",
  provider: { "@id": `${SITE_URL}#organization` },
  areaServed: areaServedSchema,
  audience: {
    "@type": "BusinessAudience",
    audienceType: brand.audience,
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: `${SITE_NAME} Growth System components`,
    itemListElement: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "24/7 AI voice agent" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Instant lead reply (SMS + email)" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "12-touch automated follow-up" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Unified CRM + dashboard" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Lead engine (web + AI funnel)" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Live ops and optimization" } },
    ],
  },
};

export const offerJsonLd = {
  "@context": "https://schema.org",
  "@type": "Offer",
  "@id": `${SITE_URL}#offer`,
  name: "30 Booked Calls in 60 Days Guarantee",
  description:
    "Performance-based engagement: a one-time setup fee plus a recurring monthly fee, with pricing shared on a qualification call. If we don't deliver 30 qualified booked calls in your first 60 days, you get that period's recurring monthly service fees back as your sole remedy, excluding the one-time setup fee and taxes. Individual results vary and are not typical.",
  itemOffered: { "@id": `${SITE_URL}#service` },
  availability: "https://schema.org/InStock",
  validFrom: `${business.foundingYear}-01-01`,
  eligibleRegion: areaServedSchema,
  seller: { "@id": `${SITE_URL}#organization` },
};

export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.a,
    },
  })),
};

export const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: `How ${SITE_NAME} installs the Growth System in 14 days`,
  description:
    "The Tekmadev process for installing a complete AI appointment conversion and lead automation system: audit, build, install, scale.",
  totalTime: "P14D",
  step: systemSteps.map((s, i) => ({
    "@type": "HowToStep",
    position: i + 1,
    name: `${s.label} (${s.spec})`,
    text: s.body,
  })),
};

export const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL,
    },
  ],
};

// ---- Guide (pillar/cluster) page schema builders ----

export function guideArticleJsonLd(guide: Guide, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${SITE_URL}${path}#article`,
    headline: guide.h1,
    description: guide.metaDescription,
    inLanguage: "en-US",
    isPartOf: { "@id": `${SITE_URL}#website` },
    about: { "@id": `${SITE_URL}#service` },
    author: { "@id": `${SITE_URL}#founder` },
    publisher: { "@id": `${SITE_URL}#organization` },
    datePublished: GUIDE_PUBLISHED,
    dateModified: GUIDE_PUBLISHED,
    mainEntityOfPage: `${SITE_URL}${path}`,
  };
}

export function faqPageJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function crumbsJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
