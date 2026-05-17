import { business, brand, faqs, systemSteps } from "@/config/site";

export const SITE_URL = business.url;
export const SITE_NAME = business.name;
export const LEGAL_NAME = business.legalName;
export const SITE_DESCRIPTION = business.description;

const areaServedSchema = business.areasServed.map((a) => ({
  "@type": a.type,
  name: a.name,
}));

const areaServedCodes = business.areasServed.map((a) => a.code);

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}#organization`,
  name: SITE_NAME,
  legalName: LEGAL_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo/TMD2_logo.svg`,
  description: SITE_DESCRIPTION,
  foundingDate: String(business.foundingYear),
  slogan: brand.slogan,
  knowsAbout: brand.knowsAbout,
  areaServed: areaServedSchema,
  telephone: business.phone.schemaOrg,
  email: business.email,
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
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: String(brand.rating.value),
    reviewCount: String(brand.rating.reviews),
    bestRating: "5",
    worstRating: "1",
  },
};

export const offerJsonLd = {
  "@context": "https://schema.org",
  "@type": "Offer",
  "@id": `${SITE_URL}#offer`,
  name: "30 Booked Calls in 60 Days Guarantee",
  description:
    "Performance-based engagement: $0 setup, pay-per-booked-call pricing. If we don't deliver 30 qualified booked calls in your first 60 days, you don't pay.",
  itemOffered: { "@id": `${SITE_URL}#service` },
  priceSpecification: {
    "@type": "PriceSpecification",
    priceCurrency: "USD",
    price: "0",
    description: "$0 setup. Performance-based pricing. Pay per qualified booked call delivered.",
  },
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
