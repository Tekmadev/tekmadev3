import { LINK_RESERVED_SLUGS } from "../links/shape";
import { defineMetaFragment } from "./types";

/**
 * The links slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/links.ts (see docs/api-requests/links.md section 5).
 * Static: the reserved slugs are the website's own list (lib/links-data.ts).
 */

export const UTM_SUGGESTIONS = {
  sources: ["instagram", "facebook", "linkedin", "business_card", "google", "youtube", "email"],
  mediums: ["social", "qr", "email", "cpc", "organic", "offline"],
};

export const LINK_STATUS_META = [
  { value: "active", label: "Active", tone: "gold" },
  { value: "disabled", label: "Disabled", tone: "muted" },
] as const;

export const metaFragment = defineMetaFragment(() => ({
  linkReservedSlugs: LINK_RESERVED_SLUGS,
  utmSuggestions: UTM_SUGGESTIONS,
  linkStatuses: LINK_STATUS_META,
}));
