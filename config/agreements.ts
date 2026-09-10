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

export const AGREEMENTS: Record<"service_agreement", AgreementDefinition> = {
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
};
