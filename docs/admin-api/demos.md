# Demo requests (admin API v1)

Salespeople (staff) add the clients they find through outreach, ads and face to face. Some want to see a demo website first, mostly for Webline. A salesperson asks for a demo with the business details, an owner or manager builds it and adds the link, and the salesperson shows it to the client. The same change lets staff add a client directly (`clients.create` is now owner, manager and staff); whoever adds a client directly gets its credit ([staff.md](staff.md) section 4).

Code: `app/api/admin/v1/demos/**`, `lib/admin-api/demos/` (shared with the web admin), web pages `app/admin/(dashboard)/demos/**`, migration `supabase/migrations/20261005000100_demo_requests.sql`. Envelope, errors, cursors, instants and auth are the same as every other admin route ([README.md](README.md)).

| Method | Path | Capability | Owner | Manager | Staff |
|---|---|---|---|---|---|
| GET | `/demos` | `demos.view` | yes | yes | yes |
| GET | `/demos/:id` | `demos.view` | yes | yes | yes |
| POST | `/demos` | `demos.request` (with `demoUrl`: `demos.manage` too) | yes | yes | yes (no `demoUrl`) |
| PATCH | `/demos/:id` | `demos.view` and (`demos.request` or `demos.manage`), then the rules in section 3 | yes | yes | yes (own requests) |

| Capability | Roles | Meaning |
|---|---|---|
| `demos.view` | OMS | List and read demo requests (all of them, like `clients.view`). |
| `demos.request` | OMS | Create a demo request; edit or cancel your own while it is requested or building; mark your own shown once it is ready. |
| `demos.manage` | OM | Everything on any demo request: status, builder, demo link, builder note, edit, cancel. Also add a demo that is already built (`POST /demos` with `demoUrl`). |
| `clients.create` | OMS (was OM) | Add a client directly. The person who adds it gets the credit as finder and booker (owner decision 2026-10-05, [staff.md](staff.md) section 4). |

`GET /me` lists the new capabilities by itself (`capabilitiesFor`). In `lib/admin-api/permissions.ts` the three demo rows sit after `clients.templates` and before `testdata.view`.

## 1. `DemoRequest`

```ts
type DemoStatus = "requested" | "building" | "ready" | "shown" | "cancelled";

type DemoRequest = {
  id: string;                    // uuid
  status: DemoStatus;
  clientId: string | null;       // at least one of clientId / leadId is set
  clientName: string | null;     // the client's business name
  leadId: string | null;
  leadName: string | null;       // the lead's business name, else the person's name, else the email
  business: {
    name: string;                // 1..120
    type: string;                // kind of business, 1..80
    area: string;                // city or area served, 1..120
    offer: string;               // what they sell or do, 1..1000
    website: string | null;      // 0..500, free text
    brand: string | null;        // 0..500
    customers: string | null;    // 0..500
  };
  wants: string | null;          // 0..2000
  neededBy: string | null;       // YYYY-MM-DD (a Toronto calendar date)
  demoUrl: string | null;        // https only; required to be ready
  builderEmail: string | null;   // a team member's email, lowercased
  builderNote: string | null;    // 0..1000
  requestedBy: string;           // lowercased email of who asked
  requestedByName: string | null;
  createdAt: string;             // ISO 8601 UTC, Postgres microseconds kept
  updatedAt: string;
  readyAt: string | null;        // when it last became ready
  shownAt: string | null;
  cancelledAt: string | null;
  events: { at: string; by: string; byName: string | null; type: "created" | "edited" | "status" | "builder" | "link"; from: string | null; to: string | null }[];
  can: { edit: boolean; cancel: boolean; markShown: boolean; manage: boolean };
};
```

- `events`: oldest first on `GET /demos/:id`, `POST /demos` and `PATCH /demos/:id`; list rows send `[]`. `from` and `to` hold the status (`status`), the builder's email (`builder`) or the demo link (`link`); `created` sends `from: null, to: "requested"`; `edited` (details or the builder note changed) sends both null.
- A demo request for a test client is hidden (404, left out of lists and counts) from roles without `testdata.view`, like the client.
- Shown and cancelled are closed: nothing changes any more.

### `can`, for the caller

| Flag | True when |
|---|---|
| `manage` | the caller has `demos.manage` and the request is open (requested, building, ready) |
| `edit` | `manage`, or the caller asked for it (with `demos.request`) and it is requested or building |
| `cancel` | the same as `edit` |
| `markShown` | the request is ready, and the caller has `demos.manage` or asked for it |

## 2. `GET /demos`

`?status=open|requested|building|ready|shown|cancelled|all&mine=1&clientId=&leadId=&cursor=&limit=`

- `status` defaults to `open` (requested, building and ready). Anything else: 400 `status` "Unknown demo status.".
- `mine=1` (or `true`): only requests the caller asked for.
- `clientId` / `leadId`: one client's or one lead's requests. Not a uuid: 400 `client_id` "Unknown client." / `lead_id` "Unknown lead.".
- Newest first by `createdAt` (ties by id), keyset cursor, `limit` 1..100 (default 30).

```ts
{ items: DemoRequest[]; nextCursor: string | null; counts: { open: number; requested: number; building: number; ready: number; mine: number } }
```

`counts` ignore `status` and `mine` but respect `clientId` and `leadId`. `open`, `requested`, `building` and `ready` count open requests; `mine` counts the caller's own open requests.

## 3. `GET /demos/:id`, `POST /demos`, `PATCH /demos/:id`

`GET /demos/:id` -> `DemoRequest` with events. 404 `not_found` "That demo request no longer exists.".

### `POST /demos` -> 201 `DemoRequest`

```ts
{ clientId?: string; leadId?: string; business: { name, type, area, offer, website?, brand?, customers? }; wants?: string | null; neededBy?: string | null; demoUrl?: string | null; idempotencyKey: string }
```

In order:

1. Exactly one of `clientId` / `leadId`, else 400 `target` "Pick the client or lead this demo is for.".
2. Field rules, all at once: 400 `validation`, `message` the first problem, `fields` keyed `businessName`, `businessType`, `area`, `offer`, `website`, `brand`, `customers`, `wants`, `neededBy`, `demoUrl`. Text is trimmed; blank optional text is null. `demoUrl` follows the PATCH rule: a full `https://` link with a host, at most 2000 characters, else `fields.demoUrl` "Enter a full link starting with https://."; `null` or `""` is no link.
3. The idempotency key: the body's `idempotencyKey`, else the `Idempotency-Key` header (both work). A malformed one (1..200 printable ASCII, no spaces) is 400 `idempotency_key`.
4. A `demoUrl` from a caller without `demos.manage` (staff): 403 `forbidden` "Your role cannot do that.". Nothing is written.
5. Replay: the request id comes from the caller and the key, so the same key with the same body answers the first result (201 again, nothing written twice, no second notification); the same key with a different body, a different `demoUrl` included, is 409 `idempotency_conflict`. No key at all: no replay protection.
6. The client or lead: a trashed client, an unknown one, or a test client for a role without test data is 404 "That client no longer exists."; an unknown lead 404 "That lead no longer exists.".

Without a link the request starts `requested`, with `requestedBy` the caller. A request for a lead that already became a client gets that client's id too (as a conversion would). Writes the `created` event and the "Demo requested" notification (section 5).

#### Already built? Add the link (owner decision 2026-10-08)

Some demos are built before anyone asks, or were built before demo requests existed. An owner or manager sends `demoUrl` with the create, and the request starts `ready` instead:

- `status: "ready"`, `demoUrl` the link, `builderEmail` and `requestedBy` the caller, `readyAt` now. `can` is the builder's: `manage`, `edit`, `cancel` and `markShown` all true.
- Events, oldest first, all by the caller: `created` (`null` to `requested`), `builder` (`null` to the caller's email), `link` (`null` to the link), `status` (`requested` to `ready`). The same history as asking, building and marking it ready by hand.
- No "Demo requested" (nobody needs to build it). "Demo ready" goes out instead (section 5): its push goes to the lead's assignee and finder for a request made for a lead (also when that lead already became a client), or to the client's assigned strategist for a request made for a client. Never to the caller; when nobody is left, no phone rings and the Inbox row is still written.
- From there it is an ordinary ready request: mark it shown, cancel it, or send it back to building (rework) with PATCH.

### `PATCH /demos/:id` -> 200 `DemoRequest` with events

```ts
{ business?: Partial<{ name, type, area, offer, website, brand, customers }>; wants?; neededBy?; status?: DemoStatus; demoUrl?: string | null; builderEmail?: string | null; builderNote?: string | null }
```

Partial: only the keys sent change, `null` (or `""`) clears an optional one. Checked in this order:

| Check | Answer |
|---|---|
| unknown status value | 400 `status` "Unknown demo status." |
| field rules (keys above plus `demoUrl`, `builderEmail`, `builderNote`) | 400 `validation` with `fields` |
| unknown request (or a hidden test one) | 404 `not_found` |
| not the caller's request and no `demos.manage` | 403 `forbidden` "Your role cannot do that." |
| nothing actually changes (every value sent is what it already says) | 200, the request as it is (a retried PATCH is safe) |
| shown or cancelled | 409 `demo_closed` "This demo request is closed." |
| requester without `demos.manage`: link, builder or note; details unless requested or building; a status other than cancelled (from requested or building) or shown (from ready) | 403 `forbidden` |
| `demos.manage`: a status move not in the table below | 422 `status_change` "A demo request cannot move to that status from here." |
| ready (or staying ready) without a demo link | 400 `demo_url` "Add the demo link first." (`fields.demoUrl`) |
| a builder who is not on the team | 400 `validation` (`fields.builderEmail` "Pick someone on the team.") |
| someone else changed it at the same moment, twice in a row | 409 `demo_changed` "Someone else just changed this demo request. Reload and try again." |

Status moves with `demos.manage`:

| From | To |
|---|---|
| requested | building, ready, cancelled |
| building | ready, cancelled |
| ready | building (rework), shown, cancelled |
| shown, cancelled | nothing (closed) |

`requested -> ready` is allowed for a demo built in one go (it still needs its link). Moving to building with nobody building it makes the caller the builder. Becoming ready sets `readyAt` and sends "Demo ready" (section 5); shown sets `shownAt`, cancelled `cancelledAt`. Each change writes its event: `edited` (details or note), `builder`, `link`, `status`, in that order.

## 4. Lead conversion

When a lead becomes a client, its demo requests get the client's id and keep the lead id (`lib/admin-api/demos/link.ts` `linkDemoRequestsToClient`). It runs wherever a client gets its lead: `provisionClient` (`lib/client-provisioning.ts`: admin adds, paid checkouts, the Stripe webhook) and `POST /clients` with `leadId`. Requests already tied to a client keep theirs. It never throws.

## 5. Notifications (Inbox and push)

Inbox rows are shared: one row per event, read by everyone whose role reads its category and audience (there is no per-person Inbox row). What can be narrowed to people is the phone push: `notifyAdmins({ push: { only?, except? } })` (team member emails) limits which phones ring; a person still needs the row's category and audience and Push on for it.

| Event | Category, severity | Audience (Inbox) | Push | Title, body, link |
|---|---|---|---|---|
| `demo.requested` | clients, info | owner audience: owners and managers, exactly `demos.manage` | owners and managers, except whoever asked | `Demo requested: {business.name}`, `{requestedByName or email} asked for a demo, needed by Oct 9.` (the needed-by part only when set), `/admin/demos/{id}` |
| `demo.ready` | clients, success | everyone who reads Clients (owners, managers, staff) | marked ready with PATCH: only the person who asked, and not when they marked it ready themselves. Created ready (`POST /demos` with `demoUrl`): the lead's assignee and finder (a request for a lead) or the client's assigned strategist (a request for a client), never the caller | `Demo ready: {business.name}`, `Open the link and show it to the client.`, `/admin/demos/{id}` |

`demo.ready` notifies again each time a reworked demo becomes ready again. Deep links: `/admin/demos` and `/admin/demos/{id}` (the app maps them to its own routes; unknown paths fall back to the Inbox).

## 6. Web admin

- `/admin/demos`: status chips (Open, Requested, Building, Ready to show, Shown, Cancelled, All), "Mine", counts, newest first, Older and Newest pages. `?clientId=` or `?leadId=` narrows it to one client or lead.
- `/admin/demos/[id]`: the request, the builder's form for `demos.manage` (builder, link, note, and the status buttons allowed now), Mark as shown and Cancel request for the person who asked, Edit the details when `can.edit`, and the history.
- `/admin/demos/new?clientId=...` or `?leadId=...` (optional `businessName`, `area`): the request form, business name filled in from the client or lead. For `demos.manage` it also has "Already built? Demo link" (placeholder `https://name.vercel.app`, help "Paste the link and it is saved as ready to show."), sent as `demoUrl` with the rules of section 3; its error shows under it. With a link the request opens ready, with "Demo saved as ready to show.".
- `components/admin/demos/DemoRequestsCard.tsx` `DemoRequestsCard({ clientId?, leadId?, businessName?, area?, id? })`: a server component listing one client's or lead's requests (`demos.view`) with "Request a demo" (`demos.request`, shown even when the list could not load, like the app's Demo card). It is on the client page and on the lead page (filled in with the lead's business).
- New client page: "Client wants a demo". After the client is created it opens the demo form for that client. With `?leadId=` the page is filled in from the lead and creates the client from it ([staff.md](staff.md) section 9).
- Staff open the New client page through `clients.create`. The page and `POST /clients` run the same function (`createClientByStaff`). When the email is already a client, a role without `clients.edit` gets that client back unchanged: adding a client never edits one.
- The pages above are built for a phone first (iPhone Safari at 375 to 430 px): no sideways scrolling, 16 px inputs, 44 px tap targets, full-width main buttons on a phone.

## 7. Migration `20261005000100_demo_requests.sql` (file only, not applied)

`demo_requests` and `demo_request_events`, their indexes, the `updated_at` trigger (the shared `set_updated_at()`), RLS on with no policies. Additive and safe to run twice. Before it is applied, every `/demos` endpoint answers 503 `not_configured` "Demo requests need a database update first. Ask the owner to apply the demo requests migration.", the client page's Demos card says the same, and lead conversion skips the link quietly; everything else works.

`client_id` is `on delete cascade` (clients are only trashed; the test data purge deletes test clients and their requests). `lead_id` is `on delete set null`, so deleting a lead whose request has no client is refused by the target check: cancel that request or link it first.

## 8. Checklist after it is live

1. Apply the migration in Supabase, then open `/admin/demos` as the owner: it loads with zeros.
2. As a staff member on an iPhone: Clients, Add client, tick "Client wants a demo", create. The demo form opens with the business name filled in. Send it. No money shows anywhere on these pages, and nothing scrolls sideways.
3. As the owner, open that client: the Credit card shows the staff member as finder and booker (100).
4. As the owner or a manager: the Inbox (and the phone) shows "Demo requested: ...". Open it, Start building, add the link, Mark ready.
5. As the staff member: the phone gets "Demo ready: ...". Open the request, Open demo, then Mark as shown.
6. Check the client page's Demos card lists it, and that a staff member cannot change someone else's request.
7. As the owner, for a lead assigned to a staff member: add a demo with its link already filled in. It opens as Ready to show, with no "Demo requested" in the Inbox, and the staff member's phone gets "Demo ready: ...".
