/**
 * Single source of truth for Tekmadev brand, business info, content data, and theme colors.
 *
 * Change a value here and it propagates everywhere: nav, footer, every section,
 * SEO/JSON-LD schemas, OG image, Cal embed, viewport metadata, manifest, and llms.txt.
 *
 * If you change colors, also update the matching @theme block in app/globals.css
 * (Tailwind reads CSS variables; this TS mirror is only for non-CSS contexts).
 */

// Module-local helpers so the same string is reused inside objects below.
const _email = "hi@tekmadev.com";
const _legalEmail = "info@tekmadev.com";
const _phoneTel = "+18669661988";
const _phoneDisplay = "1-866-966-1988";
const _phonePretty = "+1 (866) 966-1988";
const _phoneSchema = "+1-866-966-1988";
const _calLink = "callline/startbooking";
const _calNamespace = "startbooking";
const _calUrl = `https://cal.com/${_calLink}`;
// www, not the bare domain. tekmadev.com answers with a redirect to www, so a
// canonical, sitemap entry or schema @id on the bare domain points search
// engines at a URL that is never the final one. `business.domain` below stays
// "tekmadev.com": that is how the name is written, not where pages live.
const _siteUrl = "https://www.tekmadev.com";
const _portalHost = "account.tekmadev.com";

/**
 * Client portal. Served by this same app on a dedicated subdomain: the proxy
 * rewrites `account.tekmadev.com/<path>` to the internal `/portal/<path>`
 * routes. Locally the portal runs at `account.localhost:3000` (browsers
 * resolve *.localhost to the loopback address without any hosts-file edit).
 */
export const portal = {
  host: _portalHost,
  url: `https://${_portalHost}`,
  devHost: "account.localhost",
  /** Internal route prefix the proxy rewrites to. Never appears in client URLs. */
  internalPrefix: "/portal",
  /** Booking link for the onboarding kickoff call. */
  kickoffCalUrl: _calUrl,
  /**
   * Identifiers clients add when granting delegated access. Fill these in as
   * the agency accounts exist; the portal shows them in the access steps.
   */
  agencyAccess: {
    email: _email,
    metaBusinessId: "",
    googleAdsManagerId: "",
  },
};

const _office = {
  line1: "40 Courtland Ave",
  city: "Hamilton",
  province: "Ontario",
  country: "Canada",
  postalCode: "L9B 1X6",
};

export const business = {
  name: "Tekmadev",
  legalName: "Tekmadev Innovation Inc.",
  domain: "tekmadev.com",
  url: _siteUrl,
  description:
    "Done-for-you AI and automation growth system for B2B service businesses. We install the system that fills your calendar with qualified, ready-to-buy appointments. Our guarantee: 30 qualified appointments in your first 60 days, or we keep working free until you hit it.",
  foundingYear: 2019,
  email: _email,
  legalEmail: _legalEmail,
  registeredOffice: _office,
  jurisdictions: {
    primary: "Ontario, Canada",
  },
  privacyOfficer: {
    name: "Kazi Shajeedul Islam",
    title: "Founder and Privacy Officer",
    email: _legalEmail,
  },
  legalDates: {
    effective: "2026-05-16",
    lastUpdated: "2026-09-18",
  },
  phone: {
    tel: _phoneTel,
    display: _phoneDisplay,
    pretty: _phonePretty,
    schemaOrg: _phoneSchema,
  },
  booking: {
    link: _calLink,
    namespace: _calNamespace,
    url: _calUrl,
  },
  areasServed: [
    { type: "Country" as const, name: "Canada", code: "CA" },
    { type: "Country" as const, name: "United States", code: "US" },
    { type: "Place" as const, name: "Europe", code: "EU" },
  ],
  languages: ["English", "French"],
  social: { twitter: "@tekmadev" },
};

/**
 * Canadian ownership, written once and read by the badge component, the
 * footer, llms.txt, and the JSON-LD. Incorporated in Ontario, founder and
 * team in Canada, work done in Canada: the claim is about who builds it, not
 * only where the invoice is issued, so keep it accurate if that ever changes.
 */
export const canadian = {
  short: "Proudly Canadian",
  label: "100% Canadian owned and operated",
  place: `${_office.city}, ${_office.province}`,
  long: `${business.legalName} is a Canadian company, 100% Canadian owned and operated. Incorporated in ${_office.province} and run from ${_office.city}, ${_office.province}. Every system we build is designed, built, and supported in Canada.`,
};

export const brand = {
  slogan: "30 Booked Appointments In 60 Days. Or You Don't Pay.",
  subhead:
    "Done-for-you AI + automation growth system. We fill your calendar with qualified appointments. Or you don't pay.",
  audience: "B2B service businesses doing $5K to $50K/mo in revenue",
  keywords: [
    "B2B lead generation",
    "AI appointment booking",
    "AI automation agency",
    "appointment setting service",
    "done-for-you growth system",
    "performance-based agency",
    "performance-based marketing",
    "AI voice agent",
    "lead conversion system",
    "calendar booking automation",
    "web development agency",
    "app development agency",
    "AI development agency",
    "marketing automation implementation",
    "CRM automation",
    "missed call text back",
    "lead follow-up automation",
    "Tekmadev",
  ],
  knowsAbout: [
    "AI appointment booking",
    "Lead generation automation",
    "B2B growth systems",
    "AI voice agents",
    "Web development",
    "Mobile app development",
    "AI development",
    "Performance-based marketing",
    "Marketing automation implementation",
    "CRM automation",
  ],
  promises: [
    "30 qualified appointments in your first 60 days.",
    "If we miss it, we work for free until you hit it.",
    "If the system stops booking, we stop billing.",
    "Cancel any month. No long-term contract.",
  ],
};

/**
 * Mirror of the @theme block in app/globals.css (light) and the `html.dark`
 * block (dark). Tailwind utilities still read the CSS vars; these objects are
 * only for places that cannot read CSS vars: Cal embed cssVarsPerTheme, OG
 * image, viewport.themeColor, and manifest theme_color.
 *
 * If you change a color, update BOTH this file and the matching block in
 * app/globals.css so the two stay in sync.
 */
export const theme = {
  bg: "#f5f2eb",
  bg2: "#fbf9f4",
  bg3: "#ede9de",
  surface: "#ffffff",

  ink: "#0d0c0a",
  ink2: "#2a2722",
  ink3: "#5a564d",
  ink4: "#8a857a",
  ink5: "#b0aca2",

  line: "rgba(13,12,10,0.08)",
  lineStrong: "rgba(13,12,10,0.14)",
  lineSoft: "rgba(13,12,10,0.05)",

  gold: "#a17a4f",
  goldDeep: "#7a5b3a",
  goldMid: "#b79368",
  goldSoft: "#dcc399",
  goldTint: "#f4ebd6",

  signal: "#b8392c",
};

export const themeDark: typeof theme = {
  bg: "#0e0d0b",
  bg2: "#16140f",
  bg3: "#080706",
  surface: "#1a1712",

  ink: "#f4f0e8",
  ink2: "#d6d0c4",
  ink3: "#a39d8f",
  ink4: "#78736a",
  ink5: "#56524b",

  line: "rgba(244,240,232,0.1)",
  lineStrong: "rgba(244,240,232,0.16)",
  lineSoft: "rgba(244,240,232,0.06)",

  gold: "#c89c65",
  goldDeep: "#a8814f",
  goldMid: "#d7b07a",
  goldSoft: "#e8d1a6",
  goldTint: "#221b10",

  signal: "#d8503f",
};

export const heroStats = [
  { label: "Systems installed", value: "40+" },
  { label: "Avg response time", value: "11s" },
  { label: "Live in", value: "14 days" },
];

export const aggregateStats = [
  { label: "Avg lift in booked appointments", value: "3.2×" },
  { label: "Avg time to live", value: "13 days" },
  { label: "Avg lead response time", value: "11s" },
  { label: "Clients running 12+ months", value: "94%" },
];

export type ProofWin = {
  industry: string;
  company: string;
  url?: string; // client site; when set, the company name links out (backlink)
  metric: number;
  prefix?: string;
  suffix: string;
  framing: string;
  before: string;
  after: string;
  note: string;
};

export const proofWins: ProofWin[] = [
  {
    industry: "Auto Detailing",
    company: "Down2Detail",
    url: "https://down2detail.ca",
    metric: 480,
    prefix: "+",
    suffix: "%",
    framing: "Monthly booked jobs",
    before: "9 jobs / mo",
    after: "52 jobs / mo",
    note: "42 days from kickoff",
  },
  {
    industry: "Interlock & Hardscaping",
    company: "Stoneworks Interlock",
    url: "https://stoneworksinterlock.com",
    metric: 288,
    prefix: "+",
    suffix: "%",
    framing: "Monthly revenue",
    before: "$8K / mo",
    after: "$31K / mo",
    note: "5 months in",
  },
  {
    industry: "Auto Locksmith",
    company: "KeyFoby",
    url: "https://keyfoby.com",
    metric: 1100,
    prefix: "+",
    suffix: "%",
    framing: "Weekly call volume",
    before: "2 to 3 calls / wk",
    after: "30+ calls / wk",
    note: "Live in 12 days",
  },
];

export type SystemStep = {
  n: string;
  label: string;
  title: string;
  body: string;
  spec: string;
};

export const systemSteps: SystemStep[] = [
  {
    n: "01",
    label: "Diagnose",
    title: "We audit your pipeline live.",
    body: "A 45-minute call where we map every leak: missed calls, slow replies, dead follow-ups. If we can't 10x your conversion, we say so.",
    spec: "Day 0 · 45 minutes",
  },
  {
    n: "02",
    label: "Build",
    title: "We build the system in our lab.",
    body: "AI voice agent trained on your offer. 12-touch follow-up written for your industry. CRM wired to your existing tools.",
    spec: "Day 1 to 7",
  },
  {
    n: "03",
    label: "Install",
    title: "Phones forward. System goes live.",
    body: "Calls answered 24/7. Leads replied in 11 seconds. Appointments hitting your calendar from day one.",
    spec: "Day 8 to 14",
  },
  {
    n: "04",
    label: "Scale",
    title: "We tune. Your calendar fills.",
    body: "Daily monitoring. Weekly optimization. Goal: 30 qualified appointments a month on autopilot.",
    spec: "Day 15+",
  },
];

export const whatItIs = {
  isNot: [
    "A website agency",
    "A retainer-based shop",
    "An hourly freelancer",
    "A tool vendor",
  ],
  isYes: [
    "A done-for-you booking system",
    "Tied to outcomes, not activity",
    "Live in 14 days, owned by you",
    "One team, one dashboard, one number",
  ],
};

export type FAQ = { q: string; a: string };

export const faqs: FAQ[] = [
  {
    q: "What does “30 booked appointments in 60 days or you don’t pay” actually mean?",
    a: "Exactly what it says. We build and install the system, then go to work filling your calendar. If you don’t have 30 qualified appointments on your calendar within 60 days of go-live, we keep working for free and pause your monthly billing until you do. A sales call, a quote, a site visit, a consult: if it is a real prospect who booked through the system we built, it counts. You keep everything we’ve built either way. “Qualified” is defined together upfront.",
  },
  {
    q: "How is this different from an agency?",
    a: "An agency sells you ads, content, and reports. A freelancer sells you hours. We sell you booked appointments. Different unit of value, different incentive. We only make money when your calendar fills.",
  },
  {
    q: "What if I don’t have enough leads coming in yet?",
    a: "We add the lead engine. AI-qualified landing page, ad funnel, and outbound automation feed the system from day one. We don’t install on top of nothing.",
  },
  {
    q: "How long until the system is live?",
    a: "14 days from kickoff in 90% of cases. Regulated or multi-location industries can take up to 21. We’ll tell you on the audit call.",
  },
  {
    q: "Who runs the system after install?",
    a: "We do. This is done-for-you, not done-with-you. We monitor the dashboard daily, tune scripts weekly, report monthly. You show up to the appointments.",
  },
  {
    q: "What’s the tech stack, and do I own it?",
    a: "We build on a proprietary growth stack: a custom AI voice agent layer, our automation and CRM engine, Next.js funnels, and integrations to your existing tools. You own the stack. If you ever leave, the system stays with you.",
  },
];

export type TrustSignal = {
  iconName: "Clock" | "ShieldCheck" | "Zap";
  text: string;
};

export const trustSignals: TrustSignal[] = [
  { iconName: "Clock", text: "45 minutes · zero pressure" },
  { iconName: "ShieldCheck", text: "No retainer until appointments book" },
  { iconName: "Zap", text: "System live in 14 days if you move forward" },
];

/**
 * The product line-up behind the nav dropdown. Every offer Tekmadev sells is
 * a "line" you switch on, hence Webline, Callline, GASline.
 *
 * An item with no `href` renders as coming soon: shown, dimmed, not clickable.
 * Add the href (and a blurb) the day it ships and it becomes a live link with
 * no other change.
 *
 * `hidden` keeps an item in this list but out of the menu, for products we are
 * not announcing yet. Callline and GASline are hidden until they are ready to
 * be talked about: drop the flag to bring one back as coming soon, or give it
 * an href to make it live.
 *
 * Note on the Growth System: it points at the public offer section, never at
 * /start. Prices stay private and quoted on a qualification call, so /start
 * is noindex and must not be linked from anywhere public.
 */
export type NavProduct = {
  name: string;
  /** Omit for coming soon. */
  href?: string;
  /** Not rendered at all. For products that are not announced yet. */
  hidden?: boolean;
  /** One line, benefit first. Optional while a product is unannounced. */
  blurb?: string;
  badge?: string;
};

export const productNav: { label: string; blurb: string; items: NavProduct[] } =
  {
    label: "What we build",
    blurb:
      "One system per problem. Buy the piece you need now, add the rest when you are ready.",
    items: [
      {
        name: "Growth System",
        href: "/#pricing",
        blurb:
          "The full engine. Every call answered, every lead chased, 30 booked appointments in 60 days or you don't pay.",
        badge: "Flagship",
      },
      {
        name: "Webline",
        href: "/webline",
        blurb:
          "A startup website that ranks on Google and gets cited by AI. Live in 14 days, pay in 4 if you want.",
        badge: "New",
      },
      { name: "Callline", badge: "Coming soon", hidden: true },
      { name: "GASline", badge: "Coming soon", hidden: true },
    ],
  };

export const navLinks = [
  { href: "/#system", label: "The System" },
  { href: "/#proof", label: "Proof" },
  { href: "/tools", label: "Free tools" },
  { href: "/guides", label: "Guides" },
  { href: "/#faq", label: "FAQ" },
];

/**
 * Advertising measurement. The pixel id is public (it is in the page source of
 * any site that uses one); the Conversions API token is not, and lives only in
 * META_CAPI_ACCESS_TOKEN. Nothing here runs without the visitor's consent:
 * see lib/consent.ts.
 */
export const tracking = {
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || "1636634394735845",
  /** The pixel fires on the live marketing site only, never the portal, a preview or localhost. */
  metaHosts: ["tekmadev.com", "www.tekmadev.com"],
  /** Set NEXT_PUBLIC_META_PIXEL_DEBUG=1 to let it run on localhost while testing. */
  metaDebug: process.env.NEXT_PUBLIC_META_PIXEL_DEBUG === "1",
};

/** The cookie banner. Accept and Decline carry equal weight by design. */
export const consentCopy = {
  title: "Cookies for our ads, if you are okay with it",
  body: "The site works the same either way. If you accept, we use a Meta cookie to measure our ads and show them to people like you. Nothing loads until you choose.",
  policyLabel: "Cookie Policy",
  accept: "Accept",
  decline: "Decline",
  settingsLabel: "Cookie settings",
};

/**
 * The client login entry in the nav. It sits apart from the page links because
 * it leaves the marketing site for the portal subdomain; the URL is computed
 * per environment by portalOrigin() so local dev lands on account.localhost.
 */
export const portalNav = {
  label: "Client login",
  hint: "Your onboarding, approvals, bookings and billing",
};

export const footerColumns = [
  {
    label: "Tekmadev",
    items: [
      { label: "About", href: "/about" },
      { label: "The System", href: "/#system" },
      { label: "Proof", href: "/#proof" },
      { label: "Case studies", href: "/case-studies" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Webline for startups", href: "/webline" },
      { label: "Free tools", href: "/tools" },
      { label: "Guides", href: "/guides" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    label: "Connect",
    items: [
      { label: "Book a call", href: "/#book" },
      { label: "Email us", href: `mailto:${_email}` },
      { label: "Call us", href: `tel:${_phoneTel}` },
      { label: "Client login", href: `https://${_portalHost}` },
      { label: "Create a free account", href: `https://${_portalHost}/signup` },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Cookies", href: "/cookies" },
    ],
  },
];

export const footerCopy = {
  tagline:
    "We install the system that fills your calendar. 30 qualified appointments in 60 days, or we work free until you hit it.",
  signoff: "Built · Installed · Running",
};

export const newsletterCopy = {
  eyebrow: "The Growth Memo",
  title: "The plays that fill calendars, in your inbox.",
  blurb:
    "One or two emails a month on AI, automation, and the exact system we use to book 30 qualified appointments in 60 days. No fluff. Unsubscribe anytime.",
  cta: "Subscribe",
  placeholder: "you@company.com",
  disclaimer:
    "Join for the growth playbook. We never share your email, and you can unsubscribe in one click.",
};

/**
 * The unsubscribe page, reached from the link in a newsletter.
 *
 * The first screen is allowed to make the case for staying: it reminds people
 * what they get for free. It is never allowed to get in the way. Both buttons
 * are the same size, leaving takes one click, and nothing here shames the
 * person for going. CASL requires an unsubscribe that is "readily performed",
 * so keep it that way when editing. `{email}` is swapped for the masked address.
 */
export const unsubscribeCopy = {
  eyebrow: "The Growth Memo",
  confirm: {
    title: "You're about to switch off the free part.",
    lead: "Clients pay us to install these plays. You get them for nothing: what is working right now to win more leads, follow up faster, and grow a business like yours.",
    points: [
      "The same growth plays we build for paying clients",
      "Business knowledge you can put to work the same week",
      "One or two emails a month. Never spam.",
    ],
    nudge:
      "We put real work into every memo and never ask for a cent. If it still isn't for you, no hard feelings. One click below and you're out.",
    stay: "Keep my free growth plays",
    leave: "Unsubscribe me",
    address: "This will unsubscribe {email}",
  },
  stay: {
    title: "Good call.",
    body: "You're still on the list. The next Growth Memo comes straight to your inbox, free as always.",
  },
  done: {
    title: "You're unsubscribed.",
    body: "We took {email} off the Growth Memo. You won't get any more marketing emails from us.",
    reasonPrompt: "Mind telling us why? It's optional, and it helps.",
    reasonThanks: "Thanks. That helps us make the memo better.",
    mistake: "Unsubscribed by mistake?",
    resubscribe: "Put me back on the list",
  },
  back: {
    title: "Welcome back.",
    body: "You're on the Growth Memo again. Same deal as before: free, useful, and one click to leave.",
  },
  invalid: {
    title: "Link not recognized",
    body: "This unsubscribe link is invalid or has expired. If you keep getting emails, reply to any of them and we'll remove you.",
    cta: "Email us to unsubscribe",
  },
  error: {
    title: "Something went wrong",
    body: "We couldn't process that just now. Please try again in a moment.",
  },
  home: "Back to tekmadev.com",
  /** Keys are stored in subscribers.unsubscribe_reason. Add freely, never rename. */
  reasons: [
    { key: "too_many", label: "Too many emails" },
    { key: "not_relevant", label: "Not relevant to me" },
    { key: "never_signed_up", label: "I never signed up" },
    { key: "other", label: "Something else" },
  ],
} as const;
