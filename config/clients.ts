import { proofWins } from "@/config/site";
import { CASE_STUDIES_PATH } from "@/config/case-studies";

/**
 * Businesses we have built systems for, shown on the client rail under the
 * homepage hero (components/ClientRail.tsx).
 *
 * A name on this rail says "they worked with us", so list a business only
 * when it is real, we may name it publicly, and we can back its result line.
 * A big brand we never had a contract with, or a tool we build on (Firebase,
 * Stripe), never goes here.
 *
 * The growth clients' lines come from proofWins, the same numbers the
 * Receipts cards show further down the page, so the two can never disagree.
 *
 * Logo files live in /public/images/trust-logos and must have a transparent
 * background: the rail draws every mark as a one-colour silhouette until it
 * reaches the viewfinder, and a file with a solid background turns into a
 * solid block.
 */

export type ClientMark = {
  src: string;
  /** A version drawn for dark backgrounds, when the brand has one. */
  darkSrc?: string;
  /** Width divided by height of the artwork, so the rail holds the space before the file loads. */
  aspect: number;
  /**
   * "brand": real colours in the viewfinder, a silhouette everywhere else.
   * "ink": a silhouette everywhere, for black-only wordmarks that would vanish on dark.
   */
  tint: "brand" | "ink";
};

export type Client = {
  id: string;
  name: string;
  /** Plain words, the way a customer would say it. */
  industry: string;
  /** One line that is true and that the client would sign off on. */
  result: string;
  /** Their live website, so anyone can check they exist. */
  url?: string;
  /** Our write-up, when there is one. Linked instead of the website. */
  caseStudy?: string;
  mark?: ClientMark;
};

/** The rail stays off the page until it has at least this many businesses to show. */
export const CLIENT_RAIL_MIN = 4;

function fromReceipt(company: string, mark?: ClientMark): Client {
  const win = proofWins.find((w) => w.company === company);
  // Fail the build rather than show a client whose numbers went missing.
  if (!win) throw new Error(`config/clients: no proofWins entry named "${company}"`);
  return {
    id: company.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: win.company,
    industry: win.industry,
    result: `${win.framing}: ${win.before} → ${win.after}`,
    url: win.url,
    mark,
  };
}

export const clients: Client[] = [
  fromReceipt("Down2Detail", { src: "/images/trust-logos/d2d.png", aspect: 529 / 472, tint: "brand" }),
  fromReceipt("KeyFoby", { src: "/images/trust-logos/keyfoby.svg", aspect: 2916.96 / 2952.49, tint: "brand" }),
  fromReceipt("Stoneworks Interlock"),
  {
    id: "fixible",
    name: "Fixible",
    // Our own shop, and the rail says so, as the case study does.
    industry: "Our own repair shop",
    result: "Calls every day, $0 spent on ads",
    url: "https://fixible.ca",
    caseStudy: `${CASE_STUDIES_PATH}/fixible`,
  },
];
