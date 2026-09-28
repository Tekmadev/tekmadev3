# CRM sync: what to set up, in order

The site syncs leads, newsletter subscribers, unsubscribes and client appointments with GoHighLevel. Everything ships switched OFF. Nothing is pushed, pulled or suppressed until you turn each leg on from `/admin/crm`, so the steps below can be done over several sittings.

Work top to bottom. Each step is safe to do early and safe to re-run.

---

## 1. GoHighLevel: set contact matching to email

Sub-account settings, "Allow Duplicate Contact": set it to deduplicate on **Email**, with Email **first** in the priority order.

Do this before anything else. Which contact an update matches is decided by this setting and not by what the site sends, so if it is set to phone first the same request can land on the wrong person. The site cannot read this setting, which is why step 6 tests it against a throwaway contact.

## 2. GoHighLevel: leave the unsubscribe footer ON

Sub-account settings > Business Profile > General: leave **"Include Unsubscribe Link"** ON.

Turning it off means manually adding an unsubscribe tag to every email and can get your sending suspended. It buys nothing either way, because the underlying `List-Unsubscribe` header cannot be disabled at all. That is also why the site has to listen for unsubscribes that start on their side: some always will.

## 3. GoHighLevel: create the Private Integration token

Agency settings (you may need to enable it under Labs) > create a **sub-account** Private Integration with these scopes:

- `contacts.readonly`
- `contacts.write`
- `locations/customFields.readonly`
- `locations/customFields.write`
- `calendars/events.readonly`

Copy the token immediately, and copy the sub-account's **location id**.

The token never expires and its scopes can be edited later without reissuing it. A rotation gives you a 7 day window where both the old and the new token work, so it can be swapped with no downtime.

## 4. Vercel: add the two variables, then redeploy

Add to Production:

- `GHL_PIT_TOKEN` - the token from step 3
- `GHL_LOCATION_ID` - the location id from step 3

Then redeploy. Environment changes only take effect on a deploy. Everything stays switched off, so this is safe to do at any point.

## 5. Vercel: two things to check

- **Cron frequency.** The retry sweep wants to run every 10 minutes, but this project is on the Hobby plan, which only allows crons that run once a day (anything more frequent fails the whole deploy, which is what happened on 2026-09-27). So `vercel.json` runs it daily at 21:00 UTC, twelve hours away from the 09:15 UTC reconcile. Nothing breaks, only how fast a failed push retries: the happy path drains immediately after each signup, and the nightly reconcile catches the rest. On the Pro plan, set it back to `*/10 * * * *`.
- **`CAL_WEBHOOK_SECRET`.** Confirm it is actually set in Production. If it is blank, `app/api/webhooks/cal/route.ts` currently accepts **unsigned** booking payloads and writes them straight into the `leads` table, which with the CRM live would also let a stranger inject a contact.

## 6. Admin: verify the connection

`/admin/crm` > **Verify connection**. Every check must go green before anything can be switched on.

It proves, against a throwaway test contact, that:

- the token and location work
- **"do not disturb on" really means suppressed and not the reverse** (their own documentation is self-contradictory here, and read backwards an unsubscribe would become a resubscribe)
- the site can look contacts up with this kind of token
- saving a contact does **not** wipe tags your workflows added
- your account deduplicates on email
- the ten Tekmadev custom fields exist (it creates any that are missing and remembers their ids)

Nothing can be switched on until these pass, on purpose. It takes about 20 seconds and is safe to re-run.

## 7. Admin: turn ON the Outbound switch

The backfill of your existing subscribers and leads runs. Watch the Queue panel drain to zero and "Needs attention" stay empty.

Then submit the website footer form with a test address and confirm the contact appears in GoHighLevel with the attribution fields filled in and the `tmd-newsletter` tag applied.

Leads and the newsletter are now live. Unsubscribes are not yet.

## 8. GoHighLevel: create the private app for webhooks

Marketplace > create an app > set distribution to **Private (unlisted)**.

This step is unavoidable: the token from step 3 cannot receive notifications at all. Under Advanced Settings > Webhooks, paste

```
https://www.tekmadev.com/api/webhooks/crm
```

against these events:

`ContactDndUpdate`, `ContactCreate`, `ContactUpdate`, `ContactDelete`, `ContactTagUpdate`, `AppointmentCreate`, `AppointmentUpdate`, `AppointmentDelete`

Then install it on the sub-account.

Pick the scopes carefully in the draft: webhook URLs and event lists stay editable forever, but **scopes lock once the app goes live**. A private app may be installed in up to 5 agencies, and sub-accounts do not count against that.

## 9. Admin: turn ON the Inbound switch

Then test both directions:

- In GoHighLevel, unsubscribe your test contact. In the admin, confirm the delivery shows as **verified** and **applied**, and that the Consent history for that address reads `Source: ghl`.
- From the website's own `/unsubscribe` page, unsubscribe a different test address, and confirm email DND appears on the GoHighLevel contact.

## 10. Admin: turn ON the Reconcile switch

Next morning, "Last reconcile" should read zero mismatches corrected. This is the nightly backstop that catches a webhook that never arrived.

## 11. Admin: map each client's sub-account

Open each client in `/admin/clients`, then the **CRM account** section: paste that client's GoHighLevel sub-account **location id**, and the specific **calendar ids** that count toward their guarantee.

Only appointments on the calendars we built count, because the agreement promises appointments that schedule "through the system we built". Leaving the calendar list empty counts every appointment in that account.

An appointment from an unmapped account is never dropped: it waits, and applies as soon as you save the mapping. Your own sub-account (the one in `GHL_LOCATION_ID`) never needs mapping: its appointments are your sales calls, which Cal.com already records as leads.

Then book a test appointment in that sub-account and confirm it appears in that client's Booked calls marked **Needs review**, with a one-click **Real prospect, count it**. Appointments wait for your confirmation rather than counting immediately, because only you can tell whether a booking was a real prospect in their service area. On the client's own portal it reads **Being reviewed** until you decide.

## 12. GoHighLevel: build the workflows

All triggered on the `tmd-` tags, all standard steps with no per-execution charge:

| Workflow | Trigger |
|---|---|
| Newsletter nurture | `tmd-newsletter` added |
| Revenue leak follow-up | `tmd-lead-magnet-revenue-leak` added (branch on the `tmd_monthly_leak` field) |
| Booked-call reminders | `tmd-booked-call` added |
| Client onboarding nudges | `tmd-client-live` added |

**Filter every marketing audience on `tmd-newsletter`.** A campaign sent to everyone tagged `tmd-lead-magnet` would mail people who asked for a report and never consented to marketing, which is a CASL violation. That tag is written by one place in the whole system, derived from the subscriber's status, so filtering on it is the one checkbox that has to be right.

## 13. Pick one sender per message

Cal.com already sends booking reminders and Resend already sends the newsletter welcome. If GoHighLevel also sends them, people get two of everything. Keep the instant ones where they are and let GoHighLevel own the multi-step sequences, or move them wholesale, but decide per message.

---

## Do not send a campaign before step 9 is verified

From the moment the first campaign goes out, every recipient has an unsubscribe route that bypasses the website entirely. Without the inbound leg working, the site would keep treating people who opted out as active subscribers, and the next send would mail them again.

Nothing has been sent yet, so this ordering costs nothing today.

---

## What it does once it is on

- **Leads and subscribers** are pushed as contacts with their attribution, tags and custom fields. Nothing is pushed from the visitor's request: the write to our own database records the intent, and a worker does the call afterwards, so a slow or broken CRM can never slow down or break a signup.
- **Unsubscribes travel both ways.** An unsubscribe anywhere sticks everywhere. Only you, or the person themselves acting on our own site, can undo one, because a CRM event cannot tell us whether a person, a workflow or a staff member cleared the flag.
- **A bounced or complained address is never revived**, including by someone typing it into the footer form.
- **Client appointments** feed the guarantee counter after your review.
- **Supabase stays the source of truth** for every consent decision. The CRM is the sender, never the record.
