import { defineMetaFragment } from "./types";

/**
 * The ads slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/ads.ts (see docs/api-requests/ads.md). Labels only, so every
 * role gets them (the app's meta schema needs every key; the Ads data itself is
 * for owners and managers only).
 */
export const metaFragment = defineMetaFragment(() => ({
  adsCampaignStatuses: [
    { value: "active", label: "Active", tone: "ok" },
    { value: "paused", label: "Paused", tone: "warn" },
    { value: "archived", label: "Archived", tone: "muted" },
  ],
}));
