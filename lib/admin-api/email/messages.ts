/**
 * Copy for the email endpoints, as docs/api-requests/email.md lists it. The
 * app shows `message` as is.
 */
export const EMAIL_MESSAGES = {
  key: "Enter a campaign key using letters, numbers and dashes.",
  name: "Enter a campaign name.",
  nameLong: "Keep the campaign name to 200 characters or fewer.",
  dupe: "A campaign with that key already exists. Pick another.",
  active: "Send active as true or false.",
  status: "Pick a valid status.",
  notActive: "Only active subscribers can be unsubscribed.",
  crmErase: "Not deleted: the CRM erasure could not be queued, so their CRM contact would have stayed mailable. Try again.",
} as const;

/** Letters, numbers and single dashes, no leading or trailing dash (after trim and lowercase). */
export const CAMPAIGN_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CAMPAIGN_KEY_MAX = 64;
