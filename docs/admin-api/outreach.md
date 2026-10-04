# Outreach on leads (admin API v1)

Staff, managers and the owner work leads from the phone: add a lead found by hand, log every call, email, DM or meeting, set the next follow-up and who owns the lead. These endpoints sit next to the contract's `GET /leads` and `GET /leads/:id` and follow the same rules (envelope, cursors, instants, Idempotency-Key, partial PATCH). Code: `app/api/admin/v1/leads/**`, `lib/admin-api/leads/`.

| Method | Path | Capability | Owner | Manager | Staff |
|---|---|---|---|---|---|
| GET | `/leads` | `leads.view` | yes | yes | yes |
| GET | `/leads/:id` | `leads.view` | yes | yes | yes |
| POST | `/leads` | `leads.create` | yes | yes | yes |
| PATCH | `/leads/:id` | `leads.update` | yes | yes | yes |
| GET | `/leads/:id/touches` | `leads.view` | yes | yes | yes |
| POST | `/leads/:id/touches` | `leads.outreach` | yes | yes | yes |
| GET | `/leads/assignees` | `leads.update` or `leads.create` | yes | yes | yes |

Nothing here is owner only. A role without the capability gets 403 `forbidden` "Your role cannot do that." (see [permissions.md](permissions.md)).

## 1. The `Lead`, with outreach fields

`GET /leads`, `GET /leads/:id`, `POST /leads`, `PATCH /leads/:id` and `POST /leads/:id/touches` all answer the same `Lead`. It is the contract's shape (app `src/api/schemas/leads.ts` `zLead`) plus four keys; zod objects ignore keys they do not list, so older app builds keep working.

```ts
type StaffRef = { email: string; name: string | null }; // show the name, else the email

type Lead = {
  // Contract fields (docs/api-requests/leads.md in the app repo), unchanged:
  id: string;
  name: string | null;
  email: string;                 // "" when the lead has no email yet (added by phone only)
  phone: string | null;
  business: string | null;
  status: "new" | "booked" | "contacted" | "qualified" | "won" | "lost" | "cancelled";
  source: "cal_booking" | "grow" | "lead_magnet" | "portal_signup" | "outreach";  // "outreach" is new
  need: "customers" | "website" | "custom" | "content" | "unsure" | null;
  revenue: "pre" | "under_10k" | "10k_20k" | "20k_50k" | "50k_100k" | "100k_plus" | null;
  message: string | null;        // as typed; for a booked call without one, the note left on the booking
  bookingAt: string | null;
  createdAt: string;
  utm: { source: string | null; medium: string | null; campaign: string | null };
  referrer: string | null;
  convertedClientId: string | null;

  // Outreach:
  website: string | null;        // their site or a social profile, as typed
  followUpAt: string | null;     // ISO instant of the next planned contact; null: none planned
  assignedTo: StaffRef | null;   // who owns the lead; null: nobody
  addedBy: StaffRef | null;      // who added it by hand (source "outreach" only)
  foundBy: StaffRef | null;      // who found it (finder credit), staff.md
  bookedBy: StaffRef | null;     // who first booked it (booker credit), staff.md
};
```

### Status folding

The website stores more status values than the app's seven. The API folds them so a badge and its filter always agree:

| Stored value | App status |
|---|---|
| `new`, `signed_up` (portal account, not paid), empty, anything unknown | `new` |
| `booked`, `rescheduled`, `booking_requested`, `booking_paid`, `meeting_started`, `meeting_ended` | `booked` |
| `cancelled`, `booking_rejected` | `cancelled` |
| `won`, `converted` (paid and became an onboarding client) | `won` |
| `contacted`, `qualified`, `lost` | themselves |

`?status=booked` returns exactly the rows that show "booked". Setting a status the lead already shows writes nothing, so a rescheduled booking stays rescheduled underneath.

### Settable statuses

A person may set `new`, `booked`, `contacted`, `qualified`, `won` or `lost` (staff management, [staff.md](staff.md) section 3). `cancelled` mirrors the booking calendar, so the API refuses it: 400 `status` "Cancelled comes from the booking calendar. Pick another status.". `booked` may be set by hand on a lead with no calendar booking (a call booked by phone or DM), and records the first person who did as the lead's `bookedBy`. On a lead the calendar owns (source `cal_booking`, or a lead a Cal booking was attached to) the calendar sets booked, because that status drives the CRM's booked-call reminders: sending `booked` to one that already shows booked only records the booker, and to one that shows anything else is 400 `status` "This lead booked through the calendar, so the calendar sets booked. Pick another status.".

## 2. `GET /leads`: two more filters

Everything in the contract stays (`q`, `source`, `status`, `need`, `cursor`, `limit`; newest first; unknown values are 400). `source=outreach` lists leads added by hand. Two optional filters, combinable with the others:

| Param | Values | Meaning |
|---|---|---|
| `assigned` | `me`, `none`, or a staff email | Leads owned by the caller, by nobody, or by that person. Anything else: 400 `assigned` "Unknown assignee." |
| `followUp` | `due`, `upcoming`, `any` | The follow-up queue: follow-up at or before now, after now, or any planned. Anything else: 400 `follow_up` "Unknown follow-up filter." |

With `followUp` the list is sorted soonest follow-up first (not newest first), so "My follow-ups due" is `GET /leads?assigned=me&followUp=due`. A cursor belongs to its sort: sending a follow-up cursor without `followUp` (or the reverse) is 400 `cursor` "That page is out of date. Pull to refresh.".

`q` matches name, email, business and phone ("contains", any case). A query of digits also matches phones typed with spaces, dots or dashes (`6135550199` finds `(613) 555-0199`).

## 3. `POST /leads` (Idempotency-Key)

Adds a lead by hand. Source is always `outreach`.

```ts
// body: every key optional, but see the two rules below
{
  name?: string | null;         // max 120
  business?: string | null;     // max 200
  email?: string | null;        // valid email, stored lowercased
  phone?: string | null;        // 7 to 15 digits, spaces ( ) + . - allowed
  website?: string | null;      // max 300, not checked as a URL (a handle is fine)
  need?: LeadNeed | null;
  revenue?: LeadRevenue | null;
  message?: string | null;      // what you know about them, max 5,000
  status?: "new" | "contacted" | "qualified" | "won" | "lost";   // default "new"
  followUpAt?: string | null;   // ISO instant with a zone
  assignedTo?: string | null;   // staff email; absent: the caller; null: nobody
}
```

- Rules: a name or a business, and an email or a phone. Blank strings count as not given.
- One email is one lead. An email already on any lead (any casing) is 409 `duplicate`; find that lead and log the touch on it.
- Answers **201** with the full `Lead`. A retry with the same Idempotency-Key answers the same lead (the lead id is derived from the key, so even without the replay table the lead is written once).
- The person adding the lead is recorded (`addedBy`), and is the lead's `foundBy` (their finder credit, [staff.md](staff.md)).
- With CRM outbound sync on, a lead with an email becomes a CRM contact like every other lead (source "outreach", no tags, no newsletter consent).

## 4. `PATCH /leads/:id`

```ts
{ status?: SettableStatus; followUpAt?: string | null; assignedTo?: string | null }
```

Partial: only the keys sent change. `null` (or `""`) clears the follow-up or the assignee. An empty body changes nothing. Answers the full `Lead`. Unknown id: 404 "That lead no longer exists.".

- On a lead with a booked call, the booking calendar still owns the status: when the booking is rescheduled or cancelled, the Cal webhook sets `booked` or `cancelled` again, exactly as on the website.
- With CRM outbound sync on, any change to a lead re-queues its CRM contact push (one job per email, deduplicated), like every other lead update. A status set by hand adds no CRM tags.

## 5. Touches

A touch is one contact attempt with a lead.

```ts
type Touch = {
  id: string;
  leadId: string;
  kind: "call" | "email" | "dm" | "meeting" | "other";
  outcome: string | null;   // short result in their words: "Left a voicemail", "Wants a quote"
  note: string | null;      // longer note, line breaks kept
  by: StaffRef;             // who logged it
  at: string;               // ISO instant when it happened
};
```

### `GET /leads/:id/touches?cursor=&limit=` -> `Page<Touch>`

Newest first, `limit` default 30, max 100. Unknown lead: 404 "That lead no longer exists.".

### `POST /leads/:id/touches` (Idempotency-Key) -> 201 `{ touch: Touch; lead: Lead }`

```ts
{
  kind: TouchKind;
  outcome?: string | null;      // max 200
  note?: string | null;         // max 5,000
  at?: string;                  // when it happened (ISO instant); default now; not in the future, at most a year back
  status?: SettableStatus;      // set the lead's status in the same call
  followUpAt?: string | null;   // set or clear the next follow-up in the same call
}
```

- Business rule (server side, the app does not decide it): logging a `call`, `email`, `dm` or `meeting` on a lead that shows `new` moves it to `contacted`, unless `status` is sent. `other` changes nothing. Leads in any other status keep it.
- The answer carries the updated lead, so the detail screen never recomputes the badge.
- A retry with the same Idempotency-Key never logs the touch twice (its id is derived from the key).

## 6. `GET /leads/assignees` -> `StaffRef[]`

Everyone a lead can be assigned to (owners, managers and staff), sorted by name, for the "Assigned to" picker. Emails and names only: no roles, since staff may not read the Team screen.

## 7. `GET /meta`

The leads fragment gains a new list:

```ts
leadTouchKinds: { value: TouchKind; label: string }[];  // Call, Email, DM, Meeting, Other
```

`leadSources` ends with `{ value: "outreach", label: "Outreach" }`: `LIST_OUTREACH_SOURCE` in `lib/admin-api/meta/leads.ts` is on, because the app's outreach screens ship in the same release as this server. Turn it off only to serve an app build whose `zLeadSource` lacks `outreach` (such a build logs schema drift in dev; production builds are unaffected).

## 8. Errors

| Status | code | message | When |
|---|---|---|---|
| 400 | `name` | Enter a name or a business. | POST /leads without either |
| 400 | `name` | Keep the name to 120 characters or fewer. | |
| 400 | `business` | Keep the business name to 200 characters or fewer. | |
| 400 | `email` | Enter an email or a phone number. | POST /leads without either |
| 400 | `email` | Enter a valid email. | |
| 400 | `phone` | Enter a valid phone number. | |
| 400 | `website` | Keep the website to 300 characters or fewer. | |
| 400 | `message` | Keep the note to 5,000 characters or fewer. | |
| 400 | `need` | Unknown lead need. | |
| 400 | `revenue` | Unknown revenue band. | |
| 400 | `status` | Unknown lead status. | |
| 400 | `status` | Cancelled comes from the booking calendar. Pick another status. | |
| 400 | `status` | This lead booked through the calendar, so the calendar sets booked. Pick another status. | `booked` on a calendar lead that does not show booked |
| 400 | `follow_up_at` | Enter a valid follow-up time. | not an ISO instant with a zone, before 2020 or over ten years out |
| 400 | `assigned_to` | Pick someone on the team. | not an email, or not on the team |
| 400 | `kind` | Pick a call, email, DM, meeting or other. | |
| 400 | `outcome` | Keep the outcome to 200 characters or fewer. | |
| 400 | `note` | Keep the note to 5,000 characters or fewer. | |
| 400 | `at` | Enter a valid time for the touch. / That time is in the future. / Log touches from the last year only. | |
| 400 | `assigned` | Unknown assignee. | GET /leads filter |
| 400 | `follow_up` | Unknown follow-up filter. | GET /leads filter |
| 404 | `not_found` | That lead no longer exists. | |
| 409 | `duplicate` | That email is already a lead. Find it in Leads and log the touch there. | POST /leads (`fields.email` too) |
| 503 | `not_configured` | Outreach needs a database update first. Ask the owner to apply the lead outreach migration. | before `20261003000004_lead_outreach.sql` |

Validation failures also carry `fields` keyed by the body field (`followUpAt`, `assignedTo`, ...) for inline errors.

## 9. Database

Migration `supabase/migrations/20261003000004_lead_outreach.sql` (from the foundation): `leads.follow_up_at`, `leads.assigned_to`, `lead_touches`. Who added a lead by hand is kept in `leads.form.added_by`, so no further migration is needed.

Until that migration is applied, `GET /leads` and `GET /leads/:id` keep working (outreach fields read as null), and every outreach write or filter answers 503 `not_configured`.

## 10. What the app needs to change

- `zLeadSource` gains `'outreach'` (label "Outreach" from meta, once the server turns on `LIST_OUTREACH_SOURCE`). Until the app lists it, dev builds log drift for leads with source `outreach` (only leads added through `POST /leads` have it); production builds are unaffected.
- `zLead` may add `website`, `followUpAt`, `assignedTo`, `addedBy` (optional in the schema keeps older fixtures valid).
- New schemas: `zTouch`, `zTouchPage`, `zLogTouchResult` (`{ touch, lead }`), `zStaffRef`, and `leadTouchKinds` in the leads meta fragment.
- New endpoints in `src/api/endpoints/leads.ts` and mock routes mirroring the rules above (the status folding, the auto "contacted", the 409 on email).
