# Build brief: Tekmadev Admin for Android

Copy everything below this line into the session that has the React Native project.

---

You are building **Tekmadev Admin**, a native Android app (React Native, shipped as an APK) that gives the founder of Tekmadev the full power of the web admin panel on his phone. It must feel like the best app he owns: fast, calm, beautiful, with motion that has meaning. Treat this brief as the spec. Where it is silent, choose what a world-class product team would choose, and write the decision down in `docs/decisions.md`.

## 0. How to work

1. Read this whole brief before writing code. Then write `docs/plan.md`: the phases in section 13, the folder layout, and the libraries you picked with their current versions.
2. **Your knowledge of library APIs is out of date.** Before installing anything, check the current docs and current stable versions (Expo SDK, Expo Router, Reanimated, Skia, TanStack Query, supabase-js, expo-notifications, etc.). Never guess an API.
3. If the project folder already has a setup, keep it and adapt. If it is empty, start a new Expo app (TypeScript, Expo Router, New Architecture).
4. Work in the phases in section 13. Finish each phase completely (working, typed, tested on an Android emulator or device, screenshots taken) before starting the next. Show the owner the screenshots at the end of each phase.
5. The server API the app talks to (section 4) is being built separately in the website repo. You cannot see that repo. Build against the contract in section 11 with a **mock adapter** (realistic fixtures, same types, same error codes), switchable to the live API with one env flag. If the contract is missing something you need, do not invent a server behaviour: add it to `docs/api-requests.md` with the exact shape you want, and keep going with the mock.
6. Ask the owner before anything that costs money, publishes anything, or needs his accounts (Expo account, Firebase project, signing keys).

## 1. What Tekmadev is, and who uses this app

- Tekmadev is a Canadian growth company (head office Hamilton, team in Hamilton and Ottawa, Ontario). It sells:
  - **The Growth System**: done-for-you AI and automation growth plans for local and B2B service businesses. Tiers `convert`, `grow`, `lets-talk`. Setup fee (customer-facing name "Build & Install") plus a monthly fee. `grow` and `lets-talk` carry a guarantee: 30 qualified booked appointments in 60 days, or the client does not pay.
  - **Webline**: a one-time startup website ($997 CAD at the time of writing; always read prices from the API), plus a required care plan, **Webline Care**, billed monthly.
- The website (www.tekmadev.com) has an admin panel at `/admin` and a client portal at account.tekmadev.com. This app replaces the admin panel on mobile. It does NOT replace the client portal.
- **Users** are staff, with two roles:
  - **Owner**: everything.
  - **Manager**: Overview, Inbox, Analytics, Leads, Free tools, Clients, Subscriptions, Profile. Nothing owner-only is ever shown to a manager: not in tabs, not in search, not in quick actions, not in shortcuts.
- Business time zone is **America/Toronto**. Every date and time in the app is shown in that zone, whatever the phone is set to.
- Currency is CAD unless a row says otherwise.

## 2. Non-negotiable rules

1. **No em dashes anywhere**: not in UI copy, not in code comments, not in docs. Use a colon, a comma, parentheses or a new sentence.
2. **Never name the CRM vendor.** In the UI it is always "CRM" ("CRM sync", "CRM account"). The same goes for code identifiers you create.
3. **No secrets in the APK.** The only keys allowed in the app are the Supabase URL and the Supabase publishable (anon) key, used for sign-in only. The app never talks to database tables directly; every table is locked to the server. Everything goes through the admin API.
4. **Owner-only means owner-only on the server.** Hide owner-only UI for managers, but never rely on hiding: the API enforces it and returns 403.
5. **Never fake data.** When a read fails, show a real error state with retry, never zeros. "Failed" and "empty" are different states everywhere (the API returns `ok:false` for failures).
6. **Money is integer cents** in the API. Show dollars with cents when there are cents ($77.50 shows as $77.50, never rounded to $78); whole amounts may drop the `.00`.
7. **Destructive or irreversible actions always confirm** (see the Hold to confirm pattern in section 6).
8. Copy is plain, short and direct. Talk like a sharp operator, not a SaaS brochure. Reuse the exact messages in this brief where given.
9. Do not state build or delivery times for any Tekmadev offer anywhere in the app (owner rule).
10. The founder's public name is "Shajeed I.". Never print his full legal name in the UI.

## 3. Stack

Pick current stable versions after checking the docs.

| Concern | Choice |
|---|---|
| Framework | Expo (latest SDK), React Native New Architecture, Hermes, TypeScript `strict` |
| Navigation | Expo Router (file-based), native stack + custom bottom tab bar |
| Animation | React Native Reanimated (UI-thread worklets), Gesture Handler |
| Drawing | `@shopify/react-native-skia` for the black hole loader, charts and glow effects |
| Charts | A Skia-based chart lib (e.g. victory-native XL) or hand-rolled Skia paths |
| Lists | `@shopify/flash-list` |
| Server state | TanStack Query (with persisted cache) |
| Local state | Zustand |
| Storage | `react-native-mmkv` (cache, prefs, drafts), `expo-secure-store` (auth session) |
| Auth | `@supabase/supabase-js` (sign-in and token refresh only) |
| Bottom sheets | `@gorhom/bottom-sheet` |
| Icons | `lucide-react-native` (names in section 7 match the web admin) |
| Fonts | Geist (400 to 900) and Geist Mono (400, 500) via `expo-font` |
| Haptics | `expo-haptics` |
| Images | `expo-image` |
| Push | `expo-notifications` + Firebase Cloud Messaging |
| Biometrics | `expo-local-authentication` |
| Browser handoff | `expo-web-browser` (Custom Tabs) |
| Validation | `zod` (parse every API response in dev builds; log schema drift) |
| Dates | Intl / `date-fns-tz` with America/Toronto |

Android only. Min SDK per current Expo default. Edge-to-edge layout, predictive back gesture supported, themed (monochrome) launcher icon.

## 4. Architecture

```
app/                      Expo Router routes (thin: they compose screens)
src/
  api/                    typed client, endpoints, zod schemas, error mapping
    mock/                 mock adapter + fixtures (same types as live)
  auth/                   supabase client, session store, role gate, biometric lock
  design/                 tokens, theme provider, typography, motion presets, haptics map
  components/             design-system components (section 6)
  loader/                 the black hole loader (section 5)
  modules/<module>/       one folder per feature: screens, hooks, components, module.ts
  lib/                    formatting (money, dates in Toronto), deep links, storage
```

**Module registry.** Every feature is a module with a manifest:

```ts
type ModuleManifest = {
  id: string;                 // "clients", "blog", "inbox"...
  title: string;
  icon: LucideIconName;
  group: "home" | "inbox" | "customers" | "marketing" | "more";
  ownerOnly: boolean;
  feature?: string;           // server feature flag from GET /me; hidden when absent
  routes: string[];
  quickActions?: QuickAction[];  // shown in the + sheet and app shortcuts
  searchable?: SearchProvider;   // contributes to global search
};
```

Tabs, the More menu, global search, quick actions and Android app shortcuts are all **generated from the registry**, filtered by role and by `features` from `GET /me`. Adding a future automation is adding a module, not editing navigation code (see section 12).

**API client.**
- Base URL from env: `EXPO_PUBLIC_API_BASE` (live: `https://www.tekmadev.com/api/admin/v1`).
- `EXPO_PUBLIC_API_MODE=mock|live`. Mock is the default until the owner says the API is live.
- Every request sends `Authorization: Bearer <supabase access token>`, `X-App-Version`, and `Accept: application/json`. JSON bodies only.
- On 401: refresh the Supabase session once and retry once. Still 401: sign out with the message "Your session ended. Sign in again."
- On 403: show "That section is owner only." and go back.
- On 426: block with an update screen (section 10).
- Every POST that creates something sends an `Idempotency-Key` header (a UUID generated once per user intent, reused on retry), so a flaky network never creates two coupons or two clients.
- Timeouts: 15s for reads, 30s for writes, 120s for long jobs (ads refresh, test catalog rebuild) with a progress UI.

**Server state.**
- TanStack Query with keys per module. Cache persisted to MMKV so the app opens instantly on cached data, then refreshes.
- Refetch on screen focus and on app resume. Inbox summary polls every 45s while the app is in the foreground (until push is live, then every 120s as a safety net).
- Mutations update the cache optimistically only where the outcome is certain (marking read, toggling a mute, task status). Anything touching money, Stripe, emails or invites waits for the server and shows the pending button state.
- After any mutation, invalidate the queries the web admin would refresh (the API returns the updated entity; use it).

**Offline.**
- Show cached data with a quiet banner: "Offline · showing what was loaded at 2:41 PM".
- Mutations need a connection. Disable submit buttons offline with the hint "You are offline".
- Blog drafts and long text fields autosave locally (MMKV) every few seconds and restore after a crash.

**Time.**
- The API sends instants as ISO 8601 UTC and calendar dates as `YYYY-MM-DD` (meaning a Toronto calendar date).
- When the user picks a date and time, send it as an ISO instant computed in America/Toronto. When they pick a date only, send `YYYY-MM-DD`.
- Never parse a local-time chart label (`YYYY-MM-DDTHH:MI:SS` without an offset) with `new Date()`; treat it as text.

**Cursors.** Pass `nextCursor` and any `seen` watermark back exactly as received. Never re-encode them through a JS `Date` (the server uses microsecond timestamps).

## 5. The black hole loader (the signature of the brand)

The website has a custom loader made from the Tekmadev logo, and it must be reproduced exactly, then pushed further on mobile. The logo is four shapes, 180 degree rotationally symmetric around its centre, so half a turn lands on the exact same logo. The idea is a black hole: the **inner two hooks spin clockwise one full turn** while the **outer two arcs spin counterclockwise half a turn**, and everything is pulled toward the centre at the peak of each beat, then released back into the logo.

### Geometry

- viewBox: `300 300 2400 2400` (the original artwork is 3000 x 3000; the centre is `1500, 1500`).
- Rotate and scale each path around the point `(1500, 1500)` in viewBox units.
- Fill: the current colour (gold `#a17a4f` light / `#c89c65` dark on screens; the button's text colour inside buttons).
- Paths, in order. Paths 1 and 4 are the **inner hooks**; paths 2 and 3 are the **outer arcs**.

```
Path 1 (inner):
M1019.26,1647.41c74.41-36.6,149.04-72.67,223.81-108.43c22.76-10.88,50.03-0.79,62.98,21.86c6.15,10.75,11.32,22.19,18,32.54c36.27,56.21,86.75,86.44,151,90.02c34.05,1.9,66.09-7.07,96.96-22.07c135.96-66.1,272.05-131.91,408.09-197.83c98.23-47.6,196.47-95.2,294.71-142.79l-0.15-0.84l227.61-109.57l3.95,400.82l-161.81,77.65c-198.44,96-396.78,192.21-595.23,288.18c-27.18,13.14-54.8,25.35-82.57,37.04c-49.96,21.02-102.21,31.87-155.74,34.46c-106.99,5.18-207.25-20.09-299.78-77.65c-96.12-59.79-167.33-143.69-214.77-250.22C983.85,1692.56,993.68,1659.99,1019.26,1647.41z

Path 2 (outer):
M1028.22,569.69c73.83-43.01,151.97-75.18,233.61-97.36c111.93-30.4,225.54-40.82,340.82-30.42c94.78,8.55,186.65,30.55,275.61,66.04c77.34,30.85,150.24,71.01,218.05,120.89c75.65,55.64,143.5,120.69,202.58,195.62c57.66,73.13,105.68,152.84,143.42,239.33c0.62,1.43,1.18,2.86,1.71,4.28l20.28,50.82l-313.77,151.71l-19.2-48.43h0.01c-1.27-2.17-2.48-4.45-3.63-6.85c-13.32-27.9-26.92-55.82-42.65-82.23c-42.32-71.06-95.83-131.75-158.86-182.68c-72.1-58.26-152.16-100.05-240.18-123.87c-107.63-29.13-215.74-30.12-324.05-3.91c-50.08,12.12-97.63,31.74-144.19,54.35c-82.47,40.04-164.98,79.96-247.48,119.93c-11.7,5.67-23.4,11.34-35.1,17.01c-20.4,9.88-40.8,19.77-61.2,29.66l-380.94,206.46l-4.19-426.09L1028.22,569.69z

Path 3 (outer):
M502.02,1897.84l77-37.07c0.01-0.01,0.02-0.01,0.03-0.02c1.83-1.1,3.76-2.14,5.77-3.12c70.48-34.2,140.98-68.36,211.5-102.48c3.85-1.86,7.62-3.34,11.32-4.45l0,0l17.11-8.24l11.62,16.3l86.08,120.65c40.96,65.35,91.65,121.62,150.7,169.33c72.1,58.25,152.16,100.05,240.18,123.87c107.63,29.13,215.74,30.11,324.05,3.91c50.09-12.12,97.63-31.74,144.19-54.35c82.46-40.04,164.98-79.95,247.47-119.93c11.71-5.67,23.4-11.34,35.11-17.02c20.4-9.88,40.8-19.77,61.21-29.65l380.93-206.47l4.2,426.09l-539.35,254.27c-73.82,43-151.98,75.19-233.61,97.36c-111.92,30.39-225.54,40.82-340.81,30.41c-94.78-8.55-186.66-30.55-275.62-66.03c-77.33-30.85-150.23-71.01-218.05-120.89c-75.66-55.64-143.5-120.7-202.58-195.63c-15.01-19.05-29.37-38.54-43.07-58.48l-0.09,0.44L502.02,1897.84z

Path 4 (inner):
M494.78,1387.03l56.85-27.37l0.17,0.6c232.87-112.51,465.54-225.47,698.38-338.06c27.18-13.14,54.8-25.35,82.57-37.04c49.96-21.02,102.21-31.87,155.74-34.46c106.99-5.18,207.25,20.09,299.78,77.65c96.12,59.79,167.33,143.69,214.77,250.22c12.47,28.01,2.64,60.58-22.94,73.16c-74.41,36.6-149.04,72.67-223.81,108.43c-22.76,10.88-50.03,0.79-62.98-21.86c-6.15-10.75-11.32-22.19-18-32.54c-36.27-56.21-86.75-86.44-151-90.03c-34.05-1.9-66.09,7.07-96.96,22.08c-135.96,66.1-272.05,131.91-408.09,197.83c-130.48,63.23-260.96,126.47-391.46,189.65c-15.21,7.36-30.27,15.21-45.91,21.4c-1.77,0.7-3.54,1.29-5.3,1.79l-76.17,36.67L494.78,1387.03z
```

### Motion (one beat)

One beat lasts `beatMs` (page loader) or `buttonBeatMs` (inside buttons). Drive it with a linear progress `p` from 0 to 1, repeated forever on the UI thread. Keyframes:

| p | Outer arcs (paths 2, 3) | Inner hooks (paths 1, 4) |
|---|---|---|
| 0 | rotate 0deg, scale 1 | rotate 0deg, scale 1, opacity 1 |
| 0.32 | rotate -80deg, scale `outerPull` | rotate +200deg, scale `innerPull`, opacity `innerFade` |
| 0.62 to 1.00 | rotate -180deg, scale 1 (held) | rotate +360deg, scale 1, opacity 1 (held) |

- Easing is `cubic-bezier(0.55, 0, 0.2, 1)` applied **per segment** (0 to 0.32, then 0.32 to 0.62), exactly like CSS keyframes. From 0.62 to 1 nothing moves: the logo rests, whole, before the next beat.
- Positive rotation is clockwise. The loop is seamless because -180deg outer and +360deg inner both land on the original logo.
- It must run on the UI thread (Reanimated worklets driving Skia), at the display's refresh rate (60 or 120 Hz), with zero JS-thread work per frame.

### Settings from the server

The owner tunes the loader in the web admin (Admin, Loader), and the app must use the same values. Read them from `GET /me` (`loader`), cache them, fall back to the defaults:

| Key | Default | Range | Meaning |
|---|---|---|---|
| `beatMs` | 1600 | 800 to 3000 | One beat of the full-screen loader |
| `buttonBeatMs` | 1100 | 600 to 2000 | One beat inside buttons |
| `innerPull` | 0.72 | 0.5 to 1 | Inner hooks scale at the peak (lower pulls harder) |
| `outerPull` | 0.9 | 0.75 to 1 | Outer arcs scale at the peak |
| `innerFade` | 0.7 | 0.2 to 1 | Inner hooks opacity at the peak |
| `showAfterMs` | 300 | 0 to 1500 | A full-screen loader stays invisible this long, then fades in over 250ms ease-out, so fast loads never flash it |

Clamp anything out of range to the range; replace non-numbers with the default.

### Variants

1. **Page loader**: 72dp, gold, centred in the space it fills, `beatMs`. Appears only after `showAfterMs`.
2. **Button spinner**: sized to the button label (about 1.15 x the font size), button text colour, `buttonBeatMs`. Sits left of the label inside a pending button (see PendingButton in section 6).
3. **Pull to refresh**: while the user pulls, the four pieces start scattered (outer arcs rotated out and pushed away, inner hooks rotated and faded) and are pulled together in proportion to the pull distance, with a light haptic tick when the logo locks together at the trigger point. On release it beats until the data lands, then shrinks away with a spring.
4. **Boot / splash**: see section 8.
5. **Inline small**: 14 to 16dp for row-level loading (e.g. a row being saved).

### Reduced motion

If Android "Remove animations" is on (`AccessibilityInfo.isReduceMotionEnabled`), do not rotate or scale. Instead, all four paths fade together: opacity 1, 0.4, 1 over 1.6s, ease-in-out, forever. Also turn off list staggers, parallax and count-ups (show final values).

### Top progress hairline

When a visible screen is refetching in the background (data already shown), a 2dp gold bar runs under the header like the website's top bar: it grows from 0 to 85% width over 8s with `cubic-bezier(0.1, 0.6, 0.2, 1)`, then on completion jumps to 100% in 200ms and fades out over 300ms. It never blocks touches.

## 6. Design system

### Direction

"Quiet luxury control room." A warm near-black canvas, warm paper in light mode, hairline borders instead of heavy shadows, one accent colour (gold) used sparingly for what matters: the active tab, the key number, the primary action, the loader. Big confident numbers. Generous space. Motion that feels like gravity: things are pulled into place, never thrown.

Theme: follows the system by default, with a manual choice (System, Light, Dark) in Settings. Design dark first; light must be equally polished.

### Colour tokens (exact, from the website)

| Token | Light | Dark |
|---|---|---|
| `bg` | `#f5f2eb` | `#0e0d0b` |
| `bg2` | `#fbf9f4` | `#16140f` |
| `bg3` | `#ede9de` | `#080706` |
| `surface` | `#ffffff` | `#1a1712` |
| `ink` | `#0d0c0a` | `#f4f0e8` |
| `ink2` | `#2a2722` | `#d6d0c4` |
| `ink3` | `#5a564d` | `#a39d8f` |
| `ink4` | `#8a857a` | `#78736a` |
| `ink5` | `#b0aca2` | `#56524b` |
| `line` | `rgba(13,12,10,0.08)` | `rgba(244,240,232,0.10)` |
| `lineStrong` | `rgba(13,12,10,0.14)` | `rgba(244,240,232,0.16)` |
| `lineSoft` | `rgba(13,12,10,0.05)` | `rgba(244,240,232,0.06)` |
| `gold` | `#a17a4f` | `#c89c65` |
| `goldDeep` | `#7a5b3a` | `#a8814f` |
| `goldMid` | `#b79368` | `#d7b07a` |
| `goldSoft` | `#dcc399` | `#e8d1a6` |
| `goldTint` | `#f4ebd6` | `#221b10` |
| `signal` (errors, critical) | `#b8392c` | `#d8503f` |

Status tones (badges, chips, dots). Each tone has a 15% tinted background and a text colour:

| Tone | Light text | Dark text | Background |
|---|---|---|---|
| neutral | `ink2` | `ink2` | `bg3` |
| gold | `goldDeep` | `goldMid` | gold at 15% |
| ok | `#047857` | `#6ee7b7` | `#10b981` at 15% |
| warn | `#b45309` | `#fcd34d` | `#f59e0b` at 15% |
| muted | `ink4` | `ink4` | `lineSoft` |
| signal | `signal` | `signal` | signal at 10% |

Gold gradient (for hero numbers and the active tab indicator): 135deg, light `#a17a4f` to `#7a5b3a`, dark `#d7b07a` to `#a8814f`.

Grain: a very light noise texture (about 5% opacity; multiply in light, screen in dark) on the splash, the login screen and the Home header. Generate it with Skia, do not ship a big PNG.

### Typography

- **Display** (big numbers, screen titles): Geist 800, letter-spacing -4%, line-height 0.94. Large titles 34sp, KPI numbers 40 to 56sp, tabular figures.
- **Headline**: Geist 700, letter-spacing -2.5%, 22 to 28sp.
- **Body**: Geist 400, 15sp / 22sp line height. Secondary text `ink3`.
- **Label**: Geist 500, 13sp.
- **Eyebrow**: Geist Mono 500, 11sp, UPPERCASE, letter-spacing 18%, `ink3`. Used above section titles, like the website.
- **Numbers**: tabular figures everywhere numbers are compared (tables, KPIs, money).
- Respect system font scaling up to 1.3x without clipping.

### Space, shape, depth

- 4pt base grid; screen gutter 16dp; section gaps 24 to 32dp.
- Radii: chips and buttons fully rounded (pills), cards 20dp, sheets 28dp, inputs 14dp.
- Cards: `surface` with a 1px `line` border. In dark mode add a faint top inner highlight (1px `lineSoft`). No drop shadows except on floating elements (tab bar, FAB, toasts): soft, warm, low opacity.
- Touch targets at least 48dp.

### Motion language

- Springs, not durations, for anything that moves: default `damping 18, stiffness 180, mass 1`; snappy `damping 22, stiffness 320`; soft `damping 20, stiffness 120`.
- Fades and colour changes 180 to 240ms, easing `cubic-bezier(0.2, 0, 0, 1)`.
- **Enter**: content is pulled into place: from scale 0.96, opacity 0, translateY 8, to rest. Lists stagger 30ms per item, first 8 items only.
- **Press**: scale to 0.97 with the snappy spring, plus a light haptic.
- **Screen transitions**: native stack slide with a subtle fade and parallax on the screen underneath. List card to detail: shared-element-style continuity of the title and status badge (use Reanimated shared transitions if stable in the current version; otherwise a fade-through that keeps the header position).
- **Numbers**: KPIs count up from the previous value (not from zero) over 600ms when data changes.
- **Tab bar indicator**: a gold pill that slides between tabs on a spring; the active icon thickens from stroke 1.75 to 2.25.
- **Haptics map**: selection (tab change, chip toggle, slider step), light impact (button press), medium impact (hold to confirm start), success notification (saved), warning notification (destructive confirmed), error notification (failed).
- Everything respects reduced motion.

### Components to build (the kit)

All of these live in `src/components`, are themed, and appear in a hidden **Kit** screen (Settings, About, tap the version 7 times) that shows every component in every state, both themes.

- `Screen` (safe areas, edge-to-edge, large title that collapses into the header on scroll, pull to refresh with the black hole).
- `Header` with title, eyebrow, actions, and the top progress hairline.
- `TabBar`: floating pill bar, blurred translucent background, gold sliding indicator, unread badge on Inbox (red when there is a critical unread, gold otherwise, "99+" above 99).
- `Card`, `Section` (eyebrow + title + optional action), `Divider`.
- `StatCard`: eyebrow label, display number (count-up), sub line, optional icon, optional trend chip (up/down with tone).
- `Badge` (tones above), `Chip` / `FilterChips` (horizontal scroll, single or multi select), `SegmentedControl` (sliding pill).
- `ListRow` with leading icon or avatar, title, subtitle, trailing value or badge, chevron, swipe actions.
- `DataTable` alternative for phones: a `KeyValue` list and a `MetricRows` layout. Never squeeze a desktop table onto a phone: pick the 3 most useful fields for the row and show the rest on tap.
- `EmptyState` (logo watermark, one line, optional action), `ErrorState` (message, Retry), `Skeleton` (warm shimmer, only after `showAfterMs`).
- `PendingButton`: the mobile version of the website's PendingSubmit. Variants primary (ink background, bg text), secondary (border), ghost, destructive. While its action runs: **only the pressed button** shows the black hole spinner and its pending label (e.g. "Saving"), and **every other submit button of the same form is disabled**, so nothing is sent twice. The button keeps its width (no layout jump).
- `HoldToConfirm`: for destructive or irreversible actions. A button inside a bottom sheet that says what will happen ("Move Acme Plumbing to trash. Data is kept; the portal stops working for them."). Press and hold 1.2s: a fill sweeps across the button with haptic ticks; releasing early cancels; completing fires a warning haptic and the action.
- `Toast` / `Notice`: slides down from the top, ok (gold border) or err (signal border), auto-dismiss 3.5s, swipe up to dismiss, reuses the website's notice copy.
- `Sheet` (bottom sheet with snap points), `ActionSheet`.
- Form controls: `TextField` (floating label, error text, character count), `TextArea` (autosave), `NumberField` (money mode: dollars with cents, stored as cents), `Select` (opens a sheet), `DateField` / `DateTimeField` (Toronto time), `Switch`, `Checkbox`, `Slider` (with live value and help text, haptic per step), `PasswordField` (show/hide eye).
- `Avatar` (initial letter fallback), `ProgressBar` (gold or ok), `StageTracker` (onboarding stages as a horizontal stepper with the current stage pulsing softly).
- Charts: `AreaChart` (gold line, gradient fill, draws in on mount, finger scrub shows a tooltip with haptic ticks per point), `Donut` (top 7 + Other, animated sweep, tap a slice to highlight), `HBars` (animated grow).
- `SearchSheet`: global search (section 7).

### Accessibility

Content descriptions on every icon button, TalkBack order that follows the visual order, contrast at least 4.5:1 for text, focus visible, no information carried by colour alone (badges always have text).

## 7. Navigation and information architecture

Bottom tabs, generated from the module registry:

| Tab | Icon | Contains | Who |
|---|---|---|---|
| Home | `LayoutDashboard` | Overview, "Needs you" | everyone |
| Inbox | `Bell` (badge) | Notifications | everyone |
| Customers | `Users` | Clients, Leads, Free tools, Subscriptions (segmented at top) | everyone |
| Marketing | `Send` | Blog, Email, Links, CRM sync | owner only (managers do not get this tab) |
| More | `Menu` | Insights (Analytics, Ads), Sales (Pricing, Coupons), Settings (Loader, Test mode, Team, Profile), App settings, Sign out | everyone (owner-only rows filtered) |

Icons per item (same as the web sidebar): Analytics `BarChart3`, Ads `Megaphone`, Leads `UserRound`, Free tools `Calculator`, Clients `Building2`, Subscriptions `CreditCard`, Email `Mail`, CRM sync `RefreshCcwDot`, Blog `FileText`, Links `Link2`, Pricing `Tag`, Coupons `BadgePercent`, Loader `Orbit`, Test mode `FlaskConical`, Team `Shield`, Profile `Settings`, Sign out `LogOut`. Group icons: Insights `ChartLine`, Customers `Users`, Marketing `Send`, Sales `Wallet`, Settings `SlidersHorizontal`.

- **Global search**: a search button in every tab header opens `SearchSheet`. It searches screens ("Pricing", "Loader") and records via `GET /search?q=` (clients, leads, subscribers, blog posts, coupons, links), filtered by role. Recent searches remembered locally.
- **Quick actions**: a gold `+` floating button on Home and Customers opens an action sheet: New client, Log a booked call, Write a post (owner), New coupon (owner), New link (owner). The same actions are Android app shortcuts (long-press the launcher icon): Inbox, New client, Write a post, Analytics.
- **Deep links**: scheme `tekmadev-admin://`. Every notification and every in-app link carries a web admin path (`action_url`, always starting with `/admin`). Map them:

| Web path | App route |
|---|---|
| `/admin` | Home |
| `/admin/notifications` | Inbox |
| `/admin/leads` | Customers, Leads |
| `/admin/tools` | Customers, Free tools |
| `/admin/subscriptions` | Customers, Subscriptions |
| `/admin/clients` | Customers, Clients |
| `/admin/clients/new` | New client |
| `/admin/clients/<id>` | Client detail |
| `/admin/clients/<id>#<section>` | Client detail, scrolled to that section (`calls`, `onboarding`, `intake`, `access`, `files`, `approvals`, `agreements`, `crm`, `team`, `account`, `activity`) |
| `/admin/analytics`, `/admin/ads` | More, Analytics / Ads |
| `/admin/email`, `/admin/crm`, `/admin/blog`, `/admin/links` | Marketing screens |
| `/admin/blog/<id>` | Post editor |
| `/admin/pricing`, `/admin/coupons`, `/admin/loader`, `/admin/test-mode`, `/admin/team`, `/admin/profile` | More screens |
| anything unknown | Inbox |

## 8. Screens

Every screen has: loading (skeleton after `showAfterMs`, otherwise nothing), loaded, empty (exact copy below), error (`ErrorState` with Retry, never zeros), offline (cached data plus banner), and pull to refresh.

### 8.1 Splash and boot

- Native splash (Android 12+ SplashScreen API): the logo mark in gold on `bg`, matching the theme.
- Then the JS takeover, seamless from the native splash: the four logo pieces are **pulled together** from slightly scattered positions into the mark (500ms, soft spring). If the session restore and the `GET /me` call are still running, the mark keeps beating as the black hole. When ready, the mark shrinks and slides toward the Home header while Home rises into place.
- Cold start to animated splash: under 1s. To interactive with cached data: under 2.5s on a mid-range phone.

### 8.2 Sign in

- Grain texture on `bg`, a large slowly breathing logo mark (one beat every 6s, very subtle), eyebrow "TEKMADEV ADMIN", display title "Welcome back."
- Fields: Email, Password (show/hide). Button "Sign in" (PendingButton, pending label "Signing in").
- Uses `supabase.auth.signInWithPassword`. Then call `GET /me`. **A valid Supabase session is not enough**: the same user pool contains client portal users. If `/me` returns 401 or 403, sign out and show "That account is not allowed here."
- Errors: wrong credentials "Wrong email or password."; network "Could not sign in. Check your connection."; anything else "Could not sign in."
- "Forgot password?" opens a sheet with an email field; it calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://www.tekmadev.com/admin/reset/confirm" })` and always shows "If an account exists for that email, a reset link is on its way. Check your inbox." The reset itself happens on the website (opened from the email).
- After the first successful sign-in, offer biometric unlock ("Unlock with your fingerprint next time?").
- Session: store it with `expo-secure-store` (use an encrypted large-value adapter, since SecureStore has a size limit). Auto-refresh tokens while the app is in the foreground.

### 8.3 Home (Overview)

Purpose: in five seconds, know what needs you and how the business is doing.

1. Header: eyebrow with today's date in Toronto ("WEDNESDAY, SEPTEMBER 30"), title "Overview" or a time-of-day greeting ("Good morning, Shajeed"), avatar (opens Profile), search.
2. **Needs you** (horizontal cards, from `GET /overview` `attention`): notifications needing action, blocked onboardings, CRM appointments waiting for review, intakes to review, clients behind pace on the guarantee. Each card shows a count and opens the filtered list. If nothing: a calm "Nothing is waiting on you." with a soft gold check.
3. KPI grid (2 x 2 `StatCard`s, count-up): Total leads, Booked calls (status booked), Active subs (live mode, includes care plans), Pageviews 30d.
4. "Pageviews (last 30 days)": AreaChart with scrub.
5. "Traffic sources (30d)": Donut, top 7 plus Other.
6. "Top pages (30d)": HBars, top 10.
7. "Top tracking links (30d)": HBars, only when not empty.
8. "Recent leads": 8 rows (When, Name, Status badge, Source / Campaign). "View all" goes to Leads. Empty: "No bookings yet. They appear here once the Cal.com webhook is connected."
9. "Recent subscriptions": 8 rows (When, Email, Tier, Status, Amount). Empty: "No subscriptions yet. They appear here once the Stripe webhook is connected."

### 8.4 Inbox (Notifications)

The heart of the app on mobile. One shared staff inbox of real-world events.

**Model** (from the API): each item has `id`, `last_occurred_at` (sort key), `occurrences`, `event_key`, `category` (`leads|sales|billing|clients|audience|team|system`), `severity` (`info|success|warning|critical`), `title`, `body`, `action_url`, `entity_type`, `entity_id`, `client_id`, `actor_type`, `actor_label`, `needs_action`, `resolved_at`, `resolved_by`, `is_test`, `data`, `is_read`, `is_muted`, and the catalogue `label` for the event (e.g. "New booking").

- Read state and mutes are **per user**. "Needs action" resolution is **shared** by all staff.
- A repeating problem bumps the **same row** (same `id`): it moves to the top, `occurrences` goes up, and it becomes unread again for everyone. Update rows in place by `id`, never append duplicates.
- Managers never see owner-audience rows. Test rows are owner-only and hidden unless "Include test" is on.

**Layout**
- Header: title "Inbox", subtitle "{unread} unread · {needsAction} need(s) action", action "Mark all read" (visible when anything is unread).
- Segmented: All, Unread, Needs action ({n}). Category chips: Everything, Leads, Sales, Billing, Clients, Audience (owner), Team (owner), System. Owner-only toggle chip: "Include test".
- Grouped by Toronto day: "Today", "Yesterday", "Monday, September 28".
- Row: category icon (leads `UserRound`, sales `Receipt`, billing `CreditCard`, clients `Building2`, audience `Mail`, team `Shield`, system `Wrench`; `AlertTriangle` for critical) tinted by severity (info neutral, success ok, warning warn, critical signal); unread gold dot and bold title; badges "Needs action" and "Test"; body (2 lines); meta line: time · "happened N times" (when more than 1) · label · actor · "quiet category" (when muted) · "Resolved by {who}".
- Tap: mark read (optimistic), then deep link to `action_url` (or open the notification detail sheet when there is none).
- Swipe right: mark read / unread. Swipe left (only on needs-action rows): "Mark as handled" / "Reopen".
- Long press: sheet with Open, Mark as handled / Reopen, Make this category quiet.
- Infinite scroll with the cursor; stop when a page comes back short or empty.
- Empty states: Needs action "Nothing is waiting on you."; Unread "You're all caught up."; All "No notifications yet."
- Error: "Notifications could not be loaded just now. Nothing is lost: pull to refresh in a moment."
- "Mark all read" sends the newest `last_occurred_at` shown, exactly as received.

**Preferences** (in More, App settings, Notifications): per category "Quiet" (does not count toward unread) and "Push" (phone notification) switches. Managers do not see Team and Audience.

### 8.5 Customers: Clients

**List** (`GET /clients`)
- Stat cards (horizontal): Leads ("signed up, not paid"), Onboarding (onboarding + pending), Live, Blocked ("waiting on something"), Behind pace ("guarantee running").
- Filter chips: Active (default: not churned, not lead), Lead, Onboarding, Live, Pending, Paused, Churned, All. Plus a "Test" toggle for owners (test clients are marked with a "Test" badge).
- Search box (business name, email).
- Row card: business name + "Test" badge, plan name, status badge, derived stage + "Blocked" badge, open tasks "N client · M us", go-live ("live Sep 12", or "8d to live" / "3d late" in signal), guarantee ("12/30 · 41d" with Met / On pace / Behind badge, "Not started", or "n/a"), strategist.
- Status tones: lead muted, pending neutral, onboarding gold, live ok, paused warn, churned muted.
- Empty: "No clients here yet. Paid checkouts create them automatically, or add one by hand."
- `+` New client. Owner: "Checklist templates" in the header menu.

**New client** (sheet or screen)
- Business name (required), Email (required, "The portal invite goes here."), Contact name, Phone, Plan (Growth plans: Convert, Grow (guarantee), Let's Talk (guarantee); One-time products: Webline; or No plan yet; default Grow), Assigned strategist (email), "Send portal invite" switch (on).
- Note under the form: "If a client with this email already exists, it is reused and updated instead of duplicated."
- Success: open the new client, toast "Client created." plus "Invite sent." only when an invite was actually sent, or "...but the invite email failed. Use Resend invite under Team." when it failed.
- Error: "Business name and a valid email are required."

**Client detail** (`GET /clients/:id`, one bundle)
- Collapsing header: business name, plan · email · phone (tap to call or email), status badge, Blocked badge, "Test" badge. Actions: **Go live** (when not live), **Open portal** (Custom Tab to the client portal home), overflow menu (Move to trash: owner only, HoldToConfirm).
- Four stat cards: Stage (derived stage or Live, sub "target <date>"), Checklist ("done/total" required tasks, sub "N waiting on client"), Booked calls (qualified count, sub "target N" or "no guarantee"), Billing (subscription status or "Ending" when cancelling, sub amount · "ends <date>" or period end; falls back to the latest order: status, "$X one-time · <payment method>"; or "no billing record"). Money here is visible to managers too (same as the web).
- Sticky horizontally scrolling section tabs: Onboarding, Intake, Access, Files, Approvals, Agreements, Calls, CRM (owner), Team, Account, Activity. Tapping scrolls; scrolling updates the active tab.

Sections:

1. **Onboarding** (empty: "No active onboarding run.")
   - `StageTracker` with the 8 stages: welcome, intake, kickoff, build, review, go_live, optimizing, complete. Shows the derived stage (the first stage with an open required task, or the stored stage if further along) and % of required tasks done. Stage day ranges are internal and may be shown to staff in small `ink4` text.
   - Controls: Stage select (all 8; choosing `complete` asks HoldToConfirm, because a completed run cannot be reopened), Target go-live (date), Kickoff (date and time), Blocked switch + reason.
   - Tasks grouped by stage. Each task: title (struck through when done or skipped), "optional", owner "Client" / "Tekmadev", kind, "due <date>" for open tasks, "done <date> by <who>". Tap the status chip to change it: To do, In progress, Waiting on client, Done, Skipped, Blocked (optimistic, with undo toast).
   - "Add a task": title (required), description, stage, owner (Client / Tekmadev), kind, required switch, due date. A client-owned task notifies the client in their portal.
   - "Mark onboarding complete" (HoldToConfirm).
2. **Intake** (empty: "The client has not started the intake yet.")
   - Latest version: status badge (draft, submitted, reviewed), vN, submitted and reviewed times. **Mark reviewed** when submitted.
   - Answers rendered from the intake schema the API sends (5 sections: business, services, leads, brand, goals), label and value, option values shown as labels.
3. **Access** (empty: "No access requests yet.")
   - Each grant: label or provider name, status badge, account identifier, method, "client marked done <date>", "verified <date> by <who>". Tap to change status (requested, pending client, client says done, granted, verified, revoked, not applicable) with a note "Note shown to the client" (an empty note keeps the old one).
   - Status tones: requested neutral, pending_client gold, client_says_done warn, granted ok, verified ok, revoked signal, not_applicable muted.
   - "Request another access": provider (17 options from the API meta), label, note.
4. **Files** ("Files (N)", empty: "Nothing uploaded yet.")
   - Grid of thumbnails (images) or file icons, file name, kind, size. Tap: full-screen viewer for images (pinch zoom), Custom Tab for other files. URLs are signed and expire: re-sign on demand (`POST /assets/:id/sign`) if `expiresAt` has passed.
5. **Approvals** (empty: "Nothing requested yet.")
   - Each: title, vN · kind, preview link, the client's feedback in quotes, requested and decided times, status badge (pending gold, approved ok, changes_requested warn, superseded muted).
   - "Request approval": title (required), kind, description, preview URL, linked task (optional), one attachment (label + URL).
6. **Agreements** (read only; empty: "No agreements.") title, vN, "Accepted <time> by <name> (<email>)" or "Sent <time>", short content hash, status badge (signed ok, sent or viewed gold, others muted).
7. **Calls** (the guarantee)
   - Guarantee card (eligible clients only): big "counted / target", "X days in, Y left, Z expected by now" or "clock not started", badge (Met, On pace, Behind pace), progress bar.
   - Review banner when CRM appointments are unreviewed: "N appointments from the CRM waiting for your review. Nothing counts toward the guarantee until you confirm it."
   - Each call: contact name, status badge (booked, confirmed, showed, no_show, cancelled, rescheduled), review badge ("Needs review", "DQ: <reason>", "Counts", "Outside window"), source · booked time · for time · service, phone · email · notes.
   - Unreviewed call: one big action, "Real prospect, count it", or "Agree, it does not count" when the sync preset a disqualify reason. Swipe on the row does the same.
   - Edit sheet: status, qualified (yes/no), disqualify reason (spam, duplicate, out_of_area, wrong_service, fake, other), notes.
   - "Log a booked call": contact name, phone, email, service requested, booked at, booked for, status, notes, source (default manual). Manual calls count immediately.
8. **CRM account** (owner only; never rendered for managers): sub-account id (monospace), qualifying calendar ids (one per line; empty means every calendar counts), "N appointments waiting to be applied". Save. Errors from the API are shown as notices.
9. **Team** (the client's portal users): name or email, status badge (active ok, invited gold, disabled muted), title, invited / joined / last seen, "no login yet". Role (owner, admin, member) and status selects. "Resend invite" (when invited) or "Send reset link". "Add a person": email, name, title, role (default member).
10. **Account** (edit sheet, PATCH only what changed): business name*, legal name, website, primary email*, phone, industry, status (pending, onboarding, live, paused, churned), plan, timezone, assigned strategist, live date, service area. Guarantee: eligible switch, target, window days, count rule (booked / showed), guarantee status, clock started date. Internal notes ("Never shown to the client.").
11. **Activity**: timeline (paged), each with a gold dot and "client sees" badge when visible to the client, summary, time · actor · event. Composer at the bottom: Internal note or Update to client (subject, text, optional link). An update appears in the client's portal (no email is sent).

Go live: if the plan needs a care plan (Webline) and none is active, the API returns `care_required`; show the explanation and a secondary "Go live without a care plan" (HoldToConfirm). Success toast: "Live. Guarantee clock started." (second sentence only when the client is guarantee-eligible).

**Checklist templates** (owner only): templates grouped by stage, each with title (struck through when inactive), owner badge, kind, plans, "optional", key. Edit sheet: key (read only when editing), title, stage, owner, kind, plans (multi-select; none means all), due offset days, sort order, description ("Shown to the client for client-owned tasks."), payload (JSON editor with validation), required, active. Delete (HoldToConfirm). Note at the top: "Changes apply to new onboarding runs only."

### 8.6 Customers: Leads

- Server-side search and filters (source, status, need), infinite scroll.
- Top section "Lead forms" (source `grow`): the qualified form leads.
- Row: name, business, status badge (new gold, booked ok, others muted), source label, time. Tap for detail.
- Source labels: `cal_booking` "Booked call", `grow` "Lead form", `lead_magnet` "Free tool", `portal_signup` "Portal sign-up".
- Need labels: customers "More customers and booked jobs", website "A new or better website", custom "A custom build: AI, app or software", content "Content and motion graphics", unsure "Not sure yet, I want to talk it through".
- Revenue labels: pre "Just starting, no revenue yet", under_10k "Under $10K a month", 10k_20k "$10K to $20K a month", 20k_50k "$20K to $50K a month", 50k_100k "$50K to $100K a month", 100k_plus "$100K+ a month".
- Detail: all fields, the message, booking time, attribution (utm source / medium / campaign, referrer). One-tap Call (tel:), Email (mailto:), Text (sms:), Copy. "Create client from this lead" pre-fills New client.
- Empty: "No leads yet. Lead forms, booked calls, free tool submissions and portal sign-ups appear here."

### 8.7 Customers: Free tools

- KPIs: Submissions, Last 30 days, Newsletter opt-ins, Leak reported ("per month, all submissions").
- Rows: tool name, name, email, business, leak per month, close rate "20% → 35%", reply speed, badges Newsletter (Opted in / No), Delivered (Email / No email, CRM / No CRM).
- Detail: the answers and the computed result as a readable breakdown.
- Empty: "No submissions yet. They appear the moment someone asks for a breakdown."

### 8.8 Customers: Subscriptions

- Segmented: One-time orders, Subscriptions. Live mode only (test purchases live in Test mode).
- Subtitle: "{subs} subscriptions · {orders} one-time orders ({bnpl} paid in instalments)".
- Order row: business or email, product, status badge (pending, paid, failed, refunded, partially_refunded, disputed), amount, paid with (Card, Klarna, Afterpay, Affirm, Link). Detail shows source and campaign.
- Subscription row: email, plan or "Webline Care", status (Stripe status; show "Ending <date>" when it cancels at period end), amount, period end. Detail: customer id (copyable), cancellation reason and feedback when present.
- Empty: orders "No one-time orders yet. Webline purchases appear here the moment Stripe confirms payment."; subscriptions "No subscriptions yet. They appear here once the Stripe webhook is connected."

### 8.9 More: Analytics

- Range chips: 24 hours, 7 days, 30 days (default), 3 months, 6 months, 1 year, All time.
- KPIs: Pageviews (sub: "Up 12% on the period before (1,204)", "Tracking started <date>" or "Nothing in the period before"), Average per hour/day, Busiest hour/day/week/month (count + label).
- AreaChart "Pageviews by {bucket}" with scrub (labels come from the API; do not parse them as dates).
- Donuts: Traffic sources, Devices. HBars: Top pages, Top countries (flag emoji + name), Referrers. Each shows "No data yet." when empty.
- Footnote: "First-party, cookieless traffic."

### 8.10 More: Ads (owner)

- Range chips: 7d, 14d, 30d (default), 3 months, All (last 12 months).
- Status line: "Synced <time>" or "Last sync failed" (signal) with the error. Button "Refresh from Meta" (long job: show the black hole and "Pulling from Meta…", up to 2 minutes). Success toast "Pulled {n} ad-day rows from Meta." Failure "Meta refused the pull. The inbox has the reason; an expired token is the usual cause."
- Not connected: a card explaining it needs the Meta ad account id and access token on the server.
- "What Meta reports": Spend, Impressions (sub reach), Link clicks (sub CTR), Cost per link click.
- "What the site recorded from those ads": Visits, Leads, Booked calls, Sales (revenue, return on spend).
- Charts: Spend per day, Visits from ads per day.
- Campaign cards (sorted by spend): spend, link clicks, visits, leads, booked, sales, revenue, cost per lead, cost per sale. Tap for the ads inside it.

### 8.11 Marketing (owner)

The Marketing tab has a segmented control at the top: Blog, Email, Links, CRM.

**Blog: post list**
- Filter chips: All, Draft, In review, Published, Archived. Search by title.
- Post card: title, "Featured" badge, status badge (published gold; in review neutral; draft and archived muted), category, author, updated time, and an "AI draft" badge when `source` is `ai_draft` (future automations will create these).
- Swipe or long-press actions: Edit, Publish / Unpublish, View live (published only, opens `https://www.tekmadev.com/blog/<slug>` in a Custom Tab), Share link, Move to trash (HoldToConfirm).
- Empty: "No posts yet. Create your first one."
- Categories (header menu, "Categories"): list with post counts, rename inline, add (name up to 60 characters), delete (HoldToConfirm: `Delete "<name>"? N posts will keep everything but lose the category.`). Category slugs never change on rename.

**Blog: editor** (the most important writing surface in the app; make it a joy)
- Full-screen editor with a collapsing top bar: status badge, Preview, Save, overflow (Publish / Unpublish, Archive, Move to trash, View live).
- Title (large display field), then the body as **Markdown** in a monospace-free, comfortable writing field (Geist 17sp, 28sp line height) with a formatting toolbar above the keyboard: H2, H3, bold, italic, link, bullet list, numbered list, quote, callout (tip / info / warning), Q&A answer block, table template, CTA template, divider, image (upload from the phone or paste a URL, then alt + caption). The toolbar inserts the exact syntax below; an uploaded image is inserted as `![Describe the image](url)` with the placeholder selected so the alt text can be typed at once.
- **Supported Markdown** (the server converts it into blocks; anything else becomes a paragraph):
  - `##`, `###`, `####` headings (a single `#` becomes `##`)
  - paragraphs separated by a blank line; inline `**bold**`, `*italic*`, `` `code` ``, `[text](url)`
  - `-` / `*` bullet lists, `1.` numbered lists (no nesting)
  - `> quote`
  - `> [!tip] text`, `> [!info] text`, `> [!warning] text` callouts
  - `> [!answer] Question?` then `> answer text` on the next quoted lines
  - `![alt](url "caption")` on its own line
  - pipe tables with a `---` separator row
  - fenced code blocks
  - `---` divider
  - a CTA block: `::: cta`, then `heading:`, `body:`, `button:`, `href:` lines, then `:::`
- **Preview**: a native render of the blocks, styled like the public article: title, excerpt, author "Shajeed I." with photo, reading time, key takeaways box, body blocks (headings Geist 700; answer blocks as a gold-bordered "short answer" card; callouts with an icon per variant; tables horizontally scrollable; CTA as an ink card with a pill button), FAQs. Get the blocks from `POST /blog/render` (debounced 400ms while previewing). Offline, preview shows the Markdown lightly formatted.
- **Details** sheet (tabs): 
  - Basics: slug (hint "Leave blank to auto-generate."; the server slugifies; warn when changing the slug of a published post: "The old link will stop working."), status (Draft, In review, Published, Archived), author, category (with "+ New category" inline), excerpt, featured.
  - Search: target query, meta title (with a live character count, aim for 60 or fewer), meta description (aim for 155 or fewer), keywords (chips), tags (chips), canonical URL, noindex switch. Show a live Google-style result preview.
  - Answer engine: key takeaways (one per row, reorderable), FAQs (question and answer pairs, reorderable).
  - Media: cover image (alt text required) and social image. Each has **Upload** (pick from the gallery or take a photo with `expo-image-picker`, then resize to at most 2400px wide and compress to WebP or JPEG under 10 MB with `expo-image-manipulator`) or paste a link, with a live preview and a remove button. 1200 x 630 is the recommended size.
- Saving: PendingButton "Save changes" / "Create post". Toasts: "Saved. A version snapshot was recorded." / "Post created. Keep editing, then publish when ready." / "Published and live on the site." Publishing asks HoldToConfirm ("Publish this post to tekmadev.com?").
- Autosave a local draft every 3 seconds while typing; on open, if a local draft is newer than the server copy, offer "Restore your unsaved changes?".
- Unsaved-changes guard on back (sheet: Save, Discard, Keep editing).
- Never show "Scheduled" (scheduling does not exist yet on the server).
- Post AI-drafted from a source (e.g. a video script): show its provenance in Details (source, model).

**Email**
- KPIs: Active subscribers, New (30d), Opens (30d), Clicks (30d).
- **Campaigns** (these are tracking registrations for emails the CRM sends; this app never sends email): card per campaign: name, key (monospace, copy), subject, opens, clicks, status badge (active gold / paused muted). Actions: Pause / Resume (note under the switch: "Pausing is a label only. Opens and clicks are still counted."), Delete (HoldToConfirm: "Counters reset if you add this key again. Past opens and clicks stay on record."). Empty: "No campaigns yet. Add one, then use its key in the template's tracking links."
- **New campaign**: Key (required; lowercased and dashed live as you type, e.g. `welcome` or `newsletter-2026-07`; help: "This is the c= value in the template's pixel and links."), Name (required), Subject, Template (suggestions from the templates list), Note.
- **Templates**: gallery of the ready-made marketing emails from `GET /email/templates`: name, subject, "use when" sentence. Detail: Preview (WebView with JavaScript disabled, rendering `previewHtml`) and Code tabs, a "Copy HTML" button that copies `html` exactly (it contains `{{contact.first_name}}` and `{{unsubscribe}}` merge tags that must survive untouched), and the campaign key with the hint "Paste as a Custom HTML block in the CRM."
- **Subscribers** (server search and paging): email, source, status badge (active gold; unsubscribed, bounced, complained muted), reason ("Too many emails", "Not relevant to me", "I never signed up", "Something else") and where it came from ("via the unsubscribe page", "via the CRM", "via the CRM, as permanent", etc.), CRM badge (CRM / No CRM), country, signed up. Detail: consent history timeline (subscribed, resubscribed, unsubscribed, bounced, "Marked as spam", "Said why they left"), with source and policy version, and a link "Inspect in CRM".
  - Unsubscribe (active only; HoldToConfirm): "Subscriber unsubscribed."
  - Delete = **permanent erasure** (HoldToConfirm with the full consequence: "Erase <email>? Their consent history is deleted and the CRM contact is suppressed and tagged erased. This address will never be pushed to the CRM again. This cannot be undone."). Toast: "Subscriber deleted. Their CRM contact is queued to be suppressed and tagged erased."
- **Recent engagement**: the latest opens and clicks: time, type badge (open muted / click gold), campaign, link, device, country. Empty: "No opens or clicks yet. They appear here as soon as a sent email is opened or a link is clicked."

**Links** (branded short links on the root domain, used for QR codes, bios and business cards)
- Card per link: `tekmadev.com/<slug>` (large, monospace), destination, UTM source / medium / campaign as chips, clicks (count-up), status badge (active gold / disabled muted), internal label.
- Actions: Copy link, Share (Android share sheet), **QR code** (full-screen QR of `https://www.tekmadev.com/<slug>` with the gold logo mark in the centre; save as PNG, share), Disable / Enable (disabling makes the link return 404 at once: say so), Delete (HoldToConfirm: "Clicks stay on record, but the counter is gone and the slug can be reused.").
- **New link**: slug with the fixed prefix "tekmadev.com/" (lowercased and dashed live; reserved words from `GET /meta` rejected inline: "That slug is reserved by an existing page. Pick another."), destination (a path like `/start` or a full `https://` URL; reject bare domains like `example.com` with "Add https:// for another website."), UTM source (suggestions: instagram, facebook, linkedin, business_card, google, youtube, email), UTM medium (social, qr, email, cpc, organic, offline), UTM campaign, internal label. Live preview of the final destination URL with UTMs appended. Success toast "Link created. Share https://www.tekmadev.com/<slug>" with a Share button.
- Links cannot be edited after creation (server rule); say so in the form.
- **Recent clicks**: time, link, device, country, referrer. Tap a link card to see its own click history.
- Empty: "No links yet. Create one above." / "No clicks yet. They appear here as soon as a link is visited."

**CRM sync** (always "CRM" in the UI, never a vendor name)
- **Connection** card: status badge (Not connected muted, Token rejected neutral, Verified ok, Not verified neutral) with its one-line explanation. "Verify connection" (long job, about 20 seconds: JobProgress "Checking, about 20 seconds"). The checklist of probe results, each with a plain-English sentence from the API and the detail when it failed. "Last checked <time>".
- **Switches**, three cards: Outbound ("Pushes leads, subscribers, bookings and clients as contacts, and every unsubscribe as email DND. Turning it on queues everyone once."), Inbound ("Applies CRM unsubscribes here and brings client appointments in for review."), Nightly reconcile ("Checks every contact on both sides and applies missed unsubscribes. Stops if one night would unsubscribe more than a fifth of the list."). Badge Off / Running / On, not running (with a red warning). Turning on is disabled until verified; turning on Outbound asks HoldToConfirm (it queues every contact) and the toast adds "N existing contact(s) queued for their first push."
- **Webhook app** status (installed on our account, on another account, or not installed). Installing is a browser flow: "Install in the browser" opens the website's CRM page in a Custom Tab.
- **Merge fields**: the 12 field names with their `{{contact.<key>}}` tag, tap to copy.
- **Queue**: four stats (Waiting to push, Pushed, Waiting to apply, Applied from the CRM) with their sub-lines, "Sync now" (long job). Run log (latest 6): job (Push, Inbound, Reconcile, Backfill, Verify), started, by (Schedule, Signup, You), result line, status badge (ok, running, part done, error). Empty: "Nothing has run yet. The first run happens after a switch is turned on."
- **Last reconcile**: "<time>: checked N contacts, corrected M." or the safety-stop explanation; "Run now" (long job, "Checking every contact"). Empty: "Has not run yet. It runs every night once the Reconcile switch is on."
- **Needs attention**: stuck items (what, direction, who, tries, why it stopped, when) with multi-select Retry (only for signed items) and Discard (HoldToConfirm: "Stop trying this one for good? It stays on record, it is not deleted."). Empty: "Nothing is stuck." with a calm check.
- **Contact inspector**: email field, then a two-column comparison "This site" vs "CRM": can be emailed (with a "disagree" badge when they differ), status, consented, tags, last synced, contact id; the not-found reason; the erased note; the consent history. When we have them unsubscribed but the CRM shows them mailable again: "They asked to come back, resubscribe them" (HoldToConfirm). Each lookup calls the CRM live, so do not auto-refresh it.
- Long jobs never auto-retry on timeout; on timeout, refetch the run log to see what happened.

### 8.12 More: Pricing (owner)

- Note at the top: "Saving creates a new Stripe price and archives the old one. Existing subscribers keep their price; only new checkouts use the new amount."
- **Sales tax** card: badge Charging (ok) / On, not charging (warn) / Off (muted), with the explanation text from the API, the Stripe Tax readiness line, and switches "Live" and "Test mode" (when the sandbox is configured). Turning tax on or off asks HoldToConfirm, since it changes what buyers pay.
- **Plans**: one card per plan (sorted by monthly price): name, "Live in Stripe" or "Not yet in Stripe" (signal). Fields: Monthly (CAD), Build & Install fee (CAD). Save.
- **Products** (Webline): name and tagline, status, One-time fee, Compare-at price (optional, "Shown struck through"), Webline Care monthly (CAD), First charge after (days, 1 to 365), "Purchasable" switch ("Uncheck to pause sales; the page stays up with a Book a call button"). Save.
- Saving is not instant (Stripe): PendingButton "Saving", then toast "Saved. The site and Stripe are updated." On partial failure show exactly what the API reports (never claim a save that did not happen).

### 8.13 More: Coupons (owner)

- List: code (monospace, tap to copy), discount ("20% off" or "$100.00 off"), applies to, duration ("One charge", "First month", "3 months", "Forever"), redeemed ("4 / 10"), expires, status badge (active gold / disabled muted). Deal link: for active coupons scoped to growth plans monthly or "Anything", a "Copy deal link" action (and Android share sheet) for the `dealUrl` the API returns.
- "Disable" (HoldToConfirm): "Coupon disabled. It can no longer be redeemed." There is no re-enable.
- **New coupon** (sheet): Code (optional, "e.g. STARTUP50, or leave blank for auto"; letters, numbers and dashes, uppercased live as you type), Internal label, Discount type (Percent off / Fixed amount off), Percent (1 to 100, default 20) or Amount (CAD, default 100), Applies to (scopes from the API with their help text; the "Anything" scope help is shown in signal red), Duration (only for monthly scopes: First month only, A set number of months, Forever) and months (default 3), Max redemptions (optional, "Unlimited"), Expires (date, optional, must be in the future). Live preview card of the coupon as you type.
- Success toast: `Coupon "CODE" created and live at checkout.` Errors: show the API message (the codes and messages are in section 11).
- Empty: "No coupons yet. Create one above."

### 8.14 More: Loader (owner)

A beautiful one. Live preview at the top: the page loader at 96dp, two sample pending buttons ("Booking…", "Saving"), and an appear-delay demo with "Replay the delay". Six sliders (section 5 table) with live values ("1.60s", "72%") and help text; the preview reacts instantly as you drag (haptic per step). Buttons: "Save for the whole site" (disabled until changed), "Undo changes", "Reset to original" (HoldToConfirm: "Put the loader back to the original settings on every page?"). Saving updates the website and this app. Toasts: "Saved. Every page on the site now uses these settings." / "Back to the original settings, live on every page."

### 8.15 More: Test mode (owner)

Test mode lets the owner buy Webline on the real site against the Stripe sandbox. It is switched on per browser with a cookie, so the app cannot switch it for itself.
- Show status from the API: keys configured, webhook secret configured, catalog ready (per product: price ready, care plan ready), counts of test clients, orders, subscriptions, and the latest test purchases.
- "Rebuild test catalog" (long job). "Delete all test data" (HoldToConfirm), toast "Deleted {c} test account(s), {o} order(s), {s} subscription(s) and {l} login(s)."
- "Open test mode in the browser": opens `https://www.tekmadev.com/admin/test-mode` in a Custom Tab, where the owner switches it on and buys. Show the test card `4242 4242 4242 4242` ("Any future expiry, any CVC, any postal code") with a copy button.

### 8.16 More: Team (owner)

- List: name, email, role badge (Owner gold, Manager neutral), last sign in or "never", added date. Owners set by the server environment show a lock and cannot be removed.
- "Add a team member": name, email, temporary password (8+ chars, with a "Generate" button and copy), role (Manager: "Works on Overview, Inbox, Analytics, Leads, Free tools, Clients and Subscriptions"; Owner: "Full access, can manage the team"). Toast "Team member added. Share the temporary password so they can sign in and change it." Offer the Android share sheet for the credentials.
- Remove (HoldToConfirm, with the warning "This also removes their client portal access if they have any.").

### 8.17 More: Profile

- Email (read only, "Your email is your login. To change it, ask an owner."), role badge.
- Display name. Change password (new + confirm, 8+ chars) via `supabase.auth.updateUser` on the user's own session. Errors: "New password must be at least 8 characters.", "The two passwords do not match."

### 8.18 More: App settings

- Appearance: System / Light / Dark (animated cross-fade between themes).
- Notifications: per-category Quiet and Push switches, a "Send a test notification" button.
- Security: biometric unlock (on/off), lock after (immediately, 1 min, 5 min, 15 min), "Hide content in the recent apps screen" (FLAG_SECURE).
- Data: "Clear cached data".
- About: version, build, API mode (mock/live, visible in dev builds), check for updates, the Kit screen easter egg.
- Sign out (clears the session, caches, drafts after confirming if unsaved drafts exist).

## 9. Push notifications

- Use `expo-notifications` with Firebase Cloud Messaging. The owner creates the Firebase project and gives you `google-services.json`; ask him when you reach this phase.
- On sign-in (and on token change) register the device: `POST /devices` with the Expo push token, platform `android`, app version and device name. On sign-out: `DELETE /devices/:id`.
- The server sends a push for each new or bumped notification the user can see, respecting their per-category Push and Quiet settings (that logic lives on the server).
- Android channels, one per category: Leads, Sales, Billing, Clients, Audience, Team, System. `critical` severity uses a high-importance channel variant (heads-up). Small icon: a white silhouette of the logo mark. Accent colour gold.
- Payload: `{ notificationId, url, category, severity }`. Tapping opens the deep link (section 7) and marks it read. Bumped problems reuse the same Android notification tag, so the shade shows one entry that updates, not a pile.
- Foreground: show an in-app toast instead of a system notification, and refresh the Inbox and badge.

## 10. Build, release and updates

- App name "Tekmadev Admin", launcher label "Tekmadev", package `com.tekmadev.admin`, scheme `tekmadev-admin`.
- Launcher icon: the gold logo mark on `#0e0d0b`, adaptive icon (foreground inside the safe zone), monochrome layer for themed icons. Generate the PNGs from the SVG paths in section 5.
- APK: an EAS Build profile (`android.buildType: "apk"`) or a local release build. Keep the signing keystore safe and tell the owner where it is; losing it means users must uninstall to update.
- `versionCode` increments every build; `versionName` follows semver.
- Updates: JS-only changes ship over the air with `expo-updates` (if the owner sets up an Expo account; ask him). For native changes, `GET /me` returns `app.latestVersion`, `app.minVersion` and `app.apkUrl`: show a gentle "Update available" card, and a blocking update screen when below `minVersion` (or on HTTP 426).
- No third-party analytics or ad SDKs. Crash reporting only if the owner agrees (suggest Sentry).

## 11. API contract (v1)

Base: `https://www.tekmadev.com/api/admin/v1`. Bearer auth (Supabase access token). JSON in, JSON out, `cache-control: no-store`.

**Envelope**
- Success: `{ "ok": true, "data": <T> }`
- Failure: `{ "ok": false, "error": { "code": string, "message": string, "fields"?: { [field]: string } } }` with a real HTTP status: 400 validation, 401 not signed in or not staff, 403 owner only, 404 not found, 409 conflict, 415 not JSON, 422 business rule (e.g. `care_required`), 426 app too old, 429 rate limited, 500 server, 502 upstream (Stripe or Meta failed), 503 not configured.
- `message` is human copy ready to show in a toast. `fields` maps form fields to inline errors.

**Conventions**
- Lists: `?cursor=&limit=` (default 30, max 100) return `{ items: T[], nextCursor: string | null }`.
- PATCH is partial: only the fields sent change. Sending `null` clears a field.
- Instants are ISO 8601 UTC. Calendar dates are `YYYY-MM-DD` (Toronto). Money is `{ amount: number /* cents */, currency: "CAD" }` or integer cents with a sibling `currency`.
- Creates accept `Idempotency-Key`.
- Every entity returned by a mutation is the full updated entity.

**Shared types (sketch, the server is the source of truth)**

```ts
type Role = "owner" | "manager";
type Tone = "neutral" | "gold" | "ok" | "warn" | "muted" | "signal";
type Money = { amount: number; currency: string }; // cents
type Me = {
  user: { id: string; email: string; name: string | null };
  role: Role;
  features: string[];              // feature flags for modules
  timezone: "America/Toronto";
  loader: LoaderSettings;          // section 5
  testModeConfigured: boolean;
  app: { latestVersion: string; minVersion: string; apkUrl: string | null };
};
type Page<T> = { items: T[]; nextCursor: string | null };
```

**Endpoints**

Session and meta
- `GET /me` → `Me`. Also initialises the user's inbox read state on first call.
- `GET /meta` → every enum and label the app needs: client statuses (with tones), onboarding stages, task kinds, task statuses, access providers and methods, access statuses, approval kinds, call statuses and disqualify reasons, intake schema, plans and products (ids, names), coupon scopes (value, label, help, oneTime), lead sources, needs, revenue bands, notification categories and event labels, blog block types and categories, link reserved slugs and UTM suggestions, subscriber statuses and unsubscribe reasons. Cache it; refetch with `ETag`.
- `GET /search?q=` → `{ results: { type: "client"|"lead"|"subscriber"|"post"|"coupon"|"link"; id: string; title: string; subtitle: string; url: string }[] }` (role-filtered).
- `POST /devices` `{ token, platform: "android", appVersion, deviceName }` → `{ id }`. `DELETE /devices/:id`.

Home
- `GET /overview` → `{ kpis: { totalLeads, bookedCalls, activeSubs, pageviews30d }, attention: { needsAction, blockedOnboardings, callsToReview, intakesToReview, behindPace }, traffic: { series, topSources, topPages }, topLinks, recentLeads, recentSubscriptions, inbox: { unread, needsAction, criticalUnread } }`

Inbox
- `GET /notifications?filter=all|unread|action&category=&test=1&cursor=&limit=` → `{ summary: { unread, needsAction, criticalUnread }, items, nextCursor }`
- `GET /notifications/summary` → `{ unread, needsAction, criticalUnread }`
- `POST /notifications/read` `{ ids: string[] }`, `POST /notifications/unread` `{ ids }`, `POST /notifications/read-all` `{ seen?: string }`
- `POST /notifications/:id/resolve` `{ resolved: boolean }` (also marks it read)
- `GET /notifications/prefs` → `{ category, label, muted, push }[]`; `PATCH /notifications/prefs/:category` `{ muted?, push? }`

Insights
- `GET /analytics?range=24h|7d|30d|3m|6m|1y|all` → `{ range, bucket, total, prevTotal, change, average, peak: { label, count }, trackingSince, series: { t, count, label, title }[], topSources, devices, topPages, countries, topReferrers }` (top lists are `{ label, count }[]`)
- `GET /ads?range=7d|14d|30d|3m|all` (owner) → `{ connected, lastSync, totals, days, campaigns, ads, outcomes, cost }`; `POST /ads/refresh` (owner, long job) → `{ rowsUpserted }`

Customers
- `GET /leads?q=&source=&status=&need=&cursor=` → `Page<Lead>`; `GET /leads/:id` → `Lead`
- `GET /tools/stats` → `{ submissions, last30d, optIns, leakReported: Money }`; `GET /tools/submissions?cursor=` → `Page<Submission>`; `GET /tools/submissions/:id`
- `GET /billing/orders?status=&cursor=` and `GET /billing/subscriptions?status=&kind=plan|care&cursor=` (live mode only)
- `GET /clients?status=&q=&test=1&cursor=` → `{ stats, items: ClientRow[], nextCursor }`
- `POST /clients` `{ businessName, email, name?, phone?, planId?, assignedStrategist?, sendInvite }` → `{ client, reused: boolean, invite: "sent"|"failed"|"skipped" }`
- `GET /clients/:id` → `{ client, billing, onboarding: { run, tasks } | null, intake, accessGrants, assets, approvals, agreements, calls, guarantee, crmLocation /* owner only */, members, activity: Page<Activity> }`
- `PATCH /clients/:id` (partial account fields and guarantee terms)
- `DELETE /clients/:id` (owner, soft delete)
- `POST /clients/:id/go-live` `{ override?: boolean }` → 422 `care_required` when a care plan is missing
- `PATCH /onboardings/:id` `{ stage?, blocked?, blockedReason?, targetLiveDate?, kickoffAt? }`; `POST /onboardings/:id/complete`
- `POST /onboardings/:id/tasks` `{ title, description?, stage?, owner?, kind?, required?, dueAt? }`; `PATCH /tasks/:id` `{ status }`
- `POST /intakes/:id/review`
- `POST /clients/:id/access-grants` `{ provider, label?, note? }`; `PATCH /access-grants/:id` `{ status?, note? }`
- `POST /clients/:id/approvals` `{ title, kind?, description?, previewUrl?, taskId?, attachment?: { label, url } }`
- `POST /clients/:id/calls` `{ contactName?, phone?, email?, serviceRequested?, bookedAt?, bookedFor?, status?, notes?, source? }`; `PATCH /calls/:id` `{ status?, qualified?, disqualifiedReason?, notes? }`; `POST /calls/:id/review` `{ counts: boolean }`
- `PUT /clients/:id/crm-location` (owner) `{ locationId, calendarIds: string[] }`
- `POST /clients/:id/members` `{ email, name?, title?, role? }`; `PATCH /members/:id` `{ role?, status? }`; `POST /members/:id/invite` (resend invite or send reset link)
- `GET /clients/:id/activity?cursor=`; `POST /clients/:id/activity` `{ kind: "note"|"update", text, subject?, actionUrl? }`
- `POST /assets/:id/sign` → `{ url, expiresAt }`
- `GET /onboarding-templates` (owner); `PUT /onboarding-templates/:key`; `DELETE /onboarding-templates/:key`

Marketing (owner)

- Blog
  - `GET /blog/posts?status=&q=&cursor=` → `Page<PostRow>`; `GET /blog/posts/:id` → `{ post, bodyMarkdown, faqs, keyTakeaways, … }`
  - `POST /blog/posts` (Idempotency-Key) and `PATCH /blog/posts/:id` (partial; send `bodyMarkdown` for the body) → the full post. The server slugifies, checks uniqueness (409 `slug_taken`), records a revision, and refreshes the public site.
  - `POST /blog/posts/:id/publish`; `POST /blog/posts/:id/status` `{ status: "draft"|"in_review"|"published"|"archived" }`; `DELETE /blog/posts/:id` (trash)
  - `POST /blog/render` `{ markdown }` → `{ blocks: BlogBlock[], readingTimeMinutes }`
  - `POST /blog/media` `{ fileName, size, type }` → `{ bucket, path, token, publicUrl }`: a one-time signed upload URL for the public `blog-media` Storage bucket (PNG, JPG, WebP, AVIF, GIF; 10 MB max; errors `type`, `size`). The app then uploads the bytes itself with supabase-js `storage.from(bucket).uploadToSignedUrl(path, token, data, { contentType })` (read the picked file into an ArrayBuffer first) and uses `publicUrl`. The website's blog editor works the same way.
  - `GET /blog/categories` (with post counts); `POST /blog/categories` `{ name }` (409 `category_dup`); `PATCH /blog/categories/:id` `{ name }`; `DELETE /blog/categories/:id`
  - `GET /blog/authors`
  - Block types: `heading {level 2|3|4, text}`, `paragraph {text}`, `list {ordered?, items}`, `quote {text, cite?}`, `callout {variant? info|tip|warning, text}`, `answer {question?, text}`, `image {url, alt, caption?}`, `table {caption?, headers, rows}`, `code {language?, code}`, `cta {heading, body?, buttonLabel, href}`, `divider`. Inline text inside blocks may contain `**bold**`, `*italic*`, `` `code` `` and `[text](url)`.
- Email
  - `GET /email/overview` → `{ stats: { activeSubscribers, new30d, opens30d, clicks30d }, campaigns, recentEvents }`
  - `POST /email/campaigns` `{ key, name, subject?, template?, description? }`; `PATCH /email/campaigns/:id` `{ active }`; `DELETE /email/campaigns/:id`
  - `GET /email/templates` → `{ key, name, subject, useWhen, html, previewHtml }[]`
  - `GET /email/subscribers?q=&status=&cursor=` → `Page<Subscriber>`; `GET /email/subscribers/:id` → subscriber + consent history
  - `POST /email/subscribers/:id/unsubscribe`; `DELETE /email/subscribers/:id` (permanent erasure)
- Links
  - `GET /links` → links with click counts and `shareUrl`; `POST /links` `{ slug, destination?, utmSource?, utmMedium?, utmCampaign?, label? }`; `PATCH /links/:id` `{ active }`; `DELETE /links/:id`
  - `GET /links/clicks?linkId=&cursor=` → `Page<Click>`
- CRM
  - `GET /crm` → `{ connection: { configured, health, probe }, switches: { outbound, inbound, reconcile }, app, mergeFields, queue, runs, lastReconcile, attention }`
  - `POST /crm/verify` (long job); `PUT /crm/switches/:surface` `{ on }` → `{ queued? }`; `POST /crm/sync` (long job) → `{ handled }`; `POST /crm/reconcile` (long job) → `{ corrected, halted }`
  - `POST /crm/retry` and `POST /crm/discard` `{ queue: "outbox"|"inbox", ids: string[] }` → `{ count }`
  - `GET /crm/inspect?email=` → the side-by-side comparison; `POST /crm/resubscribe` `{ email }`

Sales and settings (owner unless noted)
- `GET /pricing` → `{ plans, products, salesTax: { setting: { live, test }, live: TaxStatus, test: TaxStatus | null } }`
- `PATCH /pricing/plans/:id` `{ monthly?: number, setup?: number }` (cents) → `{ plan, stripe: "synced"|"skipped"|"failed" }`
- `PATCH /pricing/products/:id` `{ amount?, compareAt?, monthly?, trialDays?, active? }` → `{ product, stripe }`
- `PUT /pricing/sales-tax` `{ mode: "live"|"test", on: boolean }`
- `GET /coupons` → `Coupon[]` (with `dealUrl` when shareable); `POST /coupons` (Idempotency-Key) → `Coupon`; `POST /coupons/:id/disable`
- `GET /settings/loader`; `PUT /settings/loader` `LoaderSettings | { reset: true }`
- `GET /test-mode` → status, counts, recent test purchases; `POST /test-mode/catalog` (long job); `POST /test-mode/purge` `{ confirm: true }`
- `GET /team`; `POST /team` `{ name?, email, tempPassword, role }`; `DELETE /team/:email`
- `PATCH /profile` `{ name }` (any staff)

**Error codes and messages to expect** (show `message`; these are the server's strings):

| Area | code | message |
|---|---|---|
| Clients | `required` | Business name and a valid email are required. |
| Clients | `care_required` | Explains the missing care plan; offer the override |
| Clients | `crm_location`, `crm_calendar`, `crm_taken`, `crm_own`, `crm_db` | CRM mapping problems (format, already mapped, our own account, save failed) |
| Members | `email` | Enter a valid email. |
| Members | `invite` | Invite email failed. Check the Supabase auth email settings. |
| Templates | `json` | Payload must be valid JSON. |
| Pricing | `input` | Enter valid, non-negative numbers. |
| Pricing | `stripe` | The Stripe sync failed (the response says what was and was not saved) |
| Coupons | `percent` | Percent off must be between 1 and 100. |
| Coupons | `amount` | Enter a fixed amount greater than zero. |
| Coupons | `months` | Enter a valid number of months (1 or more). |
| Coupons | `max` | Max redemptions must be 1 or more. |
| Coupons | `expires` | Enter a valid expiry date. |
| Coupons | `expirespast` | The expiry date must be in the future. |
| Coupons | `code` | That code isn't valid. Use letters, numbers and dashes. |
| Coupons | `dupe` | A coupon with that code already exists. Pick a different code. |
| Coupons | `noproducts` | No matching Stripe products yet. Save a price on the Pricing page first. |
| Coupons | `nostripe` | Stripe is not configured, so coupons can't be created. |
| Loader | `db` | Could not save. Nothing changed on the site. Try again. |
| Blog | `slug_taken` | That slug is already used by another post (including one in the trash). |
| Blog | `category_dup` | A category with that name already exists. |
| Email | `key` | Enter a campaign key using letters, numbers and dashes. |
| Email | `name` | Enter a campaign name. |
| Email | `dupe` | A campaign with that key already exists. Pick another. |
| Email | `crm_erase` | Not deleted: the CRM erasure could not be queued, so their CRM contact would have stayed mailable. Try again. |
| Links | `slug` | Enter a slug using letters, numbers and dashes. |
| Links | `reserved` | That slug is reserved by an existing page. Pick another. |
| Links | `destination` | Enter a valid destination: a path like /start or a full https:// URL. |
| Links | `dupe` | A link with that slug already exists. Pick a different slug. |
| CRM | `not_configured`, `unverified` | The CRM is not connected, or has not passed Verify yet. |
| CRM | `probe`, `sync`, `reconcile` | The check, sync or reconcile failed (the message says why). |
| CRM | `nothing` | Nothing to retry or discard. |
| CRM | `resub_refused`, `resub_notfound`, `resub_stale` | The resubscribe could not be applied (bounced or complained addresses can never be revived). |
| Team | `owner` | The owner cannot be removed. |
| Any | `not_configured` | The server is missing a setting for this feature. |
| Any | `unavailable` | Could not load this just now. Nothing is lost: try again in a moment. |

## 12. Built for what comes next: automations

This app becomes the founder's control centre for automations that do not exist yet (the plan: an AI assistant that drafts content and work, a voice capture flow, and a worker that runs jobs from a queue, with the phone as the place where he approves things). Do not build those features now, but build the foundations so each one is a module, not a rewrite:

1. **Module registry with server feature flags** (section 4): a new module ships in an update and stays hidden until `GET /me` lists its flag.
2. **A generic Approvals pattern**: a reusable `ApprovalCard` that can render a proposed item (title, summary, a preview made of blocks: markdown text, key/value list, image, link, before/after diff) with Approve, Edit, Reject (with a reason). Build it into the component Kit with fixtures. Later the server will send `approval.*` notifications and an `/approvals` feed.
3. **Long jobs**: a reusable `JobProgress` (black hole loader, step labels, elapsed time, cancel) for anything the server runs for a while (already needed for Ads refresh and the test catalog).
4. **Command input**: reserve a hidden route `/assistant` with a text composer and a mic button placeholder (voice capture will use `expo-audio`, upload, and a server transcript). Do not wire it to anything yet.
5. **Notification-driven work**: every future automation reports through the same Inbox and push channel, with deep links. Keep the action-url mapping table extensible (unknown paths fall back to Inbox, never crash).
6. Keep business rules on the server. The app renders and asks; it does not decide prices, eligibility or counts.

## 13. Phases and acceptance

1. **Foundation**: project setup, design tokens, fonts, theme switching, component Kit (all components, both themes), the black hole loader (all variants, reduced motion, settings), splash and boot sequence, sign in and session, API client with the mock adapter and fixtures for every endpoint, module registry, tabs, deep link mapper. *Accept when*: the Kit screen shows every component in both themes, the loader matches the website side by side, sign-in works against the mock, and a cold start is smooth on a mid-range Android phone.
2. **Daily driver**: Home, Inbox (full), Clients (list, new, detail with every section, templates), global search, quick actions, app shortcuts.
3. **Customers and insights**: Leads, Free tools, Subscriptions, Analytics, Ads.
4. **Marketing**: Blog (including the editor), Email, Links, CRM sync.
5. **Sales and settings**: Pricing, Coupons, Loader, Test mode, Team, Profile, App settings.
6. **Push and security**: FCM, channels, device registration, biometric lock, FLAG_SECURE option, update checks.
7. **Live API switch-over**: when the owner says the API is live, flip `EXPO_PUBLIC_API_MODE=live`, run through every screen against real data, and fix schema drift (zod will tell you where).
8. **Automation foundations** (section 12).

Quality bar for every phase: TypeScript with no `any` in app code, no warnings in the console, 60fps scrolling on long lists (FlashList), no layout jumps when data loads, every screen checked in light and dark, with font scale 1.3, with TalkBack, offline, and with reduced motion on. Unit tests for formatting (money, Toronto dates), the deep link mapper, the loader keyframe math, and the API error mapping.

When you finish a phase, give the owner: what was built, screenshots (light and dark), anything that is mocked, and what you need from him next.
