# Staff management and commission credit (admin API v1)

Owner decisions 2026-10-03. Tekmadev is hiring cold outreachers as Staff; this is the server contract for managing them (roles, pausing), seeing what they do (the activity board) and recording who gets credit for each client (commission credit, no dollar math yet). The app and the web admin are built from this page. Everything follows the API rules in [README.md](README.md): the `{ ok, data }` / `{ ok: false, error: { code, message, fields? } }` envelope, instants as ISO strings, calendar dates `YYYY-MM-DD` in Toronto, owner and staff limits enforced here with 403s.

Server files: `lib/admin.ts` (paused), `lib/admin-users.ts` (`updateTeamAccess`), `lib/staff-constants.ts`, `lib/staff-credit.ts`, `lib/staff-activity.ts`, `lib/site-settings.ts` (commission split), `lib/admin-api/team`, `lib/admin-api/staff`, `lib/admin-api/leads`, `lib/admin-api/clients/core/writes.ts` (`leadId`). Migration: `supabase/migrations/20261003000400_staff_management.sql`.

```ts
type Role = "owner" | "manager" | "staff";
type StaffRef = { email: string; name: string | null }; // the same shape leads use
type CreditRole = "finder" | "booker" | "other";
```

## 1. Capabilities

Seven new names, at the end of the team rows in `lib/admin-api/permissions.ts` (and in every copy of the table: the app's `src/auth/capabilities.ts` and its mock). `GET /me` `capabilities` sends them like every other name.

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `team.role` | yes | yes | | Change a role (`PATCH /team/:email` `role`). Managers switch people between manager and staff. |
| `team.pause` | yes | yes | | Pause or resume access (`PATCH /team/:email` `paused`). Managers pause managers and staff, never owners. |
| `team.activity` | yes | yes | | Everyone's activity and credits (`GET /team/activity`). |
| `activity.own` | yes | yes | yes | Your own activity and your own credit rows (`GET /me/activity`, your rows in a client's credits). |
| `clients.credits.view` | yes | yes | | Every credit row on a client (`GET /clients/:id/credits`, the bundle's `credits`), credit activity entries, `GET /settings/commission`. |
| `clients.credits.edit` | yes | yes | | Edit a client's credits (`PUT /clients/:id/credits`). |
| `commission.settings` | yes | | | Set the default split (`PUT /settings/commission`). Owners only. |

A missing capability answers 403 as usual: `owner_only` "That section is owner only." for owner-only names (`team.remove`, `team.owners`, `commission.settings`), `forbidden` "Your role cannot do that." otherwise.

## 2. Roles and pausing

### `TeamMember` (GET /team, POST /team, PATCH /team/:email)

```ts
type TeamMember = {
  email: string;
  name: string | null;
  role: Role;
  lastSignInAt: string | null;
  addedAt: string;
  envOwner: boolean;          // ADMIN_EMAILS owner: locked (show a lock), never re-roled, paused or removed
  paused: boolean;            // NEW: access paused
  pausedAt: string | null;    // NEW: when, null when not paused
  pausedBy: StaffRef | null;  // NEW: who paused them, null when not paused
};
```

`GET /team` order is unchanged (env owners, then owners, then managers and staff, oldest first); paused people stay in the list.

### `PATCH /team/:email` `{ role?, paused? }` -> `TeamMember`

- The email is URL-encoded in the path, like `DELETE /team/:email`.
- Only what is sent changes. `role`: `"owner" | "manager" | "staff"`. `paused`: `true` pauses, `false` resumes. Sending what is already true changes nothing (pausing again keeps the first `pausedAt`). A body with neither key changes nothing and answers the member.
- The route needs `team.role` or `team.pause` (staff get 403 `forbidden`). Then, first match wins:

| Status | code | message | when |
|---|---|---|---|
| 400 | `role` | Pick Owner, Manager or Staff. | `role` is not one of the three |
| 400 | `paused` | Send paused as true or false. | `paused` is not a boolean |
| 403 | `forbidden` | Your role cannot do that. | `role` without `team.role`, or `paused` without `team.pause` |
| 403 | `owner_only` | That section is owner only. | `role: "owner"` without `team.owners` (managers never make owners) |
| 422 | `locked` | This owner is locked. Nobody can change their role or pause them. | the target is an env owner (anyone asking, owners included) |
| 404 | `not_found` | That team member no longer exists. | not on the team |
| 422 | `self` | You cannot change your own role. | your own email with `role` |
| 422 | `self` | You cannot pause yourself. | your own email with `paused` |
| 403 | `owner_only` | That section is owner only. | the target is an owner and the caller lacks `team.owners` (managers never touch owners: no role change, no pause) |
| 503 | `not_configured` | Pausing needs a database update first. Ask the owner to apply the staff management migration. | `paused` before migration 0400 is applied |

- Owners may set any role on anyone except env owners and themselves (demoting another owner included). Managers move people between manager and staff and pause or resume managers and staff.
- Each change writes an owner-audience Inbox row in the Team category: `team.admin_role_changed` "Team role changed", `team.admin_paused` "Team member paused", `team.admin_resumed` "Team member resumed".
- The app asks HoldToConfirm before pausing; resuming needs no hold.
- The same rules are `updateTeamAccess()` in `lib/admin-users.ts` for the web Team page (it answers `{ ok: false, code, error }` with the codes above).

### A paused person

- Every admin API request answers **403 `paused`** "Your access is paused. Ask an owner or manager." (from auth, before any capability: `GET /me`, `POST /devices`, everything). Never a 401.
- The app: on 403 `paused` from any call, sign out and show that message on the sign-in screen. Signing in again works at Supabase, but the first `GET /me` answers 403 `paused` again, so show the message and stay signed out.
- The web admin: the login refuses them with the same message (`/admin/login?e=paused`), and an open web session is sent there on the next page load.
- No pushes: their phones stay registered and ring again after Resume.
- Nothing is deleted: role, leads, touches, assignments and credits all stay. They stay assignable and creditable. Resume restores everything at once.

## 3. Lead credit: `foundBy` and `bookedBy`

`Lead` (every endpoint that answers a lead) gains two keys, filled by the server:

```ts
type Lead = {
  // ...every existing key...
  foundBy: StaffRef | null;   // who found it and added it by hand: credit role "finder"
  bookedBy: StaffRef | null;  // who first moved it to booked or logged the booking: credit role "booker"
};
```

- `POST /leads` (a lead added by hand) records the caller as `foundBy`. Added with `status: "booked"`, the caller is `bookedBy` too.
- **"booked" is now settable by hand** (`PATCH /leads/:id` `status`, `POST /leads/:id/touches` `status`, `POST /leads` `status`) on a lead with **no calendar booking**: a call booked by phone, DM or email. The first person to book a lead becomes `bookedBy`; later bookings by others change nothing. A touch with `status: "booked"` is "the touch that books it".
- On a lead the booking calendar owns (source `cal_booking`, or any lead a Cal booking was attached to), the calendar sets booked and cancelled, because that status drives the CRM's booked-call reminders. Sending `"booked"` to such a lead that already shows booked changes nothing but records the caller as `bookedBy` when nobody is yet (logging that you booked it); on such a lead that shows anything else it is refused. `"cancelled"` is never settable.
- Settable statuses are now `new`, `booked`, `contacted`, `qualified`, `won`, `lost` (the app's `zSettableLeadStatus` adds `booked`).

| Status | code | message | when |
|---|---|---|---|
| 400 | `status` | Cancelled comes from the booking calendar. Pick another status. | `"cancelled"` (this replaces "Booked and cancelled come from the booking calendar...") |
| 400 | `status` | This lead booked through the calendar, so the calendar sets booked. Pick another status. | `"booked"` on a calendar lead that does not show booked (refused before the touch is written) |
| 400 | `status` | Unknown lead status. | anything else |

- Leads added by hand before migration 0400 get `foundBy` backfilled: whoever added it (the app recorded it), else whoever logged its first touch, else its owner. Calendar, form, free tool and portal leads have `foundBy: null`.
- Before migration 0400 is applied, `foundBy` falls back to `addedBy` for outreach leads, `bookedBy` is null and nothing is recorded; lead endpoints keep working.
- Known gap: when an outreach lead books through the Cal link itself, the Cal webhook records the booking as its own `cal_booking` lead (it only attaches bookings to /grow form leads), so nobody is credited automatically. The person who got the booking logs it on the outreach lead (a touch or PATCH with `status: "booked"`), or on the Cal lead while it shows booked.

## 4. Client credits

### `POST /clients` gains `leadId`

```ts
type NewClientInput = { /* ...existing... */ leadId?: string | null };
```

"Create client from this lead" passes the lead's id. Then:

- The client is linked to the lead (`clients.lead_id`, so the lead's `convertedClientId` points at it). A reused client (same email) that has no lead yet is linked too; one already linked to another lead keeps its link.
- The lead's finder and booker are copied to the client's credits with the default split (section 6), only when the client has no credits yet (a reused client keeps any edit):
  - finder and booker both known: finder gets the finder share, booker the booker share (two rows);
  - the same person in both roles: both rows, 100 together;
  - only one of them known: they get 100 in that role;
  - nobody known: no credit.
- The copy is logged as the internal activity entry `credits.created` "Credits set from the lead".
- Credit is a bonus on the create: if it fails (or migration 0400 is not applied), the client is still created and the failure is logged on the server.
- Needs `clients.create` as before, and `leads.convert` when `leadId` is sent.

| Status | code | message | fields |
|---|---|---|---|
| 400 | `lead_id` | That lead no longer exists. | `leadId` |
| 409 | `lead_converted` | That lead is already a client. Open it from the lead. | `leadId` (another, not trashed client with a different email already came from this lead) |
| 400 | `input` | Check the highlighted fields. | `leadId`: "Send text." (not a string) |

### Shapes

```ts
type ClientCredit = { email: string; name: string | null; role: CreditRole; share: number }; // share: 0.01..100, two decimals at most

type ClientCredits = {
  clientId: string;
  scope: "all" | "own";       // "all": every row (clients.credits.view); "own": only the caller's rows
  leadId: string | null;      // the lead this client was created from
  credits: ClientCredit[];    // finder, then booker, then other; biggest share first; then email
  updatedAt: string | null;   // the newest change among the rows shown
};
```

- `GET /clients/:id` (the bundle) gains `credits: ClientCredit[]`: every row for owners and managers, only the caller's own rows for staff (often empty). Before migration 0400 it is `[]`.
- Staff never see anyone else's rows or shares, and never money (there is none yet). Activity entries `credits.created` and `credits.updated` name everyone's shares, so they are left out of the bundle's activity page and `GET /clients/:id/activity` without `clients.credits.view`. `GET /meta` `activityEvents` labels both.

### `GET /clients/:id/credits` -> `ClientCredits`

- Needs `clients.credits.view` (scope `all`) or `activity.own` (scope `own`).
- 404 `not_found` "That client no longer exists." for a trashed client, and for a test client without `testdata.view`.
- 503 `not_configured` "Credits need a database update first. Ask the owner to apply the staff management migration." before migration 0400.

### `PUT /clients/:id/credits` `{ credits: [{ email, role, share }], note }` -> `ClientCredits`

- Needs `clients.credits.edit` (owners and managers). Replaces every row of the client.
- `email`: someone on the team (env owners and every team member, paused people included), trimmed and lowercased. `role`: `finder | booker | other`. `share`: a number above 0 and at most 100 with at most two decimals. Each person at most once per role (one person may hold several roles). At most 20 rows.
- The shares add up to exactly 100, or the list is empty (nobody gets credit).
- `note`: required, trimmed, 1 to 500 characters: why it changed.
- The change is logged as the internal activity entry `credits.updated` "Credits changed" (who, the credits before and after, the note). Sending the same credits again changes and logs nothing.

| Status | code | message | fields |
|---|---|---|---|
| 400 | `credits` | Send the credits as a list. | `credits` |
| 400 | `credits` | Pick someone on the team. | `credits` |
| 400 | `credits` | Pick finder, booker or other. | `credits` |
| 400 | `credits` | Enter a share from 0.01 to 100, with at most two decimals. | `credits` |
| 400 | `credits` | List each person once per role. | `credits` |
| 400 | `credits` | Keep it to 20 credits or fewer. | `credits` |
| 400 | `total` | Shares must add up to 100. | `credits` |
| 400 | `note` | Add a note saying why. | `note` |
| 400 | `note` | Keep the note to 500 characters or fewer. | `note` |
| 404 | `not_found` | That client no longer exists. | |
| 503 | `not_configured` | Credits need a database update first. Ask the owner to apply the staff management migration. | |

`credits` problems are checked before `note` (zod order); the team, duplicate and total checks run once the shape is valid.

## 5. Activity board

### `GET /team/activity?range=7d|30d|all` -> `StaffActivity` (needs `team.activity`)
### `GET /me/activity?range=7d|30d|all` -> `StaffActivity` with exactly one row, the caller's (needs `activity.own`)

```ts
type StaffActivity = {
  range: "7d" | "30d" | "all";
  since: string | null;        // start of the range: Toronto midnight as an ISO instant; null for all time
  today: string;               // YYYY-MM-DD in Toronto: what "due today" means
  rows: StaffActivityRow[];
};

type StaffActivityRow = {
  email: string;
  name: string | null;
  role: Role;
  paused: boolean;
  leadsFound: number;          // leads they added by hand (foundBy), created in the range
  touches: { call: number; email: number; dm: number; meeting: number; other: number; total: number }; // touches they logged in the range
  followUps: { dueToday: number; overdue: number }; // leads assigned to them with a follow-up today (Toronto) / before today; NOT ranged
  callsBooked: number;         // leads they booked (bookedBy), booked in the range
  clientsWon: number;          // their credit shares / 100 over clients created in the range: 1.5 = one whole client and a half
  clientsHelped: number;       // distinct clients where they changed or added a task, logged a call, or wrote a note or an update, in the range
  credits: {                   // their credit rows on clients created in the range, newest client first
    clientId: string;
    businessName: string;
    role: CreditRole;
    share: number;
    wonAt: string;             // when the client was created
  }[];
};
```

- `range` defaults to `7d` when absent or empty; anything else answers 400 `range` "Pick 7d, 30d or all.".
- Ranges are Toronto calendar days: `7d` is today and the six days before it from midnight, `30d` today and the 29 before it, `all` everything.
- Test clients and trashed clients never count toward `clientsWon` or `credits`; test clients never count toward `clientsHelped`.
- `GET /team/activity` has one row per team member (env owners, owners, managers, staff; paused people too, with `paused: true`). Rows are sorted by `clientsWon`, then `callsBooked`, `touches.total`, `leadsFound` (all descending), then name; the app may re-sort.
- Staff call `GET /me/activity` ("My activity"); `GET /team/activity` answers them 403 `forbidden`.
- 503 `not_configured` "The activity board needs a database update first. Ask the owner to apply the staff management migration." before migration 0400.

## 6. Default split: `GET` and `PUT /settings/commission`

```ts
type CommissionSplit = { finder: number; booker: number }; // each 0..100, two decimals at most, adding up to 100
```

- `GET /settings/commission` -> `CommissionSplit`. Needs `clients.credits.view` (owners and managers). `{ finder: 50, booker: 50 }` until the owner changes it.
- `PUT /settings/commission` `{ finder, booker }` -> the saved `CommissionSplit`. Needs `commission.settings` (owners only: managers get 403 `owner_only`). It applies to clients created from then on; existing credits never change. Logged as the owner-audience Inbox row `settings.commission_changed` "Commission split changed" (Team category).

| Status | code | message | fields |
|---|---|---|---|
| 400 | `finder` / `booker` | Enter a number from 0 to 100, with at most two decimals. | `finder` and/or `booker` |
| 400 | `split` | Finder and booker must add up to 100. | `finder`, `booker` |
| 500 | `db` | Could not save. Nothing changed. Try again. | |

## 7. `GET /meta` additions (team fragment)

```ts
creditRoles: { value: CreditRole; label: string; help: string }[];
// finder "Finder" "Found the lead and added it.", booker "Booker" "Booked the call.", other "Other" "Helped win the client another way."
activityRanges: { value: "7d" | "30d" | "all"; label: string }[];
// "7 days", "30 days", "All time"
```

`activityEvents` (clients fragment) adds `credits.created` "Credits set from the lead" and `credits.updated` "Credits changed". The Inbox catalogue (`notificationEvents`) adds `team.admin_role_changed`, `team.admin_paused`, `team.admin_resumed` and `settings.commission_changed`.

## 8. Migration `20261003000400_staff_management.sql` (file only, not applied)

| What | Detail |
|---|---|
| `admins.paused_at`, `admins.paused_by` | Pausing. |
| `leads.found_by`, `leads.booked_by`, `leads.booked_at` | Lead credit; `found_by` backfilled for `source = 'outreach'` from `form.added_by`, else the first touch's `by_email`, else `assigned_to`. |
| `clients.lead_id` | Already exists (references `leads`, on delete set null): used as the source lead. Only an index is added. |
| `client_credits` | `id`, `client_id` (references `clients`, on delete cascade), `staff_email` (lowercased), `role` (finder, booker, other), `share` numeric(5,2) 0..100, `updated_by`, `created_at`, `updated_at`, unique (`client_id`, `staff_email`, `role`). RLS on, no policies, revoked from anon and authenticated. |
| `site_settings` `commission` | `{"finder": 50, "booker": 50}` (kept if it exists). |
| `admin_api_set_client_credits(uuid, jsonb, text, boolean)` | Replaces a client's credits in one transaction; refuses a total other than 0 or 100. |
| `admin_api_staff_activity(text[], timestamptz, timestamptz, timestamptz)`, `admin_api_staff_credits(text[], timestamptz)` | The activity board, counted in the database. |

Needs `20261003000004_lead_outreach.sql` first (it stops with a message otherwise). Every function is executable by `service_role` only. Safe to run twice.

Until it is applied: everyone keeps signing in (the paused column is read only when it exists), `PATCH /team/:email` changes roles but answers 503 for `paused`, leads keep working without `foundBy`/`bookedBy` being recorded, `POST /clients` with `leadId` links the lead but creates no credits, the bundle's `credits` is `[]`, and `GET`/`PUT /clients/:id/credits`, `GET /team/activity` and `GET /me/activity` answer 503 `not_configured`. `GET /settings/commission` answers the 50 / 50 default (the row is missing); `PUT` creates the row.

## 9. Checklists

App:

- Add the seven capabilities to `src/auth/capabilities.ts` and the mock's copy, same order, at the end of the team rows.
- `zTeamMember` gains `paused`, `pausedAt`, `pausedBy` (optional for older servers). Team screen: Change role (`team.role`; offer manager and staff, plus owner with `team.owners`), Pause / Resume (`team.pause`, HoldToConfirm to pause), never on env owners (lock), never on yourself, and for managers never on owners. Role badge: Owner gold, Manager neutral, Staff muted.
- Handle 403 `paused` everywhere: sign out with the message.
- `zLead` gains `foundBy`, `bookedBy` (optional). `zSettableLeadStatus` adds `booked`; show the calendar message when the server refuses it.
- New client from a lead passes `leadId`.
- Client screen: credits card from the bundle's `credits` (staff: "Your credit"), editor with `PUT /clients/:id/credits` (`clients.credits.edit`), labels from `GET /meta` `creditRoles`.
- Activity board (`team.activity`) and My activity (`activity.own`), range picker from `activityRanges`.
- Settings: default split (`commission.settings` to edit, `clients.credits.view` to read).
- Mock: implement the rules and copy above.

Web admin:

- The login already shows the paused message; `requireAdmin` already sends a paused session there.
- The client page already hides `credits.*` activity from staff (it uses `hiddenActivityPrefixes`).
- Team page: role change and pause with `updateTeamAccess()` (`lib/admin-users.ts`); show `paused`, `pausedAt`, `pausedBy` from `listAdmins()`.
- Client page: credits from `readClientCredits()`, edits with `checkCredits()` + `saveClientCredits()` (`lib/staff-credit.ts`), the same capabilities.
- Activity: `loadStaffActivity()` (`lib/staff-activity.ts`). Settings: `getCommissionSplit()` / `setCommissionSplit()` (`lib/site-settings.ts`).
- New client from a lead: pass the lead to the same flow (`lead_id` on `provisionClient`, then `creditClientFromLead()`).
