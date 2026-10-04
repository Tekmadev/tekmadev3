import { defineMetaFragment } from "./types";
import {
  CAMPAIGN_STATUS_OPTIONS,
  CONSENT_EVENT_OPTIONS,
  ENGAGEMENT_TYPE_OPTIONS,
  SUBSCRIBER_SOURCE_OPTIONS,
  SUBSCRIBER_STATUS_OPTIONS,
  UNSUBSCRIBE_REASON_OPTIONS,
  UNSUBSCRIBE_SOURCE_OPTIONS,
} from "../email/labels";

/**
 * The email slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/email.ts (see docs/api-requests/email.md). Labels only, the
 * same for every role. Search reads `subscriberStatuses` and
 * `subscriberSources` from here for its subtitles.
 */
export const metaFragment = defineMetaFragment(() => ({
  subscriberStatuses: SUBSCRIBER_STATUS_OPTIONS,
  unsubscribeReasons: UNSUBSCRIBE_REASON_OPTIONS,
  unsubscribeSources: UNSUBSCRIBE_SOURCE_OPTIONS,
  subscriberSources: SUBSCRIBER_SOURCE_OPTIONS,
  consentEvents: CONSENT_EVENT_OPTIONS,
  campaignStatuses: CAMPAIGN_STATUS_OPTIONS,
  engagementTypes: ENGAGEMENT_TYPE_OPTIONS,
}));
