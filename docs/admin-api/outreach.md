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

Nothing here is owner only. A role without the capability gets 403 `forbidden` "Your role cannot do that." (see [permissions.md](permissions.md)). Editing a lead's details through `PATCH /leads/:id` has one more rule for staff (section 4): only on leads they found or that are assigned to them.

## 1. The `Lead`, with outreach fields

`GET /leads`, `GET /leads/:id`, `POST /leads`, `PATCH /leads/:id` and `POST /leads/:id/touches` all answer the same `Lead`. It is the contract's shape (app `src/api/schemas/leads.ts` `zLead`) plus extra keys; zod objects ignore keys they do not list, so older app builds keep working.

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

  // Edit lead (2026-10-08), for the caller who asked:
  canEdit: boolean;              // true when this caller may edit the details (section 4)

  // Bookings (2026-10-20):
  booking: Booking | null;       // the booked call from the calendar, null when there is none ("The booking" below)
};
```

`canEdit` is worked out per caller on every lead the API answers (list rows too): `true` for owners and managers, and for staff on a lead they found (`foundBy`) or that is assigned to them (`assignedTo`). Show the Edit button only when it is `true`; an app build that does not know the key ignores it.

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

### The booking

Every lead the API answers (`GET /leads` rows, `GET /leads/:id`, `POST /leads`, `PATCH /leads/:id`, `POST /leads/:id/touches`) carries `booking`: the call booked through the calendar, read from the Cal.com event the webhook keeps on the lead (`leads.raw`, the newest event), or `null` when the lead has no booking. Code: `lib/admin-api/leads/booking.ts` (`toBooking`). `bookingAt` is unchanged and always equals `booking.start` when both are set.

```ts
type Booking = {
  status: "booked" | "cancelled" | "past";
  start: string;                  // ISO instant (UTC)
  end: string | null;             // ISO instant; null only when neither an end nor a length is known
  durationMinutes: number | null; // the event length, else end minus start
  title: string | null;           // Cal.com's booking title ("Discovery call between Tekmadev and Jane Doe"), else the event type's title
  eventType: string | null;       // the event type slug ("discovery-call")
  timeZone: string | null;        // the booker's IANA zone ("America/Vancouver"), else null
  how: {
    kind: "video" | "phone" | "in_person" | "link" | "other";
    label: string;                // show as sent: "Google Meet", "Zoom", "Cal Video", "Microsoft Teams", "Whereby", "Jitsi", "Webex", "Video call", "Phone call", "In person", "Meeting link", "Other", "Not set"
    detail: string | null;        // the phone number (phone) or the address (in_person, or what was typed for other), or the link (link) when it is not the join link, else null
  };
  joinUrl: string | null;         // https only, never a link the booker could set ("joinUrl" below)
  answers: { key: string; label: string; value: string }[];
  notes: string | null;           // what the booker typed in the notes field, else additionalNotes; never the description (Cal.com copies the event type's there)
  guests: string[];               // guest emails, lowercased, never the booker's own; may be empty
  cancellationReason: string | null; // only on a cancelled booking (a rejected one gives the rejection reason)
  rescheduleReason: string | null;
  rescheduledFrom: string | null; // the previous start (ISO) when the last event was a reschedule, else null
  manageUrl: string | null;       // the Cal.com booking page: <bookerUrl, else https://cal.com>/booking/<uid>; null without a uid
};
```

Rules:

- **Has a booking**: a lead has one when it has a start, from `leads.booking_start` or the payload's `startTime`. A lead booked by hand (status `booked` set from the app, no calendar) has `booking: null`.
- **`status`**: `cancelled` when the last event was `BOOKING_CANCELLED` or `BOOKING_REJECTED`, the payload status is `CANCELLED` or `REJECTED`, or the stored status is `cancelled` or `booking_rejected` (a status set by hand later does not uncancel it). Otherwise `past` once the end (or the start, with no end) is before the time of the request, else `booked`. A pending booking (`BOOKING_REQUESTED`) reads as `booked`. `booking.status` is the call; the lead's own `status` stays the sales status.
- **`how`**: the location type the booker picked (`responses.location.value`), else `payload.location` read as a type (`integrations:google:meet`, `integrations:zoom`, `integrations:daily`, `phone`, `userPhone`, `attendeeInPerson`, `inPerson`, `link`, `somewhereElse`) or as a value (an http(s) URL is `link`, or `video` when its host is a known video app; a phone number is `phone`; any other text is `in_person` with that text as the address), else `video` when Cal.com made a video call, else `{ kind: "other", label: "Not set", detail: null }`. An unknown video app is "Video call".
- **`joinUrl`**: `videoCallData.url` (only Cal.com's video apps write it); else `payload.location` when the type picked is the organizer's (`integrations:*`, `link`, `conferencing`; with no type picked, only a link on a known video app's host: Google Meet, Zoom, Cal Video, Microsoft Teams, Whereby, Jitsi, Webex); else `metadata.videoCallUrl` when there is no `videoCallData` link, its host is a known video app's, and the type picked is not a phone, in person or somewhere else type. Whoever books can add any `metadata` key to the booking page link, and Cal.com lets theirs replace its own, so nothing else in `metadata` is ever a join link. A link location that is not the join link is `how.detail`, to show as text with Copy.
- **`answers`**: every booking form response in form order that is not hidden (`isHidden`), not empty, and not one of `name`, `email`, `location`, `notes`, `guests` or `rescheduleReason` (those have their own keys). `key` is the response key, `label` the question as written in Cal.com (Cal's own fields carry a key such as `phone_number` there, which is sent as words: "Phone number"; with no label, the key as words). `value` is one line of text: lists joined with ", ", a checkbox "Yes" or "No", a choice with its own input as "choice, input".
- **Never an error**: any field Cal.com leaves out or sends as another type reads as `null` (or `[]`); the booking columns (`booking_start`, `booking_end`, `event_type`, `booking_uid`) fill in what raw lacks. A stored booking delivered later (`MEETING_ENDED`, bare response values) reads the same way.
- **Times**: every instant is UTC; show them in America/Toronto like every other date. `timeZone` is the booker's own zone, for an optional "their time" line.
- **Not in the response**: `raw` itself, the tracking in `metadata` (UTM, `lead_ref`), the organizer and hidden answers.
- **Reading cost**: the list selects `raw->>triggerEvent` and `raw->payload` only, never the whole `raw`.

#### Screens (web and app, the same copy)

Web code: `lib/booking-ui.ts` (copy and times), `components/admin/leads/BookedCallPanel.tsx` and `BookedCall.tsx`, `LeadRow.tsx`, and Overview (`app/admin/(dashboard)/page.tsx`). Times are 12 hour with "a.m." and "p.m.", in Toronto.

- **Lead page, "Booked call"** (only when `booking` is set): the first line is the day and time with the end, "Tue, Oct 21, 3:00 p.m. to 3:30 p.m." (the year is added when it is not this year; an end on another day carries its day: "Tue, Oct 21, 11:30 p.m. to Wed, Oct 22, 12:30 a.m."; no end, the start alone). "Their time: 12:00 p.m. (Vancouver)" follows when the booker's clock reads differently from Toronto's at the start (so not for New York), with their day when it is another day there ("Their time: Thu, Oct 22, 6:00 a.m. (Sydney)"); the place is the last part of the zone name in words. "How" is the label, then the phone number (a call link) or the address. "Join call" and "Copy link" show whenever there is a `joinUrl`, except on a cancelled call (Cal.com closes the room); "Join call" opens it and is the primary button from 15 minutes before the start to the end (the start, with no end), never when over; "Copy link" copies it ("Link copied."); "Open in Cal.com" opens `manageUrl`, cancelled or not. Then "Their answers" (each label and value), "Notes" and "Guests", each only when there is something. Cancelled: a "Cancelled" badge and "Reason: ..." when given. Moved (`rescheduledFrom`): "Moved from Mon, Oct 20, 2:00 p.m." and "Reason: ..." (`rescheduleReason`) when given. Over: a "Done" badge. The status is read again against the clock, so a call that ends while the page is open turns "Done" on the next load and Join call stops being primary at once.
- **Leads row**: a call that is not cancelled and not over says when on every width: "Call today, 3:00 p.m.", "Call tomorrow, 3:00 p.m.", "Call Fri, Oct 23, 3:00 p.m.", or "Call now, until 3:30 p.m." while under way. From 15 minutes before the start to the end, and only with a `joinUrl`, a "Join" button opens it (on a phone, on its own line under the row).
- **Overview, "Upcoming calls"** (`leads.view`; the app's Home "Upcoming calls", the same copy and rules): up to 5 calls, soonest first, not cancelled and not over (one under way counts). Each row opens the lead: the lead's name, then the day and time and how ("Tue, Oct 21, 3:00 p.m. · Google Meet"), and how far it is on the right ("in 25 min", "today", "tomorrow", "in 3 days"; "Now" once it started). From 15 minutes before the start to the end, and only with a `joinUrl`, "Join call" sits under its row. Empty: "No upcoming calls."; a failed read says so with Retry. The web reads it with `listUpcomingBookings` (`lib/admin-api/leads/data.ts`); the app reads the same with `GET /leads?booking=upcoming&limit=5` (one page, `nextCursor` null; an unknown `booking` value is a 400).

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
{
  // The lead's details (edit lead, owner decision 2026-10-08): the same rules and limits as POST /leads
  name?: string | null;         // max 120
  business?: string | null;     // max 200
  email?: string | null;        // valid email, stored lowercased
  phone?: string | null;        // 7 to 15 digits, spaces ( ) + . - allowed
  website?: string | null;      // max 300, not checked as a URL (a handle is fine)
  need?: LeadNeed | null;
  message?: string | null;      // max 5,000, line breaks kept

  // Working the lead, as before
  status?: SettableStatus;
  followUpAt?: string | null;
  assignedTo?: string | null;
}
```

Partial: only the keys sent change. `null` (or `""`, or only spaces) clears a field; text is trimmed. An empty body changes nothing. Details, status, follow-up and assignee may come in the same PATCH, and the whole PATCH is checked before anything is written (one failure, nothing changes). Answers the full `Lead`. Unknown id: 404 "That lead no longer exists.". `revenue` is not editable (unknown keys are ignored).

Editing the details (owner decision 2026-10-08): a typo or a new phone number never forces a lead to become a client.

- Who: capability `leads.update`. Owners and managers edit the details of any lead. Staff edit the details only of a lead they found (`foundBy`) or that is assigned to them (`assignedTo`); sending any detail key on another lead is 403 `forbidden` "You can only edit leads you found or that are assigned to you." (nothing is written, not even a status in the same PATCH). The lead's `canEdit` says this ahead of time.
- Status, follow-up and assignee keep their rule: any `leads.update` caller on any lead, staff included. (So staff who assign a lead to themselves may then edit it.)
- Any lead may be edited, whatever its source: added by hand, the lead form, `/grow`, a free tool, a portal sign-up or a booked call. Editing never changes a booked call's status or booking.
- After the PATCH the lead must still have a name or a business, and an email or a phone: 400 `name` "Enter a name or a business." and 400 `email` "Enter an email or a phone number." (the same codes, copy and `fields` as POST /leads). A key not sent keeps what the lead shows, so a business that came from a free tool's form counts.
- One email is one lead: an email another lead already has (any casing) is 409 `duplicate` "That email is already a lead. Find it in Leads and log the touch there." with `fields.email`, the same as POST /leads. The lead's own email, in any casing, is not a change.
- A value the lead already has is not written again, so a form that sends every field changes only what was edited.
- Clearing `business` on a free tool or portal lead shows the business from its form again; clearing `message` on a booked call shows the note left on the booking again (section 1).
- On a lead with a booked call, the booking calendar still owns the status: when the booking is rescheduled or cancelled, the Cal webhook sets `booked` or `cancelled` again, exactly as on the website.
- With CRM outbound sync on, any change to a lead re-queues its CRM contact push (one job per email, deduplicated), like every other lead update. A status set by hand adds no CRM tags. A changed email pushes a contact for the new email; the contact under the old email stays in the CRM.
- The web admin edits through the same `updateLead` (`lib/admin-api/leads/data.ts`) and the same body schema (`leadPatchBody`), so both accept and refuse exactly the same input.
- Web screens: the lead page shows "Edit lead" only when `canEdit` is true. It opens `/admin/leads/[id]/edit`, Add lead's form (the same fields, labels, help and order) filled in with the lead. Only the fields the person changed are sent, so a detail left alone keeps what is stored (a business or note that comes from a form or a booking is not copied onto the lead). Each field error shows under its field and a failed try keeps what was typed; success opens the lead with "Lead updated.".

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
| 400 | `name` | Enter a name or a business. | POST /leads without either, or a PATCH that leaves the lead without either |
| 400 | `name` | Keep the name to 120 characters or fewer. | |
| 400 | `business` | Keep the business name to 200 characters or fewer. | |
| 400 | `email` | Enter an email or a phone number. | POST /leads without either, or a PATCH that leaves the lead without either |
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
| 403 | `forbidden` | You can only edit leads you found or that are assigned to you. | PATCH /leads/:id with a detail key, by staff on a lead they did not find and is not assigned to them |
| 404 | `not_found` | That lead no longer exists. | |
| 409 | `duplicate` | That email is already a lead. Find it in Leads and log the touch there. | POST /leads, or PATCH /leads/:id to an email another lead has (`fields.email` too) |
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
- Bookings (2026-10-20): `zLead` may add `booking: zBooking.nullable().optional()` (undefined from an older server reads as no booking), with `zBooking` matching "The booking" in section 1 exactly; the mock answers `booking` on every lead (a Cal lead with a booking, every other lead `null`).
- Edit lead (2026-10-08): `zLead` may add `canEdit: z.boolean().optional()` (read undefined as false, so an older server shows no Edit button); `LeadPatch` gains the seven detail keys; the mock's PATCH mirrors section 4 (who may edit, the two rules on the whole lead, the 409 on another lead's email, nothing written on a failure, unchanged values not written) and sets `canEdit` on every lead it answers.
