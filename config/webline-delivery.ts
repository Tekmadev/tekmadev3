/**
 * How long a build takes, and how client-facing copy talks about it.
 *
 * Owner rule (2026-09-29): client-facing copy never states how long a build
 * takes, for any offer (Webline or the Growth System), anywhere: not the
 * site, the emails, the ads, the share image, llms.txt, the Stripe product,
 * the Terms, or the client portal. The time depends on the business. Speed is
 * said in words ("ready before you are", "before you know it", "fast"). The
 * Growth System's 60-day booking guarantee is a results promise, not a
 * delivery time, and stays.
 *
 * WEBLINE_TARGET_DAYS is the internal goal behind that promise. It sets the
 * go-live target the admin tracks (the Growth System's is 14 days, in
 * lib/onboarding-data.ts and lib/client-provisioning.ts). The portal hides
 * every target, stage day range, and due date on our own tasks from clients
 * (`showTiming={false}` on StageTracker and TaskList). Import it for
 * scheduling only, never into copy.
 *
 * The Terms (config/legal.ts: the Growth System "Install" item and Webline's
 * "Timeline") and the Webline Agreement summary (config/agreements.ts) say
 * there is no fixed delivery date. Keep them that way, and move
 * `legalDates.termsLastUpdated` in config/site.ts if you change them.
 */
export const WEBLINE_TARGET_DAYS = 11;
