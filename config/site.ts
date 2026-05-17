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
const _siteUrl = "https://tekmadev.com";

export const business = {
  name: "Tekmadev",
  legalName: "Tekmadev Innovation Inc.",
  domain: "tekmadev.com",
  url: _siteUrl,
  description:
    "Done-for-you AI and automation growth system for B2B service businesses. We install the system that fills your calendar with 30 qualified booked calls in 60 days. Performance-based. You only pay when it performs.",
  foundingYear: 2019,
  email: _email,
  legalEmail: _legalEmail,
  registeredOffice: {
    line1: "40 Courtland Ave",
    city: "Hamilton",
    province: "Ontario",
    country: "Canada",
    postalCode: "L9B 1X6",
  },
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
    lastUpdated: "2026-05-16",
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

export const brand = {
  slogan: "30 Booked Calls In 60 Days. Or You Don't Pay.",
  subhead:
    "Done-for-you AI + automation growth system. We fill your calendar with qualified B2B calls. Or you don't pay.",
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
    "GoHighLevel implementation",
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
    "GoHighLevel implementation",
    "CRM automation",
  ],
  promises: [
    "30 qualified booked calls in your first 60 days.",
    "If we miss it, we work for free until you hit it.",
    "If the system stops booking, we stop billing.",
    "Cancel any month. No long-term contract.",
  ],
  rating: { value: 4.9, reviews: 40 },
};

/**
 * Mirror of the @theme block in app/globals.css.
 * Tailwind utilities still read the CSS vars; this object is only for
 * places that cannot read CSS vars: Cal embed cssVarsPerTheme, OG image,
 * viewport.themeColor, and manifest theme_color.
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

export const heroStats = [
  { label: "Systems installed", value: "40+" },
  { label: "Avg response time", value: "11s" },
  { label: "Live in", value: "14 days" },
];

export const aggregateStats = [
  { label: "Avg lift in booked calls", value: "3.2×" },
  { label: "Avg time to live", value: "13 days" },
  { label: "Avg lead response time", value: "11s" },
  { label: "Clients running 12+ months", value: "94%" },
];

export type ProofWin = {
  industry: string;
  company: string;
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
    metric: 480,
    prefix: "+",
    suffix: "%",
    framing: "Monthly booked jobs",
    before: "9 jobs / mo",
    after: "52 jobs / mo",
    note: "42 days from kickoff",
  },
  {
    industry: "Home Services",
    company: "Carpet Masters",
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
    body: "Daily monitoring. Weekly optimization. Goal: 30 qualified booked calls a month on autopilot.",
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
    q: "What does “30 booked calls in 60 days or you don’t pay” actually mean?",
    a: "Exactly what it says. You sign on with $0 down. We build and install the system. If you don’t have 30 qualified booked calls on your calendar within 60 days of go-live, you owe us nothing, and we keep working until you do. “Qualified” is defined together upfront.",
  },
  {
    q: "How is this different from an agency?",
    a: "An agency sells you ads, content, and reports. A freelancer sells you hours. We sell you booked calls. Different unit of value, different incentive. We only make money when your calendar fills.",
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
    a: "We do. This is done-for-you, not done-with-you. We monitor the dashboard daily, tune scripts weekly, report monthly. You show up to the booked calls.",
  },
  {
    q: "What’s the tech stack, and do I own it?",
    a: "We build on GoHighLevel with a custom AI voice agent layer, Next.js funnels, and integrations to your existing tools. You own the stack. If you ever leave, the system stays with you.",
  },
];

export type TrustSignal = { iconName: "Clock" | "ShieldCheck" | "Zap"; text: string };

export const trustSignals: TrustSignal[] = [
  { iconName: "Clock", text: "45 minutes · zero pressure" },
  { iconName: "ShieldCheck", text: "No retainer until calls book" },
  { iconName: "Zap", text: "System live in 14 days if you move forward" },
];

export const navLinks = [
  { href: "#system", label: "The System" },
  { href: "#proof", label: "Proof" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export const footerColumns = [
  {
    label: "Tekmadev",
    items: [
      { label: "The System", href: "#system" },
      { label: "Proof", href: "#proof" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    label: "Connect",
    items: [
      { label: "Book a call", href: "#book" },
      { label: "Email us", href: `mailto:${_email}` },
      { label: "Call us", href: `tel:${_phoneTel}` },
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
  tagline: "We install the system that fills your calendar. You only pay when it performs.",
  signoff: "Built · Installed · Running",
};
