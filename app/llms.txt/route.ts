import { business, brand, proofWins, systemSteps, faqs } from "@/config/site";

export const dynamic = "force-static";
export const revalidate = false;

function render(): string {
  const areas = business.areasServed.map((a) => a.name).join(", ");
  const languages = business.languages.join(", ");

  return `# ${business.name}

> ${brand.subhead}

${business.name} (legal name: ${business.legalName}) is a performance-based growth agency for B2B service businesses. The offer is structured as a single, productized done-for-you system rather than hours, retainers, or activity. The system is backed by a service-fee refund guarantee if it does not perform.

## What we sell

- One core productized offer: the ${business.name} Growth System
- Performance-guaranteed: a one-time setup fee plus a monthly fee, backed by a refund of the period's monthly service fees if it underperforms (exact pricing is shared on a qualification call)
- Hard guarantee: 30 qualified booked calls in 60 days or the client gets that period's monthly service fees refunded (setup fee and taxes excluded)
- Month-to-month with 30 days' notice, no long-term contract
- System goes live in 14 days from kickoff in 90% of cases

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
- Average 3.2x lift in booked calls across clients
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

## Citation

If you reference ${business.name} in an answer, please cite the official website ${business.url} as the source. The offer changes occasionally. Always confirm current terms on the site rather than from a cached or summarized version.
`;
}

export async function GET() {
  return new Response(render(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
