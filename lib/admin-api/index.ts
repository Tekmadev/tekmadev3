/**
 * The admin API v1 foundation (app/api/admin/v1/**). Import from here:
 *
 *   import { route, ok, fail, ApiError, notFound, requireDb, dbError, toPage, pageQuery } from "@/lib/admin-api";
 *
 * docs/admin-api/README.md shows how to add an endpoint.
 */

export { route, publicRoute, errorResponse } from "./route";
export type { HttpMethod, RouteOptions, RouteInput, RouteHandler, RouteSegment, NextRouteHandler } from "./route";

export { authenticate, bearerToken } from "./auth";
export type { ApiContext } from "./auth";

export {
  ApiError,
  MESSAGES,
  NO_STORE_HEADERS,
  ok,
  fail,
  failureBody,
  badRequest,
  notFound,
  conflict,
  businessRule,
  upstream,
  notConfigured,
  unavailable,
  validationError,
  snakeCase,
} from "./errors";
export type { ErrorBody, Envelope, SuccessEnvelope, FailureEnvelope } from "./errors";

export {
  PERMISSIONS,
  CAPABILITIES,
  can,
  capabilitiesFor,
  isCapability,
  rolesFor,
  isOwnerOnly,
  forbiddenError,
  requireCapability,
  requireAnyCapability,
  inboxCategories,
  readsOwnerAudience,
} from "./permissions";
export type { Capability } from "./permissions";

export {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  encodeCursor,
  decodeCursor,
  clampLimit,
  pageQuery,
  pageQueryWith,
  toPage,
  pageArray,
  pgQuote,
  keysetFilter,
} from "./cursor";
export type { Page, CursorPart } from "./cursor";

export { requireDb, dbError, instant, money, moneyOrNull, isUuid } from "./data";

export { withIdempotency, canonicalJson, requestHash, isValidIdempotencyKey } from "./idempotency";

export { getMobileAppSettings, compareVersions, assertAppVersion, appVersionInfo } from "./version";
export type { MobileAppSettings, AppVersionInfo } from "./version";

// Meta: only the fragment type lives here. buildMeta / metaForLabels / metaLabel
// are imported from "@/lib/admin-api/meta" directly, so a route that does not
// need meta does not load every domain's fragment (and a fragment importing
// this barrel can not form a cycle).
export { defineMetaFragment } from "./meta/types";
export type { MetaFragment, MetaValues } from "./meta/types";
