# Admin API permissions

Who may do what in the admin API (`/api/admin/v1`). The source of truth is `PERMISSIONS` in `lib/admin-api/permissions.ts`; this page is the same table for people. Change both together.

Roles (owner decision 2026-10-03):

- **Owner**: everything.
- **Manager**: nearly the owner's power: everything except removing team members (`team.remove`) and creating or promoting owners (`team.owners`). Managers add managers and staff.
- **Staff**: leads and outreach, analytics, onboarding help; marketing (blog, email campaigns and templates, links with QR), pricing and coupons view only (coupons: share deal links too); never money (no revenue on Home, no Subscriptions, no client billing), never email subscribers, Ads, CRM, Loader, Test mode or Team. Staff read only the Leads and Clients Inbox categories, and never owner-audience rows. Staff see their own activity and their own credit rows, never anyone else's.

The app keeps the same table as its fallback for a `GET /me` without `capabilities` (`src/auth/capabilities.ts` in the app repo, mirrored by the mock in `src/api/mock/permissions.ts`). Keep the names and rows identical.

Session endpoints (`GET /me`, `GET /meta`, `GET /search`, `POST /devices`, `DELETE /devices/:id`, `PATCH /profile`) need no capability: any staff member may call them. `GET /me` sends the caller's `capabilities` (every name below that their role holds), and the app shows and hides everything from that list. Search only returns the types the caller may view (`clients.view`, `leads.view`, `email.subscribers.view`, `blog.view`, `coupons.view`, `links.view`) and test clients only with `testdata.view`.

A missing capability answers 403: `owner_only` "That section is owner only." when only owners hold it (today `team.remove`, `team.owners` and `commission.settings`), otherwise `forbidden` "Your role cannot do that.".

A team member whose access is paused gets 403 `paused` "Your access is paused. Ask an owner or manager." on every request, before any capability check ([staff.md](staff.md)).

### Owner-audience Inbox rows

Events marked `audience: "owner"` in `lib/admin-notify.ts` (Stripe and checkout problems, CRM and Meta health, "Client deleted", subscriber events, team changes, settings switches) are read by the roles that read the whole Inbox, every `inbox.*` row: owners and managers (`readsOwnerAudience()`). Staff never get them, not in the Inbox, the badge, Home or as a push, even in a category they read ("Client deleted" sits in Clients). Test rows need `testdata.view`. The test push (`POST /notifications/test-push`) goes out on the Leads channel, the one category every role reads (the app deletes the channels of categories a person cannot read).

### Team rules

`team.view` and `team.write` let owners and managers see the team and add members; managers may only add managers and staff (`POST /team` with role `owner` answers 403 `owner_only` without `team.owners`). Only owners remove members (`team.remove`). Env owners (`ADMIN_EMAILS`) are locked: `DELETE /team/:email` answers 422 `owner` for them, whoever asks, and `GET /team` reports them `envOwner: true`.

`team.role` and `team.pause` (owners and managers) change a role and pause or resume access with `PATCH /team/:email`: managers move people between manager and staff and pause managers and staff, never owners (403 `owner_only`); making an owner needs `team.owners`; env owners answer 422 `locked`, yourself 422 `self`. `team.activity` shows everyone's activity and credits, `activity.own` your own; `clients.credits.view` and `clients.credits.edit` cover a client's credits (staff see only their own rows); `commission.settings` (owners) sets the default split. The rules and copy are in [staff.md](staff.md); the web Team page uses `updateTeamAccess()` in `lib/admin-users.ts`. The same rules are in `lib/admin-users.ts` for the web Team page: `grantableRoles(role)`, `mayRemoveTeamMembers(role)`, and `addManager({ actorRole })` / `removeAdmin(email, { actorRole })` refuse what the role may not do (including a manager re-granting an existing owner as something else).

## Home

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `overview.view` | yes | yes | yes | Home (Overview, "Needs you"). |
| `overview.revenue` | yes | yes | no | Revenue, active subscriptions and recent subscriptions on Home. |

## Inbox

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `notifications.view` | yes | yes | yes | The Inbox, prefs and the test push. |
| `inbox.leads` | yes | yes | yes | Inbox rows in the Leads category. |
| `inbox.clients` | yes | yes | yes | Inbox rows in the Clients category. |
| `inbox.sales` | yes | yes | no | Inbox rows in the Sales category. |
| `inbox.billing` | yes | yes | no | Inbox rows in the Billing category. |
| `inbox.system` | yes | yes | no | Inbox rows in the System category. |
| `inbox.audience` | yes | yes | no | Inbox rows in the Audience category. |
| `inbox.team` | yes | yes | no | Inbox rows in the Team category. |

## Analytics and Ads

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `analytics.view` | yes | yes | yes | Traffic analytics. |
| `ads.view` | yes | yes | no | Meta ads report. |
| `ads.refresh` | yes | yes | no | Pull the latest ads data. |

## Leads

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `leads.view` | yes | yes | yes | Lead list and detail. |
| `leads.create` | yes | yes | yes | Add a lead by hand (outreach). |
| `leads.update` | yes | yes | yes | Status, follow-up date and who it is assigned to. |
| `leads.outreach` | yes | yes | yes | Log a call, email, DM or meeting with a lead. |
| `leads.convert` | yes | yes | yes | Create a client from a lead. |
| `leads.delete` | yes | yes | no | Delete a lead. |

## Free tools

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `tools.view` | yes | yes | yes | Free tool stats and submissions. |

## Subscriptions (orders and Stripe subscriptions)

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `billing.view` | yes | yes | no | Orders and subscriptions lists. |

## Clients

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `clients.view` | yes | yes | yes | Client list and detail (without billing), files, activity. |
| `clients.billing` | yes | yes | no | The billing block, amounts and subscription data on a client, and its billing and care plan activity entries (`billing.*`, `care.*`). |
| `clients.create` | yes | yes | no | New client. |
| `clients.edit` | yes | yes | no | Account fields, internal notes field and guarantee terms (PATCH /clients/:id). |
| `clients.go_live` | yes | yes | no | Go live (with the care plan override). |
| `clients.trash` | yes | yes | no | Move a client to trash (DELETE /clients/:id). |
| `clients.crm` | yes | yes | no | The CRM section of a client (sub-account and calendars), and its `crm.*` activity entries. |
| `clients.members` | yes | yes | no | Portal members: invite, change role or status, resend invites. |
| `clients.onboarding` | yes | yes | no | Onboarding run: stage, blocked, dates, complete. |
| `clients.tasks.create` | yes | yes | yes | Add onboarding tasks. |
| `clients.tasks.status` | yes | yes | yes | Change an onboarding task status. |
| `clients.intake.review` | yes | yes | no | Mark an intake reviewed. |
| `clients.access.request` | yes | yes | yes | Ask a client for access (POST /clients/:id/access-grants). |
| `clients.access.update` | yes | yes | no | Change an access grant's status or note. |
| `clients.approvals.request` | yes | yes | yes | Request an approval from a client. |
| `clients.calls.log` | yes | yes | yes | Log a booked call. |
| `clients.calls.review` | yes | yes | no | Edit, qualify, disqualify and review calls toward the guarantee. |
| `clients.activity.write` | yes | yes | yes | Internal notes and client updates on the activity feed. |
| `clients.templates` | yes | yes | no | Onboarding checklist templates. |

## Test data

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `testdata.view` | yes | yes | no | Test clients, test inbox rows, test purchases, the Test toggles and "Include test". |

## Marketing: Blog

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `blog.view` | yes | yes | yes | Post list, post detail, categories, authors, render preview. |
| `blog.write` | yes | yes | no | Create, edit, publish, change status, media upload, categories. |
| `blog.trash` | yes | yes | no | Move a post to trash. |

## Marketing: Email

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `email.view` | yes | yes | yes | Overview counters, campaigns and templates (never subscriber records). |
| `email.campaigns.write` | yes | yes | no | Create, pause, resume, delete campaigns. |
| `email.subscribers.view` | yes | yes | no | Subscriber list and detail with consent history. |
| `email.subscribers.write` | yes | yes | no | Unsubscribe or erase a subscriber. |

## Marketing: Links (QR codes included)

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `links.view` | yes | yes | yes | Links, click counts, clicks, QR codes (copy and share included). |
| `links.write` | yes | yes | no | Create, enable, disable, delete links. |

## Marketing: CRM sync

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `crm.view` | yes | yes | no | CRM sync status, queues, runs, inspector. |
| `crm.write` | yes | yes | no | Verify, switches, sync, reconcile, retry, discard, resubscribe. |

## Sales

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `pricing.view` | yes | yes | yes | Plans, products and sales tax status. |
| `pricing.write` | yes | yes | no | Change prices, products and the sales tax switch. |
| `coupons.view` | yes | yes | yes | Coupon list. |
| `coupons.share` | yes | yes | yes | Copy or share a coupon's deal link. |
| `coupons.write` | yes | yes | no | Create and disable coupons. |

## Settings

| Capability | Owner | Manager | Staff | Covers |
|---|---|---|---|---|
| `loader.view` | yes | yes | no | Loader settings screen. |
| `loader.write` | yes | yes | no | Save or reset the loader. |
| `testmode.view` | yes | yes | no | Test mode status and test purchases. |
| `testmode.write` | yes | yes | no | Rebuild the test catalog, purchase test data. |
| `team.view` | yes | yes | no | Team list. |
| `team.write` | yes | yes | no | Add team members. Managers add managers and staff; adding an owner also needs `team.owners`. |
| `team.remove` | yes | no | no | Remove a team member (DELETE /team/:email). Owners only. Env owners are locked for everyone. |
| `team.owners` | yes | no | no | Create or promote an owner (POST /team with role owner). Owners only. |
| `team.role` | yes | yes | no | Change a role (PATCH /team/:email `role`). Managers switch people between manager and staff; an owner's role also needs `team.owners`. |
| `team.pause` | yes | yes | no | Pause or resume access (PATCH /team/:email `paused`). Managers pause managers and staff, never owners. |
| `team.activity` | yes | yes | no | Everyone's activity and credits (GET /team/activity). |
| `activity.own` | yes | yes | yes | Your own activity and your own credit rows (GET /me/activity). |
| `clients.credits.view` | yes | yes | no | Every credit row on a client (GET /clients/:id/credits, the bundle's `credits`), credit activity entries, GET /settings/commission. |
| `clients.credits.edit` | yes | yes | no | Edit a client's credits (PUT /clients/:id/credits). |
| `commission.settings` | yes | no | no | Set the default finder / booker split (PUT /settings/commission). Owners only. |

## Using it in a route

```ts
export const GET = route({ method: "GET", capability: "leads.view" }, async (ctx) => listLeads(ctx));

// Inside a handler, for a part of a response:
if (ctx.can("clients.billing")) detail.billing = await loadBilling(id);
// Or to stop with the right 403:
ctx.require("clients.calls.review");
```
