/**
 * Thin compatibility layer over config/site.ts.
 * New code should import from "@/config/site" directly.
 * These re-exports keep older imports stable.
 */
import { business } from "@/config/site";

export const BRAND_PHONE = business.phone.tel;
export const BRAND_PHONE_DISPLAY = business.phone.display;
export const BRAND_PHONE_PRETTY = business.phone.pretty;
export const BRAND_EMAIL = business.email;

export const CAL_LINK = business.booking.link;
export const CAL_NAMESPACE = business.booking.namespace;
export const CAL_URL = business.booking.url;

export const BOOKING_ANCHOR = "#book";
