import { business, canadian } from "@/config/site";

/**
 * The About page. Two readers at once: a business owner deciding whether to
 * trust us, and a search or AI engine working out what Tekmadev is.
 *
 * So it is written answer-first under question-shaped headings (the form AI
 * engines quote), it states the entity facts plainly and identically to the
 * rest of the site, and it makes the case the way Alex Hormozi would: name the
 * real problem, own the outcome, put our fee at risk, show proof we control.
 *
 * One hard rule: nothing here that we cannot stand behind. No review ratings:
 * an invented 4.9 star rating was removed from the site on 2026-09-19 and
 * nothing like it comes back. The aggregate numbers in `results` (40+ systems,
 * 3.2x, 11 seconds, 94%) and the 2019 founding year were confirmed as real by
 * the owner on 2026-09-20; they are stated as averages, never as a promise.
 * Fixible stays as the proof we fully control.
 */

export const ABOUT_PATH = "/about";

export const about = {
  metaTitle: "About Tekmadev: the growth consultancy that owns the result",
  metaDescription:
    "Tekmadev is a performance-based growth consultancy headquartered in Hamilton, Ontario: one done-for-you system that gets service businesses more clients.",

  eyebrow: "About Tekmadev",
  h1: "We build the system that brings you clients. Then we run it.",

  // The quotable definition. Keep it near-verbatim with llms.txt and the schema.
  definition:
    "Tekmadev is a performance-based growth consultancy headquartered in Hamilton, Ontario. We give local and B2B service businesses one done-for-you system to get more clients: a website that gets found on Google and AI search, advertising, and 24/7 AI-powered answering, booking and follow-up, managed as a single monthly package.",

  why: {
    heading: "Why does Tekmadev exist?",
    answer:
      "Because most service businesses do not have a lead problem. They have a follow-up problem, and five vendors who each own one piece of it.",
    body: [
      "The web designer blames the ads. The ads person blames the phones. The phones go to voicemail at 6 pm, and the lead books with whoever answered first. Everyone did their job, and nobody owned the result.",
      "We built Tekmadev to own it. One team, one system, and one number that matters: bookings on your calendar.",
    ],
  },

  what: {
    heading: "What does Tekmadev actually do?",
    answer:
      "Everything between a stranger searching for what you sell and that person sitting on your calendar. We build it, connect it, and keep it running.",
    groups: [
      {
        title: "Get found",
        text: "Websites built to rank on Google and to be recommended by AI search like ChatGPT and Gemini (SEO, AEO and GEO), with online booking and a blog that answers what your buyers ask.",
      },
      {
        title: "Get leads",
        text: "Google and Meta ads, and the landing pages and funnels that turn a click into an inquiry.",
      },
      {
        title: "Never miss one",
        text: "An AI receptionist that answers every call around the clock, an instant text back on missed calls, and email and SMS follow-up that keeps going until they book.",
      },
      {
        title: "Close and keep them",
        text: "A CRM and pipeline so nothing is forgotten, review requests after every happy customer, payments and invoicing, and campaigns that wake up old leads.",
      },
      {
        title: "Build what is missing",
        text: "Web apps, mobile apps, e-commerce, custom AI integrations and design, for when the growth plan needs something that does not exist yet.",
      },
    ],
  },

  different: {
    heading: "How is Tekmadev different from a marketing agency?",
    answer:
      "An agency sells you ads, content and reports. A freelancer sells you hours. We sell you booked appointments, and we put part of our fee at risk to prove it.",
    points: [
      {
        title: "We own the outcome, not a channel",
        text: "One team runs the website, the ads, the phones and the follow-up, so there is nobody left to point at. If bookings are down, that is our problem to fix.",
      },
      {
        title: "We put our fee at risk",
        text: "On our Grow plan and above, the target is 30 qualified bookings in your first 60 days. If we miss it, we keep working free and pause your monthly billing until you get there. The conditions are written plainly in our Terms.",
        link: { href: "/terms", label: "Read the guarantee in our Terms" },
      },
      {
        title: "We tell you when it is not a fit",
        text: "If we cannot see a clear path to more bookings for your business, we say so on the first call, before you spend anything.",
      },
    ],
  },

  results: {
    heading: "What results has Tekmadev produced?",
    answer: `Since ${business.foundingYear}, Tekmadev has installed more than 40 growth systems. Across our clients, booked appointments rise 3.2 times on average, new leads get a reply in about 11 seconds, and 94% of clients are still running the system after 12 months.`,
    stats: [
      { value: "40+", label: `Systems installed since ${business.foundingYear}` },
      { value: "3.2×", label: "Average lift in booked appointments" },
      { value: "11s", label: "Average lead response time" },
      { value: "94%", label: "Clients still running after 12 months" },
    ],
    body: "These are averages across our own client accounts, not a promise for any one business. Your numbers depend on your market, your offer and your close rate, which is why our guarantee is written around bookings and not around revenue.",
    link: { href: "/case-studies", label: "See the case studies" },
  },

  proof: {
    heading: "Has Tekmadev done this for a business of its own?",
    answer:
      "Yes. We own a phone and device repair shop in Hamilton called Fixible, and we grew it with the same work we sell: no ad budget, all organic.",
    body: "We built its website and the search work behind it. It gets calls every day, and customers tell the shop that ChatGPT and Gemini recommended it, not only Google. We show Fixible because it is the business whose results are entirely ours to vouch for.",
    link: { href: "/case-studies/fixible", label: "Read the Fixible case study" },
    disclosure: "Fixible is owned by Tekmadev and operates under Tekmadev Innovation Inc. It was founded by, and is run by, its own founder.",
  },

  who: {
    heading: "Who runs Tekmadev?",
    answer: `Tekmadev was founded in ${business.foundingYear} by ${business.privacyOfficer.name}, and is run today by its two co-founders from ${canadian.teamPlaces}.`,
    body: canadian.long,
  },

  factsHeading: "Tekmadev at a glance",

  faq: {
    heading: "Questions people ask about Tekmadev",
    items: [
      {
        q: "What is Tekmadev?",
        a: "Tekmadev is a performance-based growth consultancy headquartered in Hamilton, Ontario. It gives local and B2B service businesses one done-for-you system to get more clients: a website that gets found, advertising, and 24/7 AI-powered answering, booking and follow-up, managed as a single monthly package.",
      },
      {
        q: "Where is Tekmadev located?",
        a: `Tekmadev Innovation Inc. has its head office at ${business.registeredOffice.line1}, ${business.registeredOffice.city}, ${business.registeredOffice.province}, Canada, and its co-founders work from ${canadian.teamPlaces}. It is 100% Canadian owned and operated, and works with clients remotely.`,
      },
      {
        q: "Who owns Tekmadev?",
        a: `Tekmadev Innovation Inc. is a privately held Canadian company. It was founded by ${business.privacyOfficer.name} and is run by its two co-founders.`,
      },
      {
        q: "When was Tekmadev founded?",
        a: `Tekmadev was founded in ${business.foundingYear} by ${business.privacyOfficer.name}. Since then it has installed more than 40 growth systems for service businesses.`,
      },
      {
        q: "Is Tekmadev a marketing agency?",
        a: "Not in the usual sense. An agency sells services like ads or content. Tekmadev sells an outcome, booked appointments, and runs the whole system that produces it: the website, the advertising, the AI answering and the follow-up.",
      },
      {
        q: "Does Tekmadev guarantee results?",
        a: "On the Grow plan and above, yes. The target is 30 qualified bookings in the first 60 days. If it is missed, Tekmadev keeps working at no charge and pauses the monthly billing until the target is met. The entry plan, Convert, does not carry the guarantee. Conditions are set out in the Terms of Service.",
      },
      {
        q: "What kinds of businesses does Tekmadev work with?",
        a: "Service businesses that live on booked appointments or booked jobs: trades, auto services, local repair shops and other local and B2B service companies. It also builds first websites for startups through its Webline product.",
      },
    ],
  },

  cta: {
    heading: "Want to see where your leads are leaking?",
    body: "Book a call and we will map it with you, or run the numbers yourself first. Either way you leave knowing what it is costing you.",
    primary: { href: "/#book", label: "Book a call" },
    secondary: { href: "/tools/revenue-leak-calculator", label: "Run the free Revenue Leak Calculator" },
  },
} as const;
