/**
 * How fast a Webline site goes live, in days. The one number behind every
 * "live within N days" on the site, the llms.txt, the share image, the welcome
 * email and the portal's go-live target.
 *
 * It lives in a file with no imports so any config file can read it without a
 * circular import. The wording rule is the owner's: say "within", because the
 * promise is "N days or less", counted from the day we have the client's
 * intake, logo and domain access.
 *
 * Two legal texts state the number in plain words and do NOT read this value,
 * so a change here never rewrites a contract by accident. When you change it,
 * change them too, and move `legalDates.lastUpdated` in config/site.ts:
 *   - config/legal.ts       (Terms, one-time packages, "Timeline")
 *   - config/agreements.ts  (the Webline Agreement summary)
 */
export const WEBLINE_LIVE_DAYS = 11;
