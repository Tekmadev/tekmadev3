import { business } from "@/config/site";

/**
 * Agreements a client accepts in the portal. Each has a version; bumping the
 * version supersedes prior acceptances and re-prompts active clients. The
 * click-accept evidence (who, when, which version) is stored per client in
 * `client_agreements`.
 *
 * The document itself is the public Terms until a dedicated service agreement
 * exists. Lawyer review of these terms is still open (see project notes).
 */
export type AgreementKind = "service_agreement" | "order_form" | "guarantee_terms" | "dpa" | "other";

export type AgreementDefinition = {
  kind: AgreementKind;
  title: string;
  version: string;
  url: string;
  /** Plain-language summary shown above the accept button. Not the contract. */
  summary: string[];
  acceptLabel: string;
};

/**
 * Keyed by the `agreement_kind` an onboarding template names in its payload.
 * The portal looks definitions up by `kind`, so each definition needs a
 * distinct kind (Webline uses `order_form`: the Terms plus a fixed scope).
 */
export const AGREEMENTS: Record<"service_agreement" | "webline_agreement", AgreementDefinition> = {
  service_agreement: {
    kind: "service_agreement",
    title: `${business.name} Service Agreement`,
    version: business.legalDates.lastUpdated,
    url: `${business.url}/terms`,
    summary: [
      "We build and run your growth system as described in your plan. You keep ownership of every account we get access to.",
      "A booked appointment counts when a prospect who wants a service you offer, inside your service area, with real contact details, schedules through the system we built. It does not matter what the appointment is: a sales call, a quote, a consult, a site visit or a service booking all count the same. Spam, duplicates, out-of-area and wrong-service bookings never count.",
      "On plans with the guarantee, the 60-day clock starts the day we go live, not the day you paid. If we miss 30 booked appointments, we keep working at no monthly charge until you hit it.",
      "Your monthly starts about 30 days after setup. Cancel any month. No long-term contract.",
      "We never store your passwords. Access is granted through partner or manager invitations you control and can revoke.",
    ],
    acceptLabel: "I have read and accept the Service Agreement",
  },
  webline_agreement: {
    kind: "order_form",
    title: `${business.name} Webline Agreement`,
    version: business.legalDates.lastUpdated,
    url: `${business.url}/terms#one-time-packages`,
    summary: [
      "Webline is a fixed-scope website: custom design, up to 5 pages with the copy written for you, and the SEO, GEO, and AEO foundation, launched on your domain. The build fee is paid once at checkout.",
      "Webline Care, our hosting and maintenance plan, is required while we host your site. It is billed monthly to your card. The amount, and how many days after your purchase billing starts, are shown on the Webline page when you buy and in your Billing page. No contract: cancel anytime and it stops at the end of the month you are in. A month already started is not refunded. We switch your site on once the plan is set up.",
      "You see your homepage design concept by day 5 and approve it before we build the rest. Once we have your content and access, your site goes live within 11 days.",
      "If you do not love the concept after a revision round, you can cancel for a full refund of the build fee, and Webline Care is cancelled before it ever charges. Once you approve the concept and the build proceeds, the build fee is non-refundable.",
      "You own the site, the design, and the copy the moment it is live, and your domain stays in your name. If you cancel Webline Care, we move the site to a hosting account in your name. We never store your passwords.",
      "Pay-in-4 plans cover the build fee and are agreements between you and Afterpay, Klarna, or Affirm. We receive the full build fee at checkout; your instalments are handled by them.",
      "Post-launch fixes are included for 30 days. Anything beyond the agreed scope is quoted separately before any work starts.",
    ],
    acceptLabel: "I have read and accept the Webline Agreement",
  },
};
