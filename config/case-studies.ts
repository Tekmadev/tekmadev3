import { WEBLINE_LIVE_DAYS } from "@/config/webline-delivery";

/**
 * Case studies: the long-form proof pages at /case-studies.
 *
 * The home page keeps its three metric cards (proofWins in config/site.ts)
 * for results that fit in one number. A case study is for the ones that need
 * the story: what the business was up against, what we built, what happened,
 * and why. Everything on a study page comes from its entry here, so adding one
 * is a config entry; the page, the hub, the home page feature, the sitemap,
 * llms.txt and the share image all pick it up.
 *
 * Every figure in a study is either something we can show (the live site, a
 * cited survey) or something the operator told us, attributed as such. No
 * projected numbers, ever. And when the business is ours, in whole or in part,
 * the study says so in the first screen, not in a footnote.
 */

export const CASE_STUDIES_PATH = "/case-studies";

export type CaseStudyFact = { label: string; value: string; href?: string };
export type CaseStudySection = { heading: string; answer: string; body: string[]; bullets?: string[] };
export type CaseStudyStat = { text: string; source: string; sourceUrl: string };
export type CaseStudyFaq = { q: string; a: string };

export type CaseStudy = {
  slug: string;
  client: string;
  /** The client's live site. Linked from the page as a plain link, no nofollow. */
  url: string;
  industry: string;
  location: string;
  /** What we did, as short labels. */
  services: string[];
  published: boolean;
  datePublished: string;
  dateModified: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  h1Accent: string;
  intro: string;
  /** Shown under the byline. Required when the business is ours, even in part. */
  disclosure?: string;
  facts: CaseStudyFact[];
  /** Answer-first: the whole study in one quotable paragraph. */
  summary: string;
  sections: CaseStudySection[];
  stats: CaseStudyStat[];
  faqs: CaseStudyFaq[];
  cta: {
    heading: string;
    body: string;
    primary: { label: string; href: string };
    secondary: { label: string; href: string };
  };
  /** The hub row and the home page feature. */
  card: { title: string; blurb: string; highlights: string[] };
  /** Share image: three short lines, the last one in gold. */
  og: { lines: [string, string, string]; footer: string };
  /** The entity the article is about, for the Article schema. `ownedByUs` links it to our Organization. */
  about: { types: string[]; name: string; url: string; locality: string; region: string; country: string; ownedByUs: boolean };
};

export const caseStudies: CaseStudy[] = [
  {
    slug: "fixible",
    client: "Fixible",
    url: "https://fixible.ca",
    industry: "Phone and device repair",
    location: "Hamilton, Ontario",
    services: ["Website", "SEO", "AEO", "GEO"],
    published: true,
    datePublished: "2026-09-17",
    dateModified: "2026-09-17",
    metaTitle: "Fixible case study: calls every day in Hamilton, $0 on ads",
    metaDescription:
      "A Hamilton phone repair shop that gets calls every day with no ad spend. The website, SEO, AEO and GEO work behind it, and why customers say they found Fixible on ChatGPT and Gemini as well as Google.",
    eyebrow: "Case study · Device repair · Hamilton, Ontario",
    h1: "Calls every day in Hamilton.",
    h1Accent: "Not a dollar on ads.",
    intro:
      "Fixible fixes phones, tablets and consoles in Hamilton, Ontario. It is our own shop: Tekmadev owns it, and its founder runs it day to day. We built the website and did the search work behind it: SEO for Google, AEO so its answers get quoted, GEO so AI assistants can recommend it. Fixible has never run an ad. Every lead is organic, and the founder now hears the same thing from walk-ins: they found it on Google, or ChatGPT or Gemini told them to go there.",
    disclosure:
      "Disclosure: Fixible is owned by Tekmadev and operates under Tekmadev Innovation Inc. It was founded by, and is run by, its own founder. We show it because it is the shop whose numbers we can vouch for.",
    facts: [
      { label: "Business", value: "Fixible" },
      { label: "Where", value: "Hamilton, Ontario" },
      { label: "Relationship", value: "Tekmadev-owned, run by its founder" },
      { label: "Work", value: "Website, SEO, AEO, GEO" },
      { label: "Ad spend", value: "$0" },
      { label: "Live at", value: "fixible.ca", href: "https://fixible.ca" },
    ],
    summary:
      "Fixible is a phone and device repair shop in Hamilton, Ontario, owned by Tekmadev and run by its founder. Tekmadev built its website and did the SEO, AEO and GEO work. With no advertising, Fixible gets repair calls every day, and customers report finding it through Google search and through recommendations from ChatGPT and Gemini.",
    sections: [
      {
        heading: "What Fixible was up against",
        answer:
          "A new independent shop in a category owned by chains, franchise pages and directories, with customers who need an answer today and no budget for ads.",
        body: [
          "Fixible opened in 2024, founded and run by its own operator with more than a decade of repair experience behind the counter, and owned by Tekmadev, in a Hamilton market where the first page of Google belongs to national chains, franchise locations and directory listings. Someone with a cracked screen is not browsing. They search once, call the first place that looks real, and go.",
          "There was no ad budget, and there was not going to be one. The site had to do the whole job: be found, answer the questions, and get the call.",
        ],
      },
      {
        heading: "What we built",
        answer:
          "One page that answers a repair customer's four questions in order, and the structured data underneath it that tells search engines and AI assistants exactly what Fixible is, where it works, and what it fixes.",
        body: [
          "A repair customer asks the same four things: can you fix my device, how fast, what happens if it fails again, and where and when. The site answers them in that order. Services with repair times, a three-step how-it-works, a 90-day warranty stated plainly, hours, service areas, and a booking section. No portfolio, no stock photos, nothing between the visitor and the phone number.",
          "Then the part nobody sees, which is the part that gets it found:",
        ],
        bullets: [
          "SEO: a title and description written for the search Hamilton people actually type, every area Fixible serves named on the page (Hamilton, Ancaster, Dundas, Stoney Creek, Waterdown, Burlington, Flamborough and Glanbrook), and a clean sitemap and robots file so nothing is left to chance in the crawl.",
          "AEO: ten frequently asked questions written the way people ask them, from how long a screen repair takes to whether you need a booking, with FAQ schema so the answers can be lifted straight into a search result or a voice reply.",
          "GEO: a complete business entity in structured data, typed as an electronics repair shop, with its hours, service area, catalogue of repairs, location, contact details and social profiles. When an assistant is asked for a phone repair shop in Hamilton, there is nothing to guess about who Fixible is.",
        ],
      },
      {
        heading: "What happened",
        answer:
          "Calls every day, all of them organic, and a growing share of customers who say an AI assistant sent them.",
        body: [
          "Fixible has never run a paid ad. It gets repair calls in Hamilton every day, and the business is growing quickly on that alone.",
          "The detail worth the whole case study came from Fixible's founder, who runs the shop day to day. He started asking customers how they found the shop. Google search, as expected. But a steady number said they had asked ChatGPT or Gemini for a phone repair place in Hamilton, and Fixible was the recommendation.",
          "That is not a fluke of one shop. BrightLocal's Local Consumer Review Survey 2026 found that 45% of consumers now use AI tools to find local business recommendations, up from 6% a year earlier. The customers were already asking. Fixible was one of the few local shops the assistants could describe with confidence.",
        ],
      },
      {
        heading: "Why an assistant recommends one shop and not another",
        answer:
          "Assistants recommend businesses they can identify without guessing: what it is, where it works, what it offers, when it is open, and answers that do not contradict each other anywhere on the web.",
        body: [
          "An AI assistant does not walk around Hamilton. It draws on what it has read and what it can look up, and it recommends the businesses it can describe accurately. A shop whose site says it is an electronics repair business in Hamilton, lists the eight areas it serves, names every repair it does, states its hours and warranty, and answers the common questions in plain language is easy to recommend. A shop with a photo carousel and a contact form is not.",
          "The work that gets a page to rank on Google is the same work that makes it recommendable by an assistant. The difference is discipline: every fact stated explicitly, in the text and in the structured data, the same way everywhere.",
        ],
      },
      {
        heading: "What this means for your business",
        answer:
          "If your website does not state the basics in a way a machine can read, you are invisible to the fastest-growing way people choose a local business.",
        body: [
          "Most local business sites were built to look good to a person and say almost nothing a machine can use. That was fine when the only path to you was a Google search and a scroll. It is not fine when nearly half of consumers ask an assistant first.",
          `This is exactly what Webline is: a website for a small business or startup with the SEO, AEO and GEO work built in, live within ${WEBLINE_LIVE_DAYS} days. And once the calls come, the Growth System makes sure every one of them is answered and booked.`,
        ],
      },
    ],
    stats: [
      {
        text: "45% of consumers now use AI tools such as ChatGPT and Gemini to find local business recommendations, up from 6% in 2025.",
        source: "BrightLocal, Local Consumer Review Survey 2026 (1,002 US adults, March 2026)",
        sourceUrl: "https://www.brightlocal.com/research/lcrs-ai-trust/",
      },
    ],
    faqs: [
      {
        q: "Did Fixible run any ads?",
        a: "No. Fixible has never run a paid ad campaign. Every call and booking it gets is organic: Google search, AI assistant recommendations, and word of mouth from customers who found it those ways.",
      },
      {
        q: "How do ChatGPT and Gemini decide which local business to recommend?",
        a: "They recommend businesses they can identify and describe with confidence. That comes from a website that states plainly what the business is, where it works, what it offers and when it is open, backed by structured data that says the same thing, and answers to common questions written in plain language. Consistent facts across the site and the business's public profiles matter more than any single trick.",
      },
      {
        q: "Is this typical? Will my business get recommended by AI too?",
        a: "Every market and category is different, and nobody can promise a ranking or a recommendation from a system they do not control. What we can promise is the work: a site built so that search engines and AI assistants have no reason to overlook you. Fixible shows what that looks like in a competitive local category with no ad budget.",
      },
      {
        q: "Is Fixible a Tekmadev client?",
        a: "No, and we say so up front: Fixible is owned by Tekmadev and operates under Tekmadev Innovation Inc. It was founded by, and is run by, its own founder, who handles the repairs and the customers. Tekmadev built the website and did the SEO, the AEO (answer engine optimization, so its FAQ answers can be quoted directly) and the GEO (generative engine optimization, so AI assistants can identify and recommend it). We show our own shop because it is the one whose numbers we can vouch for completely.",
      },
    ],
    cta: {
      heading: "Want to be the shop the assistant recommends?",
      body: `Webline is the same build: a website with the SEO, AEO and GEO work done, live within ${WEBLINE_LIVE_DAYS} days, for a fixed price. Or book the audit and we will show you exactly what your current site is telling Google and ChatGPT about you.`,
      primary: { label: "See Webline", href: "/webline" },
      secondary: { label: "Book the 45-minute audit", href: "/#book" },
    },
    card: {
      title: "Fixible: calls every day in Hamilton, zero ad spend.",
      blurb:
        "Our own repair shop, run by its founder. We built the website and the search work behind it. No ads, all organic, and customers who say ChatGPT and Gemini sent them.",
      highlights: ["$0 ad spend", "100% organic", "Google, ChatGPT and Gemini"],
    },
    og: {
      lines: ["Calls every day.", "Zero ad spend.", "Found by AI search."],
      footer: "Fixible · Phone and device repair · Hamilton, Ontario",
    },
    about: {
      types: ["LocalBusiness", "ElectronicsRepair"],
      name: "Fixible",
      url: "https://fixible.ca",
      locality: "Hamilton",
      region: "ON",
      country: "CA",
      ownedByUs: true,
    },
  },
];

export function getCaseStudy(slug: string): CaseStudy | undefined {
  return caseStudies.find((c) => c.slug === slug);
}

export function publishedCaseStudies(): CaseStudy[] {
  return caseStudies.filter((c) => c.published);
}

/** The hub at /case-studies. */
export const caseStudiesHub = {
  eyebrow: "Case studies",
  title: "Real businesses. What we built, what happened.",
  sub: "The numbers on the home page are the short version. These are the full stories: what the business was up against, what we built, what changed, and why. No projections, and nothing we could not show you.",
  metaTitle: "Case studies: what Tekmadev built and what happened",
  metaDescription:
    "Full case studies from Tekmadev's client work for service businesses in Ontario: the situation, what we built, what happened and why. Real results, no projections.",
  moreHeading: "More results",
  moreSub: "Installs where one number tells the story. Full write-ups are on the way.",
};
