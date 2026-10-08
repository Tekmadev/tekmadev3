/**
 * Demo request field lengths, the same as the migration's checks
 * (20261005000100_demo_requests.sql). No imports, so the web forms can read
 * them in the browser for `maxLength`.
 */
export const DEMO_LIMITS = {
  businessName: 120,
  businessType: 80,
  area: 120,
  offer: 1000,
  website: 500,
  brand: 500,
  customers: 500,
  wants: 2000,
  demoUrl: 2000,
  builderNote: 1000,
} as const;
