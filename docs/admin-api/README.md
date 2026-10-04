# Admin API v1

The JSON API behind the Tekmadev Admin Android app, at `https://www.tekmadev.com/api/admin/v1`. The contract is the app's brief (section 11, a copy is in `docs/mobile-admin/PROMPT.md`) plus `docs/api-requests/*.md`, the zod schemas in `src/api/schemas/*.ts` and the mock in `src/api/mock/` of the app repo. Every response must parse with those schemas.

Everything shared lives in `lib/admin-api/`:

| File | What it does |
|---|---|
| `route.ts` | `route()` and `publicRoute()`: one wrapper per endpoint (version gate, auth, rate limit, capability, query and body validation, idempotency, error envelope) |
| `auth.ts` | Bearer auth: Supabase access token, then the role from `lib/admin.ts` `resolveRole` |
| `permissions.ts` | The capability matrix (see [permissions.md](permissions.md)) |
| `staff/`, `team/` | Staff management: roles, pausing, the activity board, client credits, the default split (see [staff.md](staff.md)) |
| `errors.ts` | `ok()`, `fail()`, `ApiError` and shortcuts, shared copy, zod errors to `fields` |
| `cursor.ts` | Opaque keyset cursors, `pageQuery`, `toPage()`, `keysetFilter()` |
| `data.ts` | `requireDb()`, `dbError()`, `instant()`, `money()`, `isUuid()` |
| `idempotency.ts` | `Idempotency-Key` replay (used by `route({ idempotent: true })`) |
| `version.ts` | `X-App-Version` gate (426) and `Me.app` |
| `meta/` | `GET /meta`: one fragment per domain, merged by `meta/index.ts` |
| `search.ts` | `GET /search` |

Import from `@/lib/admin-api` (and `@/lib/admin-api/meta` for `buildMeta`, `metaForLabels`, `metaLabel`).

## Rules every endpoint follows

- Envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message, fields? } }`, real HTTP status, `cache-control: no-store`. `message` is plain copy the app shows as is.
- Statuses: 400 validation, 401 `unauthorized` (no or bad token), 403 `not_staff` (valid account, not on staff, e.g. a client portal user), 403 `owner_only` / `forbidden` (capability), 404 `not_found`, 409 conflict, 415 `not_json`, 422 business rule, 426 `upgrade_required`, 429 `rate_limited`, 500 `unavailable`, 502 upstream (Stripe or Meta), 503 `not_configured`.
- Never leak internals: throw `dbError("what", error)` or let an unknown error reach `route()`, which logs it and answers 500 `unavailable`.
- Money is integer cents: `money(cents, currency)` gives `{ amount, currency }`.
- Instants: `instant(row.created_at)` turns Postgres' `2026-09-30T14:03:22.123456+00:00` into `2026-09-30T14:03:22.123456Z` with string work only. Never send an instant through `new Date()`: it keeps milliseconds and breaks cursors and watermarks the app sends back.
- Calendar dates are `YYYY-MM-DD` in America/Toronto.
- PATCH is partial: only the keys sent change; `null` clears. Use `.optional()` in the zod body and check `=== undefined`.
- Every create takes `Idempotency-Key`: set `idempotent: true`.
- Every mutation returns the full updated entity (and, for nested writes, what the app's `docs/api-requests/<domain>.md` asks for).
- Owner-only and staff limits are enforced here with the capability matrix, never by the app hiding things.
- No em dashes or en dashes anywhere. The CRM vendor is never named in a response or new UI text: it is "CRM".

## Adding an endpoint

Reuse the website's data code (`lib/<area>-data.ts`). When the logic you need is inside a server action, move it into a lib function that both the action and the route call, without changing what the web admin does.

A route file is a few lines. `GET /leads` (list) and `POST /leads` (create) as a worked example:

```ts
// app/api/admin/v1/leads/route.ts
import { z } from "zod";
import { route, pageQuery, decodeCursor, keysetFilter, toPage, requireDb, dbError, instant } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["new", "booked", "contacted", "qualified", "won", "lost", "cancelled"] as const;

const listQuery = z.object({
  ...pageQuery, // cursor, limit (default 30, max 100, bad values clamp)
  q: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES, "Unknown lead status.").optional(), // 400 code "status"
});

type LeadRow = { id: string; created_at: string; name: string | null; email: string | null /* ... */ };
const toLead = (row: LeadRow) => ({ id: row.id, name: row.name, email: row.email ?? "", createdAt: instant(row.created_at) /* ... */ });

export const GET = route({ method: "GET", capability: "leads.view", query: listQuery }, async (ctx, { query }) => {
  const db = requireDb();
  const after = decodeCursor(query.cursor, z.tuple([z.string(), z.string()])); // 400 "cursor" when stale
  let q = db
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1); // one extra row says whether there is a next page
  if (query.status) q = q.eq("status", query.status);
  if (after) q = q.or(keysetFilter(["created_at", "id"], after, "desc"));
  const { data, error } = await q;
  if (error) throw dbError("leads list", error);
  return toPage(data as LeadRow[], query.limit, (row) => [row.created_at, row.id], toLead); // { items, nextCursor }
});

const createBody = z.object({
  name: z.string({ error: "Enter a name." }).trim().min(1, "Enter a name.").max(120),
  email: z.email("Enter a valid email.").optional(),
});

export const POST = route(
  { method: "POST", capability: "leads.create", body: createBody, idempotent: true, status: 201 },
  async (ctx, { body }) => {
    const lead = await createLeadByHand({ ...body, by: ctx.email }); // a lib/ function the web admin can share
    return toLead(lead); // sent as { ok: true, data } with 201
  },
);
```

```ts
// app/api/admin/v1/leads/[id]/route.ts
import { route, notFound, isUuid } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route({ method: "GET", capability: "leads.view" }, async (ctx, { params }) => {
  if (!isUuid(params.id)) throw notFound("That lead"); // 404 "That lead no longer exists."
  const lead = await getLead(params.id);
  if (!lead) throw notFound("That lead");
  return toLead(lead);
});
```

Long jobs (Ads refresh, CRM sync, test catalog) add `export const maxDuration = 120;` to their route file. Route segment config must be written in the route file itself, never re-exported.

### Helper signatures

```ts
// route.ts
route<B extends z.ZodType | undefined = undefined, Q extends z.ZodType | undefined = undefined, T = unknown>(
  options: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    capability?: Capability | readonly Capability[]; // all required
    anyCapability?: readonly Capability[];           // at least one
    body?: B;                                         // zod schema, output is input.body
    query?: Q;                                        // zod schema over the query string object
    idempotent?: boolean;                             // honour Idempotency-Key (creates)
    status?: number;                                  // success status for plain data (default 200)
    fieldCodes?: Record<string, string>;              // zod field -> error code, when not snake_case(field)
    rateLimit?: number | false;                       // per person per minute (default 240)
  },
  handler: (ctx: ApiContext, input: { body; query; params: Record<string, string>; req: NextRequest }) =>
    Promise<T | Response> | T | Response,
): (req: NextRequest, segment: { params: Promise<Record<string, string | string[] | undefined>> }) => Promise<Response>
publicRoute(options: { method }, handler: ({ req, params }) => T | Response): same handler type // no auth, no version gate

// auth.ts
type ApiContext = {
  userId: string; email: string; name: string | null; role: "owner" | "manager" | "staff"; isOwner: boolean;
  user: User; appVersion: string | null; viewer: { userId: string; isOwner: boolean };
  can(capability: Capability): boolean;
  require(...capabilities: Capability[]): void; // throws the 403
};

// errors.ts
ok<T>(data: T, status = 200, headers?): NextResponse            // { ok: true, data }
fail(status, code, message, fields?, headers?): NextResponse    // { ok: false, error }
class ApiError extends Error { status; code; fields?; headers?; constructor(status, code, message, fields?, headers?) }
badRequest(code, message, fields?)    // 400
notFound(what = "That item")          // 404 not_found "<what> no longer exists."
conflict(code, message, fields?)      // 409
businessRule(code, message, fields?)  // 422
upstream(code = "upstream", message?) // 502
notConfigured(message?)               // 503 not_configured
unavailable(message?)                 // 500 unavailable
validationError(zodError, fieldCodes?) // 400; code = first bad field (snake_case), message = its zod message, fields = all
MESSAGES                              // shared copy (unauthorized, ownerOnly, forbidden, notFound, unavailable, ...)

// permissions.ts
can(roleOrCtx, capability): boolean
requireCapability(roleOrCtx, ...capabilities): void   // throws 403
requireAnyCapability(roleOrCtx, ...capabilities): void
inboxCategories(roleOrCtx): AdminCategory[]           // categories this role may read
readsOwnerAudience(roleOrCtx): boolean                 // owner-audience Inbox rows: owners and managers, never staff
isOwnerOnly(capability), rolesFor(capability), forbiddenError(capability), PERMISSIONS, CAPABILITIES

// cursor.ts
encodeCursor(tuple: readonly (string | number | boolean | null)[]): string
decodeCursor(raw): CursorPart[] | null
decodeCursor(raw, zodTupleSchema): output | null      // throws 400 "cursor" "That page is out of date. Pull to refresh."
pageQuery                       // { cursor, limit } zod shape to spread; pageQueryWith(defaultLimit)
clampLimit(raw, fallback = 30): number                 // 1..100
toPage(rows, limit, cursorOf, map?): { items, nextCursor } // fetch limit + 1 rows
pageArray(items, limit, cursor): { items, nextCursor }  // in-memory lists (offset cursor)
keysetFilter([colA, colB], [valA, valB], "asc" | "desc"): string // for .or()
pgQuote(value): string                                  // a quoted PostgREST filter value

// data.ts
requireDb(): SupabaseClient                     // 503 when Supabase env is missing
dbError(what, error): ApiError                  // logs, returns 500 unavailable
instant(value): string | null                   // Postgres timestamptz -> ISO UTC "Z", fraction kept
money(cents, currency = "CAD"): { amount, currency }
moneyOrNull(cents, currency?)
isUuid(value): boolean

// meta
defineMetaFragment((ctx) => ({ ...keys }))      // in lib/admin-api/meta/<domain>.ts
buildMeta(ctx), metaForLabels(ctx), metaLabel(meta, key, value, fallback?), humanize(value) // from "@/lib/admin-api/meta"

// version.ts
assertAppVersion(header), appVersionInfo(callerVersion), getMobileAppSettings(), compareVersions(a, b)
```

### Validation copy

zod messages are the copy the app shows, so write them like the brief: `z.string({ error: "Enter a name." }).trim().min(1, "Enter a name.")`. A failed body or query answers 400 with `code` = the first bad field in snake_case (`appVersion` -> `app_version`), `message` = its message, and `fields` = every bad field. When the contract names a different code, map it with `fieldCodes` (`{ maxRedemptions: "max" }`), or validate in the handler and `throw badRequest(code, message, { field: message })`.

### GET /meta

Each domain owns `lib/admin-api/meta/<domain>.ts` (overview, notifications, clients, leads, tools, billing, analytics, ads, blog, email, links, crm, pricing, coupons, settings, testMode, team), returning exactly the keys of `metaFragment` in the app's `src/api/schemas/<domain>.ts`:

```ts
// lib/admin-api/meta/leads.ts
import { defineMetaFragment } from "./types";

export const metaFragment = defineMetaFragment(() => ({
  leadSources: [{ value: "cal_booking", label: "Booked call" } /* ... */],
  leadStatuses: [{ value: "new", label: "New", tone: "gold" } /* ... */],
}));
```

Fragments may be async and get the caller (`ctx`). A fragment that throws fails `GET /meta` (500), so keep them to cheap reads. Search reads labels from meta (`clientStatuses`, `leadStatuses`, `leadSources`, `subscriberStatuses`, `subscriberSources`, `blogStatuses`, `couponScopes`, `couponStatuses`), cached five minutes, falling back to the website's labels.

### Pagination

Keyset cursors over the sort columns plus `id`: fetch `limit + 1`, `toPage()` builds `nextCursor` from the last row sent. Keep the timestamp strings exactly as Postgres returned them inside the cursor. For a list computed in memory, `pageArray()`.

## Session endpoints (reference implementation)

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | Any staff. User, role, `capabilities` (every capability the role holds, `capabilitiesFor()`), features, timezone, loader, `testModeConfigured`, `app` versions. First call seeds the Inbox read state (starts at "now"). |
| GET | `/meta` | Any staff. Merged fragments, `ETag`, 304 on `If-None-Match`. |
| GET | `/search?q=` | Any staff, results filtered by capability. Never 400. |
| POST | `/devices` | Any staff. `{ token, platform, appVersion, deviceName }` -> `{ id }`, 201 new token, 200 known token (moved to the caller). Idempotent. |
| DELETE | `/devices/:id` | Any staff, own phones only, else 404. |
| PATCH | `/profile` | Any staff. `{ name }` -> `{ name }`; trimmed, empty or null clears, absent keeps. |
| GET | `/health` | No auth. `{ status, api, commit }`. |
| any | anything else | JSON 404 `not_found` (catch-all `app/api/admin/v1/[...path]`). |

`proxy.ts` lets `/api/admin/v1/*` through untouched on every host: no redirects, no rewrites, no cookie refresh. Every route exports `dynamic = "force-dynamic"` and answers `cache-control: no-store`.

## App version gates

The app sends `X-App-Version`. Below the minimum every call answers 426 `upgrade_required`. Values come from the `site_settings` row `mobile_app` (`{ "minVersion", "latestVersion", "apkUrl", "features" }`, all optional), else env `ADMIN_APP_MIN_VERSION`, `ADMIN_APP_LATEST_VERSION`, `ADMIN_APP_APK_URL` (https only), `ADMIN_APP_FEATURES` (comma separated). Nothing set: nothing blocked, no update offered, `apkUrl` null. Cached one minute per server instance.

```sql
update public.site_settings
set value = '{"minVersion": "0.2.0", "latestVersion": "0.2.0", "apkUrl": null}'::jsonb, updated_at = now(), updated_by = 'owner'
where key = 'mobile_app';
```

## Migrations (files only, apply in order)

| File | What |
|---|---|
| `20261003000001_admins_staff_role.sql` | `admins.role` allows `staff` (handles an enum or a CHECK) |
| `20261003000002_admin_api_idempotency.sql` | `admin_api_idempotency` (user, key, method, path, request hash, status, body; unique user + key; 24 hour retention by the helper) |
| `20261003000003_admin_devices.sql` | `admin_devices` (one row per Expo push token) and the `site_settings` row `mobile_app` |
| `20261003000004_lead_outreach.sql` | `leads.follow_up_at`, `leads.assigned_to`, `lead_touches`; `source = 'outreach'` allowed |
| `20261003000040_client_sections_app_values.sql` | `client_approvals.kind` adds copy, design, email, automation; `client_booked_calls.source` adds phone, website, referral |
| `20261003000141_links_click_history.sql` | `link_clicks.id` when missing, no foreign key to `links` (deleting a link keeps its clicks), two paging indexes |
| `20261003000201_admin_api_inbox.sql` | `admin_notification_unreads`, `admin_push_tickets`, the `admin_api_notification_*` functions and `admin_api_top_links`; replaces the web inbox functions with the same signatures and results (needs 0003) |
| `20261003000300_ads_campaigns_breakdown.sql` | `ad_campaigns` (campaign status from the Meta sync) and `ads_breakdown()` |
| `20261003000400_staff_management.sql` | Staff management ([staff.md](staff.md)): `admins.paused_at` / `paused_by`, `leads.found_by` / `booked_by` / `booked_at` (found_by backfilled for outreach leads), `client_credits`, the `site_settings` row `commission`, `admin_api_set_client_credits()`, `admin_api_staff_activity()`, `admin_api_staff_credits()` (needs 0004) |

All new tables have RLS on with no policies (service role only), like every other table, and every new function is executable by `service_role` only. Every file is additive and safe to run twice.

Until a file is applied, the endpoints that need it degrade as follows: without 0001 adding a staff member fails; without 0002 creates run without replay protection (logged); without 0003 phones cannot register and no push is sent; without 0004 outreach writes and filters answer 503 `not_configured`; without 0141 (when the live `link_clicks` has no `id`) `GET /links/clicks` answers 500; without 0201 `GET /overview` and every `/notifications` endpoint answer 500; without 0300 `GET /ads` answers 500; without 0400 pausing, credits and the activity board answer 503 and nothing records who found or booked a lead (everything else keeps working, see [staff.md](staff.md) section 8). Apply them all before the app switches to live.

## Switching the app to live

In the app repo (`tekmadevapp`), build with:

```
EXPO_PUBLIC_API_MODE=live
EXPO_PUBLIC_AUTH_MODE=supabase
EXPO_PUBLIC_SUPABASE_URL=<project url>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
# optional, defaults to https://www.tekmadev.com/api/admin/v1
EXPO_PUBLIC_API_BASE=https://www.tekmadev.com/api/admin/v1
```

Before that: apply the migrations above, deploy the website, then sign in on the phone with an owner account and check Home, Inbox and search. Preview deployments behind Vercel deployment protection will not answer the app.
