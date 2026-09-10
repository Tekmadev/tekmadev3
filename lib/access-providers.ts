import { portal } from "@/config/site";

/**
 * Delegated-access catalog. For each account a client may need to share, the
 * portal shows these steps. Everything here is partner / manager access that
 * the client grants from their own account and can revoke. We never ask for,
 * collect, or store a password.
 */
export type AccessProviderKey =
  | "google_business_profile"
  | "google_ads"
  | "google_analytics"
  | "google_search_console"
  | "google_tag_manager"
  | "meta_business"
  | "meta_ads"
  | "instagram"
  | "tiktok_ads"
  | "linkedin"
  | "domain_dns"
  | "website_hosting"
  | "phone_carrier"
  | "calendar"
  | "crm"
  | "email_provider"
  | "other";

export type AccessMethod =
  | "partner_invite"
  | "manager_role"
  | "delegated"
  | "dns_records"
  | "api_connection"
  | "other";

export type AccessProvider = {
  key: AccessProviderKey;
  label: string;
  method: AccessMethod;
  summary: string;
  steps: string[];
  /** What we ask the client to paste back so we can verify (never a secret). */
  identifierLabel?: string;
  identifierHelp?: string;
};

const agencyEmail = portal.agencyAccess.email;
const metaId = portal.agencyAccess.metaBusinessId || "(we will send you our Business ID)";
const adsMcc = portal.agencyAccess.googleAdsManagerId || "(we will send you our manager account ID)";

export const ACCESS_PROVIDERS: Record<AccessProviderKey, AccessProvider> = {
  google_business_profile: {
    key: "google_business_profile",
    label: "Google Business Profile",
    method: "manager_role",
    summary: "You stay the owner. We get added as a manager so we can optimize your listing and reply to reviews.",
    steps: [
      "Go to business.google.com and open your business.",
      "Open the menu (three dots) and choose Business Profile settings, then People and access.",
      "Click Add, enter " + agencyEmail + ", and set the role to Manager.",
      "Send the invite. We accept it on our side and verify here.",
    ],
    identifierLabel: "Business name as it appears on Google",
  },
  google_ads: {
    key: "google_ads",
    label: "Google Ads",
    method: "manager_role",
    summary: "We link your account to our manager account. You keep ownership and billing control.",
    steps: [
      "Sign in to ads.google.com and note your 10-digit Customer ID (top right).",
      "Paste the Customer ID below and mark this done.",
      "We send a link request from our manager account " + adsMcc + ".",
      "Accept the request in Google Ads under Tools, Access and security, Managers.",
    ],
    identifierLabel: "Google Ads Customer ID",
    identifierHelp: "Format 123-456-7890.",
  },
  google_analytics: {
    key: "google_analytics",
    label: "Google Analytics",
    method: "manager_role",
    summary: "Editor access so we can wire up conversion tracking.",
    steps: [
      "Open analytics.google.com, then Admin, then Property access management.",
      "Add " + agencyEmail + " with the Editor role.",
    ],
    identifierLabel: "Property name",
  },
  google_search_console: {
    key: "google_search_console",
    label: "Google Search Console",
    method: "delegated",
    summary: "Full access so we can submit your sitemap and watch indexing.",
    steps: [
      "Open search.google.com/search-console and pick your property.",
      "Settings, Users and permissions, Add user: " + agencyEmail + ", permission Full.",
    ],
  },
  google_tag_manager: {
    key: "google_tag_manager",
    label: "Google Tag Manager",
    method: "manager_role",
    summary: "Publish access for tracking tags.",
    steps: [
      "Open tagmanager.google.com, Admin, User management.",
      "Add " + agencyEmail + " with Publish permission on the container.",
    ],
  },
  meta_business: {
    key: "meta_business",
    label: "Meta Business (Facebook and Instagram)",
    method: "partner_invite",
    summary: "Partner access lets us run your ads and content from our agency account. You keep ownership.",
    steps: [
      "Open business.facebook.com and go to Settings, then Partners.",
      "Click Add, then Give a partner access to your assets.",
      "Enter our Business ID " + metaId + ".",
      "Select your Page, ad account, and Instagram account, and grant Manage access for each.",
    ],
    identifierLabel: "Your Business Portfolio name",
  },
  meta_ads: {
    key: "meta_ads",
    label: "Meta Ads account",
    method: "partner_invite",
    summary: "Included when you share your ad account via Meta Business partner access.",
    steps: ["Share the ad account under Partners as part of the Meta Business step."],
    identifierLabel: "Ad account ID",
  },
  instagram: {
    key: "instagram",
    label: "Instagram",
    method: "partner_invite",
    summary: "Connected through your Meta Business portfolio.",
    steps: ["Make sure your Instagram account is added to your Business portfolio, then share it with us under Partners."],
    identifierLabel: "Instagram handle",
  },
  tiktok_ads: {
    key: "tiktok_ads",
    label: "TikTok Ads",
    method: "partner_invite",
    summary: "Partner access from TikTok Business Center.",
    steps: [
      "Open business.tiktok.com, Partners, Add partner.",
      "Enter the Business Center ID we send you and share your ad account.",
    ],
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    method: "manager_role",
    summary: "Page admin or ad account manager access.",
    steps: [
      "On your Company Page, Admin tools, Manage admins, add " + agencyEmail + ".",
    ],
  },
  domain_dns: {
    key: "domain_dns",
    label: "Domain and DNS",
    method: "dns_records",
    summary: "We point your domain at your new website. You add a couple of records, or delegate access if you prefer.",
    steps: [
      "Tell us where your domain is registered (GoDaddy, Namecheap, Google Domains, etc.) and paste the domain below.",
      "We send you the exact records to add (an A record and a CNAME). It takes about five minutes.",
      "Prefer we do it? Add " + agencyEmail + " as a delegate or collaborator at your registrar instead.",
    ],
    identifierLabel: "Your domain",
    identifierHelp: "Example: yourbusiness.com",
  },
  website_hosting: {
    key: "website_hosting",
    label: "Current website hosting",
    method: "delegated",
    summary: "Only needed if we migrate content from your current site.",
    steps: ["Tell us who hosts your current site. If we need access, we will ask for a collaborator invite, never a password."],
    identifierLabel: "Hosting provider",
  },
  phone_carrier: {
    key: "phone_carrier",
    label: "Business phone number",
    method: "other",
    summary: "We forward or port your number so missed calls get answered and texted back.",
    steps: [
      "Paste your main business number below.",
      "We will confirm with you whether to forward (fastest) or port (permanent) on the kickoff call.",
    ],
    identifierLabel: "Business phone number",
  },
  calendar: {
    key: "calendar",
    label: "Calendar",
    method: "delegated",
    summary: "So booked calls land straight on your calendar.",
    steps: ["Share your Google or Outlook calendar with " + agencyEmail + " (make changes to events)."],
    identifierLabel: "Calendar email",
  },
  crm: {
    key: "crm",
    label: "Existing CRM",
    method: "api_connection",
    summary: "Only if you have one and want your contacts migrated.",
    steps: ["Tell us which CRM you use. We will request an export or a limited API connection, never your login."],
    identifierLabel: "CRM name",
  },
  email_provider: {
    key: "email_provider",
    label: "Email sending domain",
    method: "dns_records",
    summary: "Lets follow-ups send from your domain with proper authentication.",
    steps: ["We send you three DNS records (SPF, DKIM, DMARC). Add them at your registrar, or delegate access under the Domain step."],
  },
  other: {
    key: "other",
    label: "Other",
    method: "other",
    summary: "Anything else we agreed on the kickoff call.",
    steps: ["Follow the note from your strategist."],
  },
};

export function accessProvider(key: string): AccessProvider {
  return ACCESS_PROVIDERS[key as AccessProviderKey] ?? ACCESS_PROVIDERS.other;
}
