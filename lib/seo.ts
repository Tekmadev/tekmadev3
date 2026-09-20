import { business, brand, faqs, systemSteps } from "@/config/site";
import { GUIDE_PUBLISHED, type Guide } from "@/lib/content";
import type { CaseStudy } from "@/config/case-studies";
import type { BlogPostWithRefs } from "@/lib/blog-data";

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
  image: `${SITE_URL}${business.privacyOfficer.photo}`,
  sameAs: business.privacyOfficer.profiles.map((p) => p.url),
  jobTitle: "Founder",
  worksFor: { "@id": `${SITE_URL}#organization` },
  url: `${SITE_URL}/about`,
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
  // Canadian owned and operated. Stated as an entity fact, not only an
  // address, so answer engines can resolve "Canadian agency" queries to us.
  foundingLocation: {
    "@type": "Place",
    name: `${business.registeredOffice.city}, ${business.registeredOffice.province}, ${business.registeredOffice.country}`,
    address: postalAddress,
  },
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
  // No aggregateRating here, on purpose. This used to claim 4.9 stars from 40
  // reviews that do not exist anywhere. Google requires review markup to match
  // reviews a visitor can read on the page, ignores self-serving ratings on a
  // business's own site, and can issue a manual action for invented ones. Add
  // it back only with real, visible, attributable reviews behind it.
};

export const offerJsonLd = {
  "@context": "https://schema.org",
  "@type": "Offer",
  "@id": `${SITE_URL}#offer`,
  name: "30 Bookings in 60 Days Guarantee",
  // Says which plans carry the guarantee, because the page does: Convert has
  // none. No validFrom: the old one was derived from the founding year, years
  // before this offer existed, and an invented date is worse than no date.
  description:
    "On the Grow plan and above: if we don't deliver 30 qualified bookings in your first 60 days, we keep working at no additional charge and pause monthly billing until we do. The entry plan, Convert, does not carry the guarantee. Pricing is quoted on a qualification call.",
  itemOffered: { "@id": `${SITE_URL}#service` },
  availability: "https://schema.org/InStock",
  eligibleRegion: areaServedSchema,
  seller: { "@id": `${SITE_URL}#organization` },
};

/**
 * Product + Offer schema for a fixed-scope package (Webline). The Offer price
 * is the one-time build fee; a required monthly plan, when there is one, is a
 * second UnitPriceSpecification billed per month (unitCode MON), so the markup
 * states the full cost. Prices come from the products table so the markup never
 * drifts from checkout.
 */
export function productJsonLd(p: {
  id: string;
  name: string;
  description: string;
  path: string;
  priceCents: number;
  currency: string;
  image?: string;
  features?: string[];
  monthly?: { amountCents: number; name: string } | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${SITE_URL}${p.path}#product`,
    name: p.name,
    description: p.description,
    sku: p.id,
    category: "Website design and development",
    brand: { "@type": "Brand", name: SITE_NAME },
    manufacturer: { "@id": `${SITE_URL}#organization` },
    ...(p.image ? { image: [p.image] } : {}),
    ...(p.features?.length
      ? { additionalProperty: p.features.map((f) => ({ "@type": "PropertyValue", name: "Included", value: f })) }
      : {}),
    offers: {
      "@type": "Offer",
      "@id": `${SITE_URL}${p.path}#offer`,
      url: `${SITE_URL}${p.path}`,
      price: (p.priceCents / 100).toFixed(2),
      priceCurrency: p.currency.toUpperCase(),
      priceSpecification: [
        {
          "@type": "UnitPriceSpecification",
          name: "Build fee",
          price: (p.priceCents / 100).toFixed(2),
          priceCurrency: p.currency.toUpperCase(),
          billingIncrement: 1,
          unitText: "one-time",
        },
        ...(p.monthly
          ? [
              {
                "@type": "UnitPriceSpecification",
                name: p.monthly.name,
                price: (p.monthly.amountCents / 100).toFixed(2),
                priceCurrency: p.currency.toUpperCase(),
                referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
                unitText: "per month",
              },
            ]
          : []),
      ],
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      eligibleRegion: areaServedSchema,
      seller: { "@id": `${SITE_URL}#organization` },
      acceptedPaymentMethod: [
        { "@type": "PaymentMethod", name: "Credit card" },
        { "@type": "PaymentMethod", name: "Afterpay (pay in 4)" },
        { "@type": "PaymentMethod", name: "Klarna (pay in 4)" },
        { "@type": "PaymentMethod", name: "Affirm" },
      ],
    },
  };
}

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
    datePublished: guide.publishedAt ?? GUIDE_PUBLISHED,
    dateModified: guide.updatedAt ?? guide.publishedAt ?? GUIDE_PUBLISHED,
    mainEntityOfPage: `${SITE_URL}${path}`,
    // Every number in the text has a visible origin.
    citation: [...new Set((guide.stats ?? []).map((s) => s.source).filter((s) => /^https?:\/\//i.test(s)))],
  };
}

// ---- Case study schema ----

/**
 * An Article about the client (a LocalBusiness with its own url and city), by
 * the founder, published by us. The share image is the route's own
 * opengraph-image, and each cited survey is listed as a citation so the
 * numbers in the text have a visible origin.
 */
export function caseStudyJsonLd(study: CaseStudy, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${SITE_URL}${path}#article`,
    headline: `${study.h1} ${study.h1Accent}`,
    description: study.metaDescription,
    inLanguage: "en-US",
    isPartOf: { "@id": `${SITE_URL}#website` },
    about: {
      "@type": study.about.types,
      name: study.about.name,
      url: study.about.url,
      address: {
        "@type": "PostalAddress",
        addressLocality: study.about.locality,
        addressRegion: study.about.region,
        addressCountry: study.about.country,
      },
      // A business of ours is said to be ours, so no engine has to infer it.
      ...(study.about.ownedByUs ? { parentOrganization: { "@id": `${SITE_URL}#organization` } } : {}),
    },
    mentions: { "@id": `${SITE_URL}#service` },
    author: { "@id": `${SITE_URL}#founder` },
    publisher: { "@id": `${SITE_URL}#organization` },
    datePublished: study.datePublished,
    dateModified: study.dateModified,
    mainEntityOfPage: `${SITE_URL}${path}`,
    image: [`${SITE_URL}${path}/opengraph-image`],
    ...(study.stats.length
      ? { citation: study.stats.map((s) => ({ "@type": "CreativeWork", name: s.source, url: s.sourceUrl })) }
      : {}),
  };
}

/**
 * openGraph and twitter for a page, complete.
 *
 * In Next a page-level `openGraph` object REPLACES the root one rather than
 * merging with it, so a page that set only a title and url silently lost the
 * share image, the site name and the locale, and a page that set neither
 * shared as the homepage. Nine pages were live that way. Build these two
 * objects here and nothing can be forgotten.
 */
export function socialMeta(opts: { title: string; description: string; url: string; type?: "website" | "article" }) {
  return {
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.url,
      type: opts.type ?? "website",
      siteName: SITE_NAME,
      locale: "en_US",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE_NAME}: ${brand.slogan}` }],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: opts.title,
      description: opts.description,
      images: ["/twitter-image"],
    },
  };
}

/**
 * AboutPage schema. Its whole job is entity clarity: it tells search and AI
 * engines that this URL is the page about the Organization already described
 * in the root layout, rather than describing the company a second time with
 * facts that could drift from the first.
 */
export function aboutPageJsonLd(path: string, name: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${SITE_URL}${path}#webpage`,
    url: `${SITE_URL}${path}`,
    name,
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${SITE_URL}#website` },
    about: { "@id": `${SITE_URL}#organization` },
    mainEntity: { "@id": `${SITE_URL}#organization` },
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

// ---- Blog post schema ----

function absoluteUrl(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  return /^https?:\/\//i.test(src) ? src : `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
}

export function blogPostingJsonLd(post: BlogPostWithRefs, path: string) {
  const image = absoluteUrl(post.cover_image_url ?? post.og_image_url);
  const author = post.author;
  const authorNode = author
    ? {
        "@type": "Person",
        name: author.name,
        ...(author.role ? { jobTitle: author.role } : {}),
        ...(Object.values(author.social ?? {}).length
          ? { sameAs: Object.values(author.social).filter(Boolean) }
          : {}),
      }
    : { "@id": `${SITE_URL}#founder` };

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${SITE_URL}${path}#article`,
    headline: post.meta_title || post.title,
    description: post.meta_description || post.excerpt || undefined,
    ...(image ? { image: [image] } : {}),
    inLanguage: post.locale || "en-US",
    isPartOf: { "@id": `${SITE_URL}#website` },
    author: authorNode,
    publisher: { "@id": `${SITE_URL}#organization` },
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    mainEntityOfPage: `${SITE_URL}${path}`,
    ...(post.category ? { articleSection: post.category.name } : {}),
    ...(post.keywords?.length ? { keywords: post.keywords.join(", ") } : {}),
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
