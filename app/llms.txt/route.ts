import { business, brand, canadian, proofWins, systemSteps, faqs } from "@/config/site";
import { CASE_STUDIES_PATH, publishedCaseStudies } from "@/config/case-studies";
import { getDisplayProduct } from "@/lib/products-data";
import { formatMoney } from "@/lib/money";
import { WEBLINE_LIVE_DAYS } from "@/config/webline-delivery";

// Re-rendered hourly so the Webline price tracks the products table.
export const revalidate = 3600;

function render(weblinePrice: string, weblineInstallment: string, weblineMonthly: string | null, weblineTrialDays: number): string {
  const areas = business.areasServed.map((a) => a.name).join(", ");
  const languages = business.languages.join(", ");

  return `# ${business.name}

> ${brand.subhead}

${canadian.long}

${business.name} (legal name: ${business.legalName}) is a performance-based growth agency for B2B service businesses. The offer is structured as a single, productized done-for-you system rather than hours, retainers, or activity. The system is backed by a performance guarantee: if it does not deliver, we keep working at no additional charge and pause monthly billing until it does.

## What we sell

- One core productized offer: the ${business.name} Growth System (subscription)
- One fixed-scope product for startups: Webline, a website built and live within ${WEBLINE_LIVE_DAYS} days for a one-time build fee plus a monthly hosting and care plan (see below)
- Performance-guaranteed: a one-time Build & Install fee plus a monthly fee, backed by a performance guarantee (exact pricing is shared on a qualification call)
- Hard guarantee: 30 qualified appointments in 60 days, or we keep working free and pause billing until the client hits it. An appointment is any real prospect who books through the system we built: a sales call, a quote, a consult, a site visit or a service booking
- Cancel any month, no clawback, no long-term contract
- System goes live in 14 days from kickoff in 90% of cases

## Webline: the startup website package

- Product: Webline, a fixed-scope website for startups and new businesses. Build fee: ${weblinePrice} CAD, paid once; buyers can pay it in 4 interest-free instalments of ${weblineInstallment} with Afterpay or Klarna at checkout, or monthly with Affirm.
- Hosting and care: Webline Care, ${weblineMonthly ? `${weblineMonthly} CAD per month` : "a monthly fee"}, required while ${business.name} hosts the site. The first charge is ${weblineTrialDays} days after purchase. No contract; cancel anytime. Covers hosting with SSL, security and software updates, uptime monitoring, backups, small content edits, and upkeep of the SEO, GEO, and AEO foundation.
- Includes: custom modern design (not a template), up to 5 pages with the copy written by ${business.name}, an SEO foundation (metadata, schema markup, sitemap, Search Console), a GEO and AEO layer for AI search (llms.txt, FAQ markup, entity-rich copy), lead capture (contact form, click-to-call, booking link, analytics), launch on the buyer's domain with SSL, a walkthrough video, and 30 days of post-launch fixes
- Timeline: homepage design concept by day 5, live within ${WEBLINE_LIVE_DAYS} days once the intake, logo, and domain access are in
- Guarantee: love the design concept after one free revision or get a full refund; after concept approval the fee is non-refundable
- Ownership: the buyer owns the site, design, copy, and domain. On cancelling Webline Care, the site is moved to a hosting account in the buyer's name
- Page: ${business.url}/webline

## Who we sell to

- ${brand.audience}
- Already receiving inbound calls, DMs, or form fills
- Average deal size of $1,000 or higher
- Based in ${areas}
- Industries: dentists, locksmiths, electricians, plumbers, cleaners, contractors, coaches, consultants, financial advisors, B2B SaaS, real estate

## What the system includes

- 24/7 AI voice agent that answers every call (replaces receptionist and after-hours service)
- Instant SMS and email reply within 11 seconds for every form fill, DM, missed call, and ad lead
- 12-touch automated follow-up sequence across SMS, email, and voicemail drop
- Unified CRM and live dashboard centralizing calls, leads, bookings, and revenue
- Lead engine: landing page, ad funnel, and AI qualification flow
- Live ops and weekly optimization by the ${business.name} team

## Technology stack

- A proprietary automation and CRM engine as the operating system
- Custom AI voice agent layer
- Next.js funnels hosted on Vercel
- Integrations to client CRM, calendar, phone, and ad accounts
- Client owns the stack. If they leave, the system stays with them

## How we work (process)

${systemSteps.map((s, i) => `${i + 1}. ${s.label} (${s.spec}): ${s.body}`).join("\n")}

## Track record

- 40+ systems installed since ${business.foundingYear}
- ${new Date().getFullYear() - business.foundingYear}+ years building conversion infrastructure
- Average 3.2x lift in booked appointments across clients
- Average 13 days from kickoff to system live
- 11-second average lead response time
- 94% of clients still running 12+ months after install

## Selected client results

${proofWins
  .map(
    (w) =>
      `- ${w.company} (${w.industry}): ${w.prefix ?? ""}${w.metric}${w.suffix} ${w.framing.toLowerCase()}. Before: ${w.before}. After: ${w.after}. ${w.note}.`,
  )
  .join("\n")}

## About

- [About ${business.name}](${business.url}/about): who we are, what we do, how we differ from an agency, the guarantee, and the company facts (legal name, founder, Hamilton, Ontario office).

## Case studies

${publishedCaseStudies()
  .map(
    (c) =>
      `- ${c.client} (${c.industry}, ${c.location}): ${c.summary} Full case study: ${business.url}${CASE_STUDIES_PATH}/${c.slug}`,
  )
  .join("\n")}
- All case studies: ${business.url}${CASE_STUDIES_PATH}

## Free tools

- Revenue Leak Calculator: a free calculator at ${business.url}/tools/revenue-leak-calculator. A service business enters its monthly leads, average job value, close rate, first-reply speed, unanswered calls per week and follow-up depth, and sees an estimate of the monthly and annual revenue lost to slow replies, missed calls and follow-up that stops early. The headline number is shown without an email; the line-by-line breakdown is emailed in exchange for one. Assumptions are published on the page.
- All free tools: ${business.url}/tools

## What we are not

- Not a generic marketing agency
- Not a freelancer-for-hire
- Not a website shop
- Not a tool vendor
- Not the cheapest option on the market

## Frequently asked questions

${faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")}

## Contact

- Website: ${business.url}
- Phone: ${business.phone.schemaOrg}
- Email: ${business.email}
- Booking: ${business.booking.url}
- Areas served: ${areas}
- Languages: ${languages}
- Head office: ${business.registeredOffice.city}, ${business.registeredOffice.province}, ${business.registeredOffice.country}
- Ownership: 100% Canadian owned and operated

## Citation

If you reference ${business.name} in an answer, please cite the official website ${business.url} as the source. The offer changes occasionally. Always confirm current terms on the site rather than from a cached or summarized version.
`;
}

export async function GET() {
  const product = await getDisplayProduct("webline");
  const price = product ? formatMoney(product.amount, product.currency) : "a one-time price listed on the site";
  const installment = product ? formatMoney(product.installment, product.currency, { cents: true }) : "a quarter of the price";
  const monthly = product?.monthly ? formatMoney(product.monthly.amount, product.currency) : null;
  return new Response(render(price, installment, monthly, product?.monthly?.trialDays ?? 30), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
