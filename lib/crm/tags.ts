/**
 * The tag vocabulary, as data.
 *
 * The `tmd-` prefix means our tags can never collide with one the owner adds
 * by hand, and he can see at a glance which tags the site owns and which are
 * his. Nothing outside this object is ever written by us, and nothing we did
 * not write is ever removed by us.
 *
 * THE CONSENT RULE, structural rather than hoped-for. `tmd-newsletter` is
 * applied and removed ONLY by the subscribers trigger path, derived from
 * `subscribers.status`. No other code path may write it. Submitting a free
 * tool is an inquiry, not consent: only a ticked marketing box is consent to
 * ongoing marketing, and that path calls addSubscriber separately, which is
 * what produces the tag. A calculator submitter who did not tick the box gets
 * `tmd-lead-magnet` and can never get `tmd-newsletter`.
 *
 * Every marketing audience in the CRM filters on `tmd-newsletter`. A campaign
 * sent to everyone tagged `tmd-lead-magnet` would mail people who asked for a
 * report and never consented, which is a CASL violation. This vocabulary
 * exists so that is one checkbox to get right rather than a judgement call per
 * campaign.
 */
export const CRM_TAGS = {
  /** THE consent tag. Nothing else means mailable. Sourced only from subscribers.status. */
  newsletter: "tmd-newsletter",
  leadMagnet: "tmd-lead-magnet",
  revenueLeak: "tmd-lead-magnet-revenue-leak",
  bookedCall: "tmd-booked-call",
  bookingCancelled: "tmd-booking-cancelled",
  portalSignup: "tmd-portal-signup",
  client: "tmd-client",
  clientLive: "tmd-client-live",
  erased: "tmd-erased",
} as const;

export type CrmTag = (typeof CRM_TAGS)[keyof typeof CRM_TAGS] | `tmd-plan-${string}`;

/** A plan id arrives from a Stripe product row, so it is narrowed before use. */
const PLAN_TAG = /^tmd-plan-[a-z0-9][a-z0-9_-]*$/;

const FIXED: ReadonlySet<string> = new Set(Object.values(CRM_TAGS));

/** Do we own this tag. Reconciliation re-applies only ours, and removes only ours. */
export function isCrmTag(value: unknown): value is CrmTag {
  if (typeof value !== "string") return false;
  return FIXED.has(value) || PLAN_TAG.test(value);
}

/**
 * Resolve the short slug an enqueue carries into the tag we actually write.
 *
 * The triggers put a bare slug in the outbox payload ("newsletter",
 * "booked-call", "plan-grow") because SQL should not have to know the prefix.
 * Returns null for anything not in the vocabulary, so an unrecognised payload
 * fails its job loudly instead of inventing a tag in the owner's account,
 * which nothing would ever clean up.
 */
export function crmTag(slug: string | null | undefined): CrmTag | null {
  const bare = (slug ?? "").trim().toLowerCase().replace(/^tmd-/, "");
  if (!bare) return null;
  const candidate = `tmd-${bare}`;
  if (FIXED.has(candidate)) return candidate as CrmTag;
  if (PLAN_TAG.test(candidate)) return candidate as CrmTag;
  return null;
}
