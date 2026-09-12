/**
 * Copy for the Webline sales page (/webline). The price itself is never
 * written here: it comes from the `products` table (edited in the admin) and
 * the page formats it. Everything that IS a fact about the offer (scope,
 * delivery, guarantee) is written once here and read by the page, the JSON-LD,
 * the OG image, and llms.txt.
 *
 * Voice: direct, specific, value-stacked, risk reversed. Short sentences.
 * Numbers where a claim can carry one. No fluff.
 */

export const WEBLINE_ID = "webline" as const;

export const webline = {
  meta: {
    title: "Webline: a startup website that gets found, live in 14 days",
    description:
      "Custom-designed startup website with SEO, GEO, and AEO built in. Up to 5 pages, copy written for you, live on your domain in 14 days. One payment, or pay in 4 with Afterpay or Klarna.",
  },

  hero: {
    eyebrow: "Webline · for startups",
    lines: ["A startup website", "that gets found."],
    accent: "Live in 14 days.",
    sub: "Modern design that does not look like a template. SEO, GEO, and AEO built in from day one, so Google ranks you and ChatGPT cites you. One flat payment. No retainer. No surprise invoices.",
    cta: "Get Webline",
    secondary: "See what's included",
    /** Shown under the buttons. {price} and {installment} are filled by the page. */
    priceLine: "{price} once. Or 4 interest-free payments of {installment} with Afterpay or Klarna.",
    stats: [
      { value: "14 days", label: "From payment to live" },
      { value: "5 pages", label: "Designed and written for you" },
      { value: "4 × pay", label: "0% interest, decided at checkout" },
    ],
  },

  problem: {
    eyebrow: "The problem",
    headline: "You have three ways to get a website right now. All three are bad.",
    options: [
      {
        name: "The template builder",
        cost: "$16 a month, plus 40 hours of your life",
        body: "You pick a theme. So did 4,000 other startups. Google cannot tell you apart, and neither can your customers. Nothing is written for search, so nothing ranks.",
      },
      {
        name: "The freelancer",
        cost: "$1,500 to $3,000, if they show up",
        body: "A two-week job becomes two months. SEO is 'a separate quote'. AI search? They have not heard of it. When they disappear, so does your access.",
      },
      {
        name: "The agency",
        cost: "$8,000 to $25,000 and a discovery phase",
        body: "A strategy deck. A three-round revision process. A launch date in the next quarter. Great work, priced for companies with a marketing department.",
      },
    ],
    resolve:
      "Webline is the fourth option. Agency-grade design and search setup, startup price, startup speed. Built by the team that ships growth systems for 40+ operators.",
  },

  stack: {
    eyebrow: "What you get",
    headline: "Everything a startup website needs to get found. Nothing it doesn't.",
    intro: "Here is the full stack, and what each piece costs when you buy it on its own.",
    items: [
      {
        title: "Custom modern design",
        body: "Designed for your brand, not picked from a theme store. Dark mode, motion, typography that looks like money.",
        worth: 2500,
      },
      {
        title: "Up to 5 pages, copy written for you",
        body: "Home, about, services or product, contact, and one more. Headlines and pages that say what you do and why it matters. You answer a short form, we write.",
        worth: 1200,
      },
      {
        title: "SEO foundation",
        body: "Keyword-mapped pages, titles and descriptions, schema markup, sitemap, Search Console. The plumbing that makes Google index and rank you.",
        worth: 1500,
      },
      {
        title: "GEO and AEO layer",
        body: "Generative Engine Optimization and Answer Engine Optimization: llms.txt, FAQ markup, entity-rich copy. So ChatGPT, Perplexity, and Google AI cite you when someone asks.",
        worth: 900,
      },
      {
        title: "Fast and mobile-first",
        body: "Built on Next.js, hosted on the edge. Core Web Vitals in the green. Loads before your customer's thumb leaves the screen.",
        worth: 500,
      },
      {
        title: "Lead capture built in",
        body: "Contact form to your inbox, click-to-call, booking link, and analytics. So the traffic turns into conversations.",
        worth: 600,
      },
      {
        title: "Launched on your domain",
        body: "DNS, SSL, hosting setup, redirects from your old site if you have one. Live, secure, and yours.",
        worth: 300,
      },
    ],
    worthLabel: "Bought separately",
    totalLabel: "Total if you bought it piece by piece",
    priceLabel: "Webline, all of it",
  },

  bonuses: {
    eyebrow: "Included, no extra charge",
    headline: "Three things agencies charge for. Yours free.",
    items: [
      {
        title: "Priority build slot",
        body: "We start within one business day of payment. No waitlist, no 'kickoff in three weeks'.",
      },
      {
        title: "30 days of post-launch fixes",
        body: "Typo, broken link, a photo you want swapped. Send it, we fix it. For a month after launch, free.",
      },
      {
        title: "Google Business Profile setup guide",
        body: "The step-by-step we use with every local client, so your map listing and your website work together.",
      },
    ],
  },

  process: {
    eyebrow: "How it works",
    headline: "Pay today. Live in 14 days.",
    steps: [
      {
        day: "Day 0",
        title: "Pay and brief",
        body: "Checkout takes two minutes. Your portal invite lands in your inbox. You fill in a 15-minute form about your business and upload your logo.",
      },
      {
        day: "Day 1 to 4",
        title: "We write and design",
        body: "We map your keywords, write your pages, and design your homepage. You get on with running your startup.",
      },
      {
        day: "Day 5",
        title: "You approve the concept",
        body: "The homepage design lands in your portal. Love it, or tell us exactly what to change. We revise once, free.",
      },
      {
        day: "Day 14",
        title: "You're live",
        body: "Pages built, SEO wired, submitted to Google and Bing, launched on your domain. Plus a walkthrough video so you can edit anything.",
      },
    ],
  },

  proof: {
    eyebrow: "Built by",
    headline: "The team behind 40+ growth systems.",
    body: "Webline is the website layer of the system we install for operators who need results, not decoration. Same designers, same search playbook, packaged for founders who are just getting started.",
  },

  compare: {
    eyebrow: "Side by side",
    headline: "Do the math.",
    columns: ["Template builder", "Freelancer", "Agency", "Webline"],
    rows: [
      { label: "Price", values: ["$16/mo forever", "$1,500 to $3,000", "$8,000+", "{price}, once"] },
      { label: "Time to live", values: ["Your weekends", "4 to 8 weeks", "8 to 16 weeks", "14 days"] },
      { label: "Custom design", values: [false, "Sometimes", true, true] },
      { label: "Copy written for you", values: [false, "Extra", true, true] },
      { label: "SEO foundation", values: [false, "Extra", true, true] },
      { label: "AI search (GEO, AEO)", values: [false, false, "Rarely", true] },
      { label: "You own everything", values: ["Locked to platform", "Usually", true, true] },
      { label: "Pay in 4, 0% interest", values: [false, false, false, true] },
    ],
  },

  guarantee: {
    eyebrow: "The guarantee",
    headline: "Love the design, or pay nothing.",
    body: "You see your homepage design by day 5. If you do not love it, we revise it free. If you still do not love it, we refund you in full and part as friends. Once you approve the concept, we build the rest. Zero risk on the part that matters most.",
    points: [
      "Design concept in your portal by day 5",
      "One free revision round on the concept",
      "Full refund if the revised concept still misses",
      "Live within 14 days once we have your content",
    ],
  },

  bnpl: {
    eyebrow: "Pay in 4",
    headline: "Get your website today. Pay for it over six weeks.",
    body: "Pick Afterpay or Klarna at checkout and your total splits into four interest-free payments, one every two weeks. The decision is instant. The build starts the same day.",
    steps: ["Pick Afterpay or Klarna on the Stripe checkout page", "Pay the first instalment today", "Three more every two weeks, 0% interest"],
    fine: "Offered through Stripe. Subject to approval by Afterpay or Klarna. Affirm monthly plans are also available at checkout. Your agreement is with the provider you choose.",
  },

  fit: {
    eyebrow: "Is this you?",
    yes: {
      title: "Webline is for",
      items: [
        "Startups at pre-seed or seed who need a real site before the next pitch",
        "Founders launching a service, a local business, or a consultancy",
        "Anyone with a template site that has never brought in a lead",
        "Teams that want to be found on Google and in AI answers from day one",
      ],
    },
    no: {
      title: "Webline is not for",
      items: [
        "Online stores with hundreds of products",
        "Web apps, portals, or anything with logins",
        "20-page corporate sites (talk to us about Grow instead)",
        "Anyone who wants to skip the 15-minute intake form",
      ],
    },
  },

  faqs: [
    {
      q: "What exactly is included in Webline?",
      a: "A custom-designed website of up to 5 pages with the copy written for you, the SEO foundation (metadata, schema markup, sitemap, Search Console), the GEO and AEO layer for AI search (llms.txt, FAQ markup, entity-rich copy), lead capture (contact form, click-to-call, booking link, analytics), launch on your domain with SSL, a walkthrough video, and 30 days of post-launch fixes.",
    },
    {
      q: "How does pay in 4 with Afterpay or Klarna work?",
      a: "On the checkout page you choose Afterpay or Klarna instead of a card. The total is split into four equal, interest-free payments: the first today, then one every two weeks. Approval is instant and subject to the provider. Affirm monthly financing is also offered at checkout.",
    },
    {
      q: "What do SEO, GEO, and AEO mean?",
      a: "SEO is Search Engine Optimization: getting ranked on Google and Bing. GEO is Generative Engine Optimization: getting cited by AI tools like ChatGPT, Perplexity, and Google AI Overviews. AEO is Answer Engine Optimization: structuring your pages so they are the answer when someone asks a question. Webline sets up all three from day one.",
    },
    {
      q: "Is it really live in 14 days?",
      a: "Yes, once we have your intake form, your logo, and access to your domain. Most founders finish that on day one. The clock starts when we have what we need, and we tell you the exact date in your portal.",
    },
    {
      q: "I don't have copy, photos, or a logo. Can you still build it?",
      a: "Copy, yes: we write it from your intake form. Photos: we use licensed stock or brand-appropriate visuals if you have none. Logo: you need one. If you do not have one yet, we can quote a simple wordmark separately.",
    },
    {
      q: "Do I own the website?",
      a: "Completely. The design, the copy, the code, and the accounts. Domain and hosting stay in your name. If you ever leave us, everything stays with you.",
    },
    {
      q: "What does hosting cost after launch?",
      a: "We launch on Vercel, whose free or hobby tier covers most startup sites. Your domain renewal is paid to your registrar as usual. There is no monthly fee to us unless you choose to add one of our growth plans later.",
    },
    {
      q: "What if I need more pages, a blog, or a booking system later?",
      a: "Webline is built on the same stack as our Convert and Grow systems, so adding the AI receptionist, booking, follow-up automation, or a blog later is an upgrade, not a rebuild. Extra pages are quoted flat before any work starts.",
    },
    {
      q: "What is the refund policy?",
      a: "You approve the homepage design concept by day 5. If you do not love it after one free revision round, you get a full refund. Once you approve the concept and we build the rest, the fee is non-refundable, because the work is done and it is yours.",
    },
    {
      q: "Can I pay in US dollars?",
      a: "Checkout is in Canadian dollars. Your card or your pay-in-4 provider converts at their rate. Afterpay and Klarna pay-in-4 are available to customers in Canada; buyers elsewhere can pay by card.",
    },
  ],

  finalCta: {
    eyebrow: "Last step",
    headline: "Your startup, found.",
    body: "Two minutes at checkout. Fifteen minutes on the intake form. Fourteen days later, a website that ranks, gets cited, and captures leads. For less than one month of most retainers.",
    cta: "Get Webline",
    reassurance: ["Live in 14 days", "Love the design or full refund", "Pay in 4, 0% interest"],
  },

  sticky: {
    label: "Webline",
    cta: "Get started",
  },
} as const;

export type WeblineCompareValue = string | boolean;
