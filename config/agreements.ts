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
      "A booked call counts when a prospect who wants a service you offer, inside your service area, with real contact details, schedules through the system we built. Spam, duplicates, out-of-area and wrong-service bookings never count.",
      "On plans with the guarantee, the 60-day clock starts the day we go live, not the day you paid. If we miss 30 booked calls, we keep working at no monthly charge until you hit it.",
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
      "Webline is a fixed-scope website: custom design, up to 5 pages with the copy written for you, and the SEO, GEO, and AEO foundation, launched on your domain. Paid once. No monthly fee from us.",
      "You see your homepage design concept by day 5 and approve it before we build the rest. Once we have your content and access, your site goes live within 14 days.",
      "If you do not love the concept after a revision round, you can cancel for a full refund. Once you approve the concept and the build proceeds, the fee is non-refundable.",
      "You own the site, the design, and the copy the moment it is live. Domain and hosting stay in your name. We never store your passwords.",
      "Pay-in-4 plans are agreements between you and Afterpay, Klarna, or Affirm. We receive the full amount at checkout; your instalments are handled by them.",
      "Post-launch fixes are included for 30 days. Anything beyond the agreed scope is quoted separately before any work starts.",
    ],
    acceptLabel: "I have read and accept the Webline Agreement",
  },
};
