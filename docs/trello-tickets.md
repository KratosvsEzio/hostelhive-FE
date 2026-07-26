# HostelHive — Open Tickets (Trello)

**Source:** [Hostel Hive board](https://trello.com/b/Bxfo1MYL/hostel-hive)
**Captured:** 2026-07-26
**Scope of this file:** the **To Do** (11) and **Bugs** (11) lists only — 22 tickets.
Feature (8) and In Progress (1) are deliberately excluded.

This file is the working queue. Each ticket is resolved via `/implement`, and its
**Status** is updated here on completion.

## Status legend

| Status | Meaning |
|---|---|
| `OPEN` | Not started |
| `IN PROGRESS` | Being worked now |
| `RESOLVED` | Implemented **and** verified in the browser |
| `BLOCKED` | Needs a backend change, a product decision, or missing info |

## Triage legend

Initial read only — based on the card text, **not yet verified against the code**.
Confirm during each ticket's `/implement` run.

| Tag | Meaning |
|---|---|
| `FE` | Fixable in this repo |
| `FE+BE` | Frontend work that depends on a backend endpoint/contract |
| `NEEDS-INFO` | Card lacks the detail needed to act |

---

## Summary

### Bugs (11)

| ID | Title | Triage | Status |
|---|---|---|---|
| [B1](#b1) | Fix the pill of gender on card | `FE` | **RESOLVED** |
| [B2](#b2) | Click on login, it takes to sign up page | `FE` | **RESOLVED** |
| [B3](#b3) | Favorite button issue — 401 when signed out | `FE` | **RESOLVED** |
| [B4](#b4) | Save and exit button doesn't work; logo should link home | `FE` | **RESOLVED** |
| [B5](#b5) | Avatar dropdown should close on outside click | `FE` | **RESOLVED** |
| [B6](#b6) | New-hostel photo upload — 10-image cap not enforced, images not uploading | `FE` | **RESOLVED** |
| [B7](#b7) | Room type selectable once only; `$` → PKR with commas | `FE` | **RESOLVED** |
| [B8](#b8) | Show the exact error (toast/alert) | `FE` | **RESOLVED** |
| [B9](#b9) | Tenant status should update without reload; "Inactive" ≠ "Checkout" | `FE` | **RESOLVED** |
| [B10](#b10) | Emptying leave date in renters form doesn't send nil | `NEEDS-INFO` | **RESOLVED** |
| [B11](#b11) | Search not working — wrong query param | `FE` | **RESOLVED** |

### To Do (11)

| ID | Title | Triage | Status |
|---|---|---|---|
| [T1](#t1) | Host-side preview of own hostel as students see it | `FE` | **RESOLVED** |
| [T2](#t2) | Billing option during tenant onboarding/admission | `NEEDS-INFO` | OPEN |
| [T3](#t3) | Map price pill — hover for detail, click to hostel page | `FE` | OPEN |
| [T4](#t4) | Header layout — search widget on top, filters justify-between | `FE` | OPEN |
| [T5](#t5) | Show-password eye icon missing | `FE` | **RESOLVED** |
| [T6](#t6) | Picture extension whitelist inconsistent pre/post creation | `FE` | **RESOLVED** |
| [T7](#t7) | Rename "Single room" in the breakdown dropdown | `FE` | **RESOLVED** |
| [T8](#t8) | Button to copy location / open in Google Maps | `FE` | OPEN |
| [T9](#t9) | Room capacity should be pre-selected | `FE` | **RESOLVED** |
| T10 | Edit button should open edit drawer in place | `FE` | **RESOLVED** |
| T11 | Billing date dropdowns 1–31 with ordinal label | `FE` | **RESOLVED** |

---

# Bugs

## B1
### Fix the pill of gender on card
- **Card:** https://trello.com/c/B3gT9OTh
- **Triage:** `FE`
- **Status:** **RESOLVED** — in the in-flight maps/search changeset (not this branch's commit)
- **Attachments:** 1 screenshot

**Description (from card):** *(empty — screenshot only)*

**Notes:** Screenshot-driven; open the card attachment to see the intended pill
treatment before changing anything. Gender pill is a shared `ui` Badge variant, so
check for other consumers before editing.

**Resolution.** Reworked the shared `Badge` pill treatment: the gender variants went
from a filled pill (`bg-boys/girls text-white`) to an outlined one — colored border,
white fill, colored text, `rounded-lg` — matching the outlined-button shape and
staying legible over a photo. Added a `bordered` input to drop the outline (white fill
only) where the pill sits on an image. Being a shared `ui` Badge, this updates every
consumer at once.

Files: `lib/src/ui/lib/badge/badge.ts` (+ card consumers)

---

## B2
### Click on login, It takes to sign up page
- **Card:** https://trello.com/c/1SvUyj3H
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Description (from card):** *(empty — screenshot only)*

**The fix direction is the opposite of what the card implies.** `lead-wall.ts:63`
hardcoded `signal<AuthTab>('register')` and read nothing from the route. But
**Register is the deliberate default** — register-only heading copy, a
"Create account & view number" CTA, Register listed first, and the
highest-traffic caller is the phone-reveal gate on listing detail. Flipping the
default would have regressed that conversion gate.

**Resolution.** The tab is seeded from a `?mode` query param, and the three login
entry points now ask for it: the account menu, confirm-invitation, and the
become-a-host modal. Guard redirects ask for it too — reaching a guarded route
means the visitor believes they already have an account, and the guard already
attaches `returnUrl`, so the intent is *resume*, not *convert*.

Seeded via `linkedSignal`, **not** a route snapshot: `AppRouteReuseStrategy`
reuses `LeadWall` across a query-param-only navigation, so a snapshot read would
never move the tab for a guest already sitting on `/auth` who opens the account
menu. It also keeps the server-rendered tab correct (`/auth` is
`RenderMode.Server`).

**Also fixed, second bug in the same line:** `site-header.ts` dropped its
`returnUrl`, so logging in from "Sign in to become a host" landed on `/` instead
of `/host/listings/new`.

Files: `features/auth/lead-wall/lead-wall.{ts,html}`, new `lead-wall.spec.ts`
(12 tests), `features/auth/confirm-invitation/confirm-invitation.html`,
`features/auth/auth.routes.ts`, `layout/components/account-menu/account-menu.html`,
`layout/components/site-header/site-header.ts`, `core/auth/guards.ts`

Verified in **real SSR output** (built and ran the server, read the raw response
body) across all eight URL variants, and confirmed live in the browser: Log in
tab active, "Welcome back", no Register-only fields.

---

## B3
### Favorite Button Issue
- **Card:** https://trello.com/c/WoKbiLTn
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Description (from card):**
> User not signed in.
> Open any hostel detail page.
> Click on favorite button.
> API call give 401.
> If user is not signed in this should open sign in modal.

**Notes:** Guard the favourite action on auth state and open the sign-in modal
instead of firing the request. Has clear repro steps.

**Resolution.** `toggleSaved()` in the listing-detail page had no auth guard, so a
signed-out click fell straight through to `FavoritesStore.toggle()`, which hits the
authenticated favourites API → 401. Added a `session.isAuthenticated()` guard: when
unauthenticated, `toggleSaved()` navigates straight to `/auth?mode=login` (with a
`returnUrl` back to the listing) and returns early, so the favourites request never
fires. Sends the user directly to the login screen — and lands them on the **Log in**
tab (`mode=login`), since favouriting implies they likely already have an account —
rather than an interstitial gate (per product decision); the contact actions keep
their own `loginGateOpen` gate.

Verified live in the browser: while signed out, clicking **Favorite** navigates to
`/auth?mode=login&returnUrl=%2Fhostel%2F<slug>`, which opens on the **Log in** tab
("Welcome back", email + password only) with **no** favourites network request (no
401); while authenticated the toggle proceeds normally.

Files: `apps/web/src/app/features/public/listing/listing-detail/listing-detail.ts`

---

## B4
### Save and exit button doesnt work. clicking on logo should redirect to home page
- **Card:** https://trello.com/c/5yS3gCoX
- **Triage:** `FE`
- **Status:** OPEN
- **Attachments:** 1 screenshot

**Description (from card):** *(empty — screenshot only)*

**Notes:** Two changes in one card: (a) "Save and exit" is a no-op, (b) logo should
route home. Likely the onboarding/hostel-creation wizard.

---

## B5
### should be closed by clicking outside
- **Card:** https://trello.com/c/FAuXO3DE
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Description (from card):**
> We need backdrop for the Avatar dropdown panel.

**The card's premise was wrong.** A backdrop already existed since the initial
commit, but the header's `backdrop-blur` makes it a containing block for
`position: fixed` descendants (same CSS rule as `transform`/`filter`), so
`fixed inset-0` collapsed to a 148px strip over the header. Measured live:
backdrop 148px tall vs a 947px viewport, header 149px, `backdrop-filter: blur(8px)`.

This also caused a **second, unreported bug**: clicks inside the header closed the
menu *and were swallowed*, so the logo never navigated.

**Resolution.** Deleted the trapped backdrop; replaced it with a guarded
`document:click` listener plus Escape — immune to containing blocks, and the click
passes through to its target. Also closes on `NavigationStart`, adds
`aria-haspopup="menu"`, and removes the backdrop `<button>` that was an invisible
tab stop announced as "Close menu".

Files: `apps/web/src/app/layout/components/account-menu/account-menu.{ts,html}`

Verified live: outside click closes; second trigger click closes and *stays*
closed (no reopen flicker); third reopens; Escape closes and returns focus to the
trigger. SSR prerender confirmed working.

---

## B6
### while creating new hostel restriction of uploading 10 photos not working. also here the images are not uploading.
- **Card:** https://trello.com/c/x1jEywMl
- **Triage:** `FE` (no backend change needed after all)
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot
- **Implemented together with [T6](#t6)** — same screen, same root cause.

**B6 and T6 are the same bug.** Both creation surfaces did:
```ts
const valid = files.filter(isValidImage);
if (!valid.length) return;     // no error, no card, nothing
```
Picking an `.avif`/`.heic`/`.webp` produced *no visible effect at all*. That one
silent `return` is both "images are not uploading" and "extensions restricted".

**Pre-creation upload turned out to be possible** — I'd flagged it as the likely
blocker. The presign flow (`GET /api/documents/presigned_url` → direct S3 `PUT`)
creates a **free-floating** Attachment and returns its id, and
`attachment_ids`/`banner_id` are on `HostelInput` (not update-only). So photos
upload during the form and link in the same `POST /api/hostels`. **No backend
change, no new endpoint.** The reverse is *not* viable: `hostels-api.ts` documents
that `create()`'s response may not carry an `id`, so upload-after-create would
have nothing to attach to.

**Resolution.** Both creation surfaces now upload through the same pipeline the
profile page uses, with an optimistic card, a progress overlay, and **per-file**
rollback. Batch-atomic 10-photo cap (reject the whole batch, never silently
truncate), add tile greys at the limit, and every rejection path sets a visible
message. Submit is gated while uploads are in flight.

Wizard-specific: the draft now persists only `{id, url, attachmentId, primary,
label}` — no `File`, no base64, no `blob:` — and sends each attachment id at most
once across repeated saves, since the API appends. Photos now survive a reload,
which they never did before (`File` serialised to `{}` and blob URLs were dropped
on restore).

**Description (from card):**
> While creating new hostel, we need to add a validation of 10 images max upload,
> and images should actually call the BE API to upload them, just like how we are
> doing in the profile page of the host dashboard.

**Notes:** Reference implementation already exists on the host dashboard profile
page — mirror that upload path rather than writing a new one. Related to **T6**
(extension whitelist on the same screen) — consider doing them together.

---

## B7
### Room type should be selected once only, Also remove the dollar sign and put commas and PKR
- **Card:** https://trello.com/c/7S08biNU
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Resolution.** Room types already added are offered **greyed out with an
"Already added" tooltip** rather than removed — removing an option would blank the
dropdown trigger, since `hh-dropdown` falls back to the placeholder when the
selected value has no matching option. Availability is **derived** from the rooms
list, not tracked in a separate signal, so deleting a row re-enables its type with
no extra bookkeeping (that's where this class of bug normally regresses). After a
successful add, the selection auto-advances to the next available type.

Currency: removed the ambiguous `ti-coin` glyph; label is now `Price / month (PKR)`.
No shared atom was touched. The "commas" half of the card was **already satisfied** —
the list rows render `Rs 12,003` via `DecimalPipe`.

Applied to **both** surfaces — the card said "creating new hostel", but the public
onboarding wizard carried the identical bug and is the higher-traffic path. The
wizard also dedupes restored localStorage drafts.

Files: `features/host/new-hostel/new-hostel.{ts,html}`,
`features/public/onboarding/onboarding-wizard/onboarding-wizard.{ts,html}`

Verified live: used types greyed with "Already added", repeated `+` cannot
duplicate, delete restores availability, `Price / month (PKR)` rendering, zero coin
icons remaining.

**Description (from card):**
> We should noy allow the user to select same room type multiple times for the same
> hostel, and the $ symbol in the "Price/Month" input field should be PKR.

**Notes:** Two changes: dedupe room-type selection, and currency display
(`$` → `PKR`, thousands separators).

---

## B8
### Show the exact error
- **Card:** https://trello.com/c/ncdMoTvS
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Resolution.** New DI-free `core/errors/api-error-message.ts` extracts the server's
own message from every Rails envelope shape (`errors: string[]`, `errors: string`,
`errors: Record<string,string[]>`, singular `error`) and maps it to safe toast copy.
The synthetic `HttpErrorResponse.message` (which embeds the internal API origin +
full URL) is **never** surfaced — `serverMessages` is populated only from the
envelope, verified by a spec asserting no `"Http failure response"`/`192.168` string
appears for statuses `[0,400,401,403,404,422,500,503]`.

The error interceptor now notifies on **all 4xx except 401** (routed to the
unauthorized handler) plus 5xx/network, gated by a new `SUPPRESS_ERROR_TOAST`
`HttpContextToken` so the auth screens' inline errors don't double-toast. 4xx toasts
are **pinned** (`ttlMs:0`); 5xx/network keep the 6s ttl. The notification service
**coalesces** an identical un-dismissed toast (refreshing its timer) and **caps** the
stack at 4 (drops oldest) — so a fanned-out dashboard against a down API can't stack
duplicates. Destructive room/invoice deletes now fire the same pinned failure toast
on their error branch, reusing `toToastCopy` so the copy is byte-identical and
coalesces to one.

This makes the two confirmed backend gaps (delete-renter 404, favourites 404) **loud
instead of silent** — the correct FE treatment for a bug it can surface but not fix.

Files: `core/errors/api-error-message.{ts,spec.ts}`,
`core/interceptors/error-interceptor.{ts,spec.ts}`,
`core/notification.service.{ts,spec.ts,ssr.spec.ts}`, `core/tokens.ts`,
`core/api-resource.ts`, `app.config.ts`, `services/auth-api.ts`,
`util/models/api-error.ts`, `layout/components/toast-host/toast-host.html`,
`features/host/rooms/rooms.ts`, `features/host/invoices/invoices.ts`.

Verified: typecheck clean; +45 new passing unit specs (no-leak table, interceptor
routing incl. 401-not-toasted, coalescing/cap/ttl, SSR no-op); build succeeds; app
boots clean. Closes **RISKS R1, R8, R9, R16**. A "session expired" 401 toast is a
deliberate follow-up (a cold-load with an expired cookie is a 401 and would toast on
every load).

**Description (from card):**
> We need to show the error in some form of alert template, of some kind of toaster
> message

**Notes:** A `NotificationService` toast host already exists app-wide — surface the
API's actual message through it rather than a generic string.

---

## B9
### The active or inactive should reflect without reloading. also checkout is not a status
- **Card:** https://trello.com/c/K1kasrV7
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Description (from card):**
> When we Change the status of the tenant in the hostel/room. If the BE response is
> 200, then we should automatically change the status of the tenant is the table,
> and the "Inactive" status should not be mapped as Checkout, it should be exact
> which is coming from the API.

**Notes:** Optimistic/local update on 200 + drop the client-side `Inactive → Checkout`
relabel; render the API's status verbatim.

**Resolution.** Two intertwined defects:

1. **Mislabel.** The status column collapsed everything non-`active` to
   "Checked-out"/neutral, so an `inactive` tenant read as "Checked-out" — a status the
   backend doesn't even have. Replaced the branch with verbatim `STATUS_LABEL` /
   `STATUS_TONE` maps keyed on the API's `TenantStatus` (`active`→"Active"/ok,
   `inactive`→"Inactive"/neutral, `on-notice`→"On notice"/warn,
   `checked-out`→"Checked-out"/neutral); unknown slugs fall through to the raw value
   + neutral tone. Covered by 3 new unit tests.

2. **Phantom action + no live update.** A "Check out" menu action set a client-only
   `checked-out` status locally and never called the API; the real Inactivate/Activate
   actions triggered a full refetch. Removed the phantom "Check out" action entirely
   (per product decision), and rewired `setInactive`/`setActive` to write the new
   status through the list's existing `local` overlay on the API's 200 response — the
   pill flips instantly, no reload.

Verified live: all statuses render verbatim ("Active" pill shown), and the row action
menu now offers only View profile / Edit tenant / Inactivate — no "Check out".
(The optimistic-flip-on-200 path is unit-covered; it couldn't be exercised end-to-end
in the browser because the host session's token expired mid-test — the PATCH 401'd, so
no tenant data was mutated.)

Files: `apps/web/src/app/util/table-configs/tenants-table-cols.ts`,
`apps/web/src/app/util/table-configs/tenants-table-cols.spec.ts` (new),
`apps/web/src/app/features/host/tenants/tenants.{ts,html}`

---

## B10
### When try to empty the leave date in renters form it didnt get nil
- **Card:** https://trello.com/c/GcR1CM8f
- **Triage:** `NEEDS-INFO`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** none

**Resolution.** `toUpdateRenterPayload` now sends `leave_date: f.leaveDate || null`
(was `|| undefined`), so clearing the field posts an explicit `null` that Rails
persists as nil instead of the key being dropped and the old date surviving. The
function's own docstring already promised "clearable fields send an explicit null" —
`room_id`/`mess_charges`/`transportation_charges` already did; `leave_date` was the
one that didn't. `updateRenter`'s body type widened to `leave_date?: string | null`.
The **create** payload keeps `|| undefined` (nothing to clear on create). Regression
spec added: a cleared leave date serialises to `null`.

Files: `features/host/tenants/tenant-form-drawer/tenant-form.model.{ts,spec.ts}`,
`services/host-ops-api.ts` (committed earlier as `2eb96e9`).

**Description (from card):** *(empty)*

**Notes:** No description and no screenshot. Title implies clearing the leave-date
field sends `""` (or omits it) instead of `null`. Needs the exact form and expected
payload confirmed before implementing.

---

## B11
### Search isnt working. Wrong params
- **Card:** https://trello.com/c/f7AMHDsK
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Resolution.** The tenant search sent `filters['q']`, a param Rails never permits
(renter search is `params.permit(s: {}, f: {}, or: {}, sort: {})`), so every query was
silently discarded server-side. Changed to `filters['s[full_name]']` — `full_name` is
an indexed Elasticsearch field, confirmed against the backend clone. Verified the
`s[...]` search namespace is distinct from this repo's `f[...]` filter convention.

Files: `features/host/tenants/tenants.ts` (committed earlier as `2eb96e9`).

**Description (from card):**
> The search query param in the payload should be `s[full_name]`

**Notes:** Card writes the param between pipes (`|s[full_name]|`) — read as
`s[full_name]`. Confirm against the backend before shipping; note this repo's other
search params use the `f[...]` filter convention, so `s[...]` is a distinct search
namespace.

---

# To Do

## T1
### Host-side preview of own hostel as students see it
- **Card:** https://trello.com/c/HR85Bgwv
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** none

**Resolution.** Added a **Preview** action to the host hostel-profile header
(`hostel-profile.{ts,html}`) that opens the hostel's live public listing detail —
what students see — in a new tab. The public detail route is `/hostel/:slug` and the
seeker `slug` is the hostel id (`toListingDetail` in `listing-detail-api.ts` sets
`slug: String(d.id)`), so the link is simply `/hostel/${hostelId()}`, read-only, reusing
the existing public route with no backend or maps-file changes. The decided scope was the
in-app preview (open the public view in a new tab), not a separately-shared link.

**Description (from card):** *(empty — title carries the whole ask)*

> In the Host dashboard we have a hostel profile page, we should give a option to the
> hostel owners to view the preview of their hostels, how it will look like to the
> students/end users.

**Notes:** Overlaps the **"Preview Link for hostel"** card in the Feature list — the
same in-app preview satisfies both.

---

## T2
### Add a billing option for the new tenant while on his onboarding/admission
- **Card:** https://trello.com/c/Voi72Er1
- **Triage:** `NEEDS-INFO`
- **Status:** OPEN
- **Attachments:** none

**Description (from card):** *(empty)*

**Notes:** No detail on what "billing option" means — which fields, and whether it
needs a backend contract. Overlaps the **"Payment Method"** Feature card. Needs a
product decision before implementation.

---

## T3
### Clicking on the pill on the map need to redirect on the hostel detail page
- **Card:** https://trello.com/c/0TTjM4xX
- **Triage:** `FE`
- **Status:** OPEN
- **Attachments:** 2 (incl. inline image in description)

**Description (from card):**
> In the Ma[p], currently the basic detail modal is showing on double click on the
> price pill, it should show on mouse hover, and upon click it should redirect on the
> detail page of the hostel.

**Notes:** Three interaction changes: double-click → hover for the preview card, and
click → navigate to detail. Mind touch devices, where hover has no equivalent.

---

## T4
### Change header to this
- **Card:** https://trello.com/c/LyBKpMRe
- **Triage:** `FE`
- **Status:** OPEN
- **Attachments:** 1 screenshot

**Description (from card):**
> The search widget should be in the top of the header, and list of filters should be
> justify-between, and not be in the center of the page.

**Notes:** Screenshot is the spec — read it before changing layout. Touches the
shared `SiteHeader`, which renders on nearly every route, so check all areas after.

---

## T5
### Show password option missing
- **Card:** https://trello.com/c/49zz7Vhl
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Description (from card):**
> We need to add a eye icon in the password field to show the password.

**Resolution.** Toggle added to the shared `hh-input` atom, auto-enabled whenever
`type === 'password'`, so all 7 password fields are covered. `type()` stays the
semantic truth; an internal `revealed` signal drives a computed `effectiveType`.

Files changed:
- `lib/src/ui/lib/input/input.ts` — `revealed` linkedSignal, `effectiveType`,
  trailing `<button type="button">` with `aria-pressed` + stable `aria-label`,
  `SIZE_TOGGLE` map, `autocomplete` passthrough, Edge `::-ms-reveal` suppression,
  mobile `autocapitalize`/`autocorrect`/`spellcheck` off when password
- `lib/src/ui/lib/input/input.spec.ts` — new, 28 tests
- `lib/src/ui/lib/input/input.stories.ts` — real stories replacing the stub
- `apps/web/src/app/features/user/security/security.{html,ts}` — 3 raw
  `.hh-input` fields migrated onto the atom, `autocomplete` values preserved

Lead Wall (3 fields) and Host team (1 field) needed no template edits — they
inherit the toggle from the atom.

Verified: 30/30 tests pass; `lib:lint` and `web:lint` unchanged from baseline;
`nx build web` passes. Browser-verified on the Security page and the Lead Wall
register form — including that clicking the eye does **not** submit the Lead Wall
form, and that Password/Confirm reveal independently.

**Deliberately out of scope** (logged as follow-ups, see bottom of file): adding
`autocomplete` to Lead Wall / Host team, migrating `settings.html` off raw
`.hh-input`, and the `date-picker` clear-button a11y bug.

---

## T6
### Picture extension Issue
- **Card:** https://trello.com/c/FO8ukWIL
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot
- **Implemented together with [B6](#b6)** — same screen, same root cause.

**Whitelist decided:** jpg/jpeg, png, **webp**, avif, heic, heif. **`gif` excluded.**
The card contradicted itself (prose said gif, its mime map omitted it); `webp` was
in neither half but is common enough that omitting it would have generated a
follow-up. Now defined once in `photo-grid.ts` and shared by all three surfaces.

**The picker-greying mechanism.** `ACCEPT_ATTR` lists **extension tokens
alongside** the MIME types. Windows Chrome frequently has no OS MIME registration
for `.heic`/`.avif`, so a MIME-only `accept` greys them out — which is precisely
what T6 reported. Runtime validation is still mandatory (drag-drop and "All Files"
bypass `accept`) and accepts a file when its MIME is allowed **or** its MIME is
empty/generic and its extension is allowed — browsers commonly report
`file.type === ''` for HEIC/HEIF/AVIF.

**Scope widened with approval.** T6's actual complaint was the *inconsistency*:
creation was narrow, `hostel-profile` was `accept="image/*"` (wide). Narrowing only
creation would have made it *more* restrictive than profile — the opposite of the
ask. So `hostel-profile` was brought onto the same shared policy.

**HEIC previews.** Chrome/Firefox/Edge cannot decode HEIC/HEIF in `<img>`, so
accepting them would show broken-image icons to most users. An `(error)` handler
swaps in a "HEIC · preview unavailable" tile. Verified empirically in real
Chromium 148 — the `error` event fires for both a labelled HEIC and the
empty-MIME case. The presign `content_type` now uses an extension-derived MIME so
unlabelled HEIC files no longer land in S3 untyped.

Files: `lib/src/ui/lib/photo-grid/photo-grid.ts` + new `photo-grid.spec.ts` (17
tests), new `util/photo-picker.ts` + `photo-picker.spec.ts` (10 tests),
`services/image-upload.service.ts`, `features/host/new-hostel/{ts,html}`,
`features/public/onboarding/onboarding-wizard/{ts,html}`,
`features/host/hostel-profile/{ts,html}`

**Description (from card):**
> Fresh user.
> Hostel creation, trying to upload image restrict many image extensions.
> While trying to upload once hostel is created then the restricted extensions are
> also enabled.
>
> We should only allow the jpg, jpeg, png, gif, jpeg: "image/jpeg", jpg:
> "image/jpeg", avif: "image/avif", png: "image/png", heic: "image/heic", heif:
> "image/heif", extensions only

**Notes:** The whitelist differs between hostel-creation and post-creation upload —
unify it. The card's list is internally inconsistent (prose mentions `gif`, the
mime map does not) — **confirm whether `gif` is allowed** before implementing.
Pairs with **B6** (same screen).

---

## T7
### Single room Text should be changed
- **Card:** https://trello.com/c/U5sE0xV7
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Resolution.** Renamed the **display** of "Single room" → **"Single occupancy"** via a
label layer in `util/room-types.ts` (`displayLabelFor(name)`), keeping the canonical
backend value `'Single room'` intact — the value is free text on the backend and is used
as the capacity-lookup + grouping key, so renaming the value would fragment data. Applied
the label at every surface that shows a room-type to a human: the room-type dropdowns and
added-rooms lists in `new-hostel` and `onboarding-wizard`, the shared
`moderator/review/room-type-row` (used by moderator review and host hostel-profile), and
the host `rooms` filter. Covered by `room-types.spec.ts`. Public seeker surfaces
(`listing-card`/`listing-detail`) are a follow-up gated on the in-flight maps/search
changeset.

**Description (from card):**
> We need to come up with a better name for the single room in this brodown
> ["breakdown"] option.

**Notes:** Decided replacement wording: "Single occupancy" (display only).

---

## T8
### Option to copy the location or open on google maps
- **Card:** https://trello.com/c/tWHyl0cf
- **Triage:** `FE`
- **Status:** OPEN
- **Attachments:** 1 screenshot

**Description (from card):**
> We need to add some kind of button based human interaction to open the google
> map/application in the new tab.

**Notes:** Title says "copy the location **or** open on maps" while the description
only asks for the open-in-maps button — confirm whether copy-to-clipboard is also
wanted.

---

## T9
### room capacity should be pre selected
- **Card:** https://trello.com/c/83Uh3xyq
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**Resolution.** Capacity is now **derived from the room type** rather than free-typed.
New shared `util/room-types.ts` defines `fixedCapacityFor(type)` — Single 1, Double 2,
Triple 3, Quad 4, Dormitory `null` (manual) — plus `clampCapacity` (floor, then clamp
to the backend-validated 1–9). On both creation surfaces the capacity field is a
`linkedSignal` keyed on the selected type: a fixed type auto-fills and **disables** the
input (with a hint); Dormitory re-enables it with a default of **5** (editable). This
closes the divergence where a listing could be stored "Quad · Sleeps 1" and mis-indexed
under the wrong public bed-count search facet. `addRoom` also now rejects `price <= 0`
inline. The onboarding draft-restore path applies a persisted capacity only when the
effective type is Dormitory, so a fixed type can't be re-corrupted from an old draft.

Dormitory's default is a concrete integer **5** (the card's "5+" is the search-facet
bucket, not a valid capacity — the column is a validated integer 1–9).

Files: `util/room-types.{ts,spec.ts}`,
`features/host/new-hostel/new-hostel.{ts,html}`,
`features/public/onboarding/onboarding-wizard/{ts,html,spec.ts}`.

Verified: typecheck clean; +14 new passing unit specs (capacity derivation, clamp,
linkedSignal keying, draft-restore guard); build succeeds. Closes **RISKS R7**.

**Description (from card):** *(empty — screenshot only)*

**Notes:** Needs the intended default capacity confirmed (or derived from the
selected room type).

---

## T10
### Edit button should open edit form here
- **Card:** https://trello.com/c/vRHgcaUc
- **Triage:** `FE`
- **Status:** OPEN
- **Attachments:** 1 screenshot

**Description (from card):**
> If user clicks the edit tenant button in the detail page of the tenant, we should
> open the tenant edit form drawer on the same page, we should not redirect the user
> on the tenant listing page, and then open the edit form drawer on top of it.

**Notes:** Related to the tenants route structure — the three sibling `Tenants`
routes (`''`, `create`, `edit/:tenantId`) and `AppRouteReuseStrategy` are relevant
context here.

---

## T11
### Should add 1st of every month, 26th of every month
- **Card:** https://trello.com/c/6zsqIb4X
- **Triage:** `FE`
- **Status:** **RESOLVED** — branch `feat/t5-show-password-toggle` (not yet merged)
- **Attachments:** 1 screenshot

**This was more serious than the card described.** The Rails billing cron matches
`billing_date` against `Date.today.day` **exactly** (`hostel_renter_billing_Job.rb:9`)
with no last-day fallback and no DB range constraint. The field was an unbounded
number input, so a host could enter `0`, `45` or a year — and that tenant would
then **never be invoiced, silently**. The edit path made it self-perpetuating: a
stored `45` rendered as `45` and round-tripped straight back to the API.

**Resolution.** Both fields are now 31-option dropdowns labelled "1st of month"…
"31st of month", which makes out-of-range input unrepresentable. Critically — and
*not* in the card — out-of-range stored values now normalize to empty on load
rather than clamping, so editing an affected tenant surfaces a required-field error
instead of silently re-sending the bad value. Clamping was rejected: it would
fabricate a billing date the host never agreed to on a field that controls when
money is collected.

Also consolidated three duplicate `ordinal` helpers into `@util/ordinal`.

Files: new `util/ordinal.ts`, `util/billing-day.ts`, `util/billing-day.spec.ts`
(6 tests); modified `features/host/tenants/tenants.{html,ts}`,
`tenant-profile/tenant-profile.ts`, `util/table-configs/tenants-table-cols.ts`

Verified live: 31 options, teens rule correct (11th/12th/13th, not 11st/12nd/13rd),
create defaults 1st/5th preserved, hint copy rendering.

**Known limitation, accepted:** days 29–31 are offered but the backend still skips
them in short months. See F8 below.

**Description (from card):**
> For the "Billing date" and "Billing due date" fields should be a dropdown with
> possible values of 1 - 31 and we should add the validation that user should not be
> able to add the value above 31 and below 1, and in the trigger element, along with
> the selected value we should show a visual purpose text only something like
> "{n}st/nd/rd/th of month"

**Notes:** Needs an ordinal-suffix helper (1st, 2nd, 3rd, 4th…21st…31st). Fully
specified — ready to implement.

---

## Suggested order

Grouped so related screens are touched once, and unblocked work comes first.

1. **Self-contained, fully specified:** T5, B5, B8, T11, B3
2. **Hostel-creation upload screen (do together):** B6 + T6
3. **Tenants area:** B9, T10, B11, B10*
4. **Map & header:** T3, T4
5. **Smaller specified items:** B1, B2, B4, B7, T8, T9
6. **Blocked on a decision — resolve before coding:** T1, T2, T7

\* B10 needs its repro confirmed first.

## Open questions to resolve

These block or shape the tickets above:

1. **T6** — is `gif` allowed? Card prose says yes, the mime map omits it.
2. **T7** — what should "Single room" be renamed to?
3. **T9** — what is the default room capacity?
4. **T8** — is copy-to-clipboard wanted, or only open-in-maps?
5. **T1** — same as the Feature card "Preview Link for hostel"? In-app route or public link?
6. **T2** — what does "billing option" cover, and does it need a new endpoint?
7. **B11** — confirm `s[full_name]` against the backend.

## Follow-ups discovered during ticket work

Found while working other tickets; none are on the Trello board yet.

**Resolved:** F10 (layout only — 3 of 7 sites; see F23), F16, F17, F18.

| # | Finding | Source |
|---|---|---|
| F23 | Four remaining `hh-button`-without-`Button` sites, all blocked by another author's uncommitted work: `features/public/home/home.html`, `home/pakistan-map/pakistan-map.html`, `search/listing-card/listing-card.html`, `search/search-map/search-map.html`. A lint/test guard for this pattern is worth adding once they land — it would fail today. | F10 |
| F24 | **`draftId` is never cleared from `hh:onboarding:draft`.** A host who completes a listing and returns to `/host/listings/new` silently `PUT`s over their existing hostel. B4 **widened** this: previously only "Continue to payment" could trigger it, now an exit-shaped action can too. Needs a draft-lifecycle decision (clear on publish? scope the key by hostel?), not a patch. | B4 |
| F25 | The onboarding wizard's entire step machinery is dead — `step`, `stepLabels`, `lastStep`, `heading`, `subheading`, `nextLabel`, `next()`, `back()`, `goToStep()`, `publishOnApproval`, `published`, `genderLabel()`, `genderBadgeVariant()` have zero template references. **The class docstring is also stale** — it still describes "a 5-step wizard driven by `hh-stepper`". Note `step` is round-tripped through localStorage, so deleting it needs a draft-shape thought. | B4 |
| F26 | `features/user/favorites.ts` fires `listFavourites()` at construction with no `isBrowser` guard, and `security.ts` reads no session at all. The F17 guard + `RenderMode.Client` make these unreachable, not correct — any future decision to server-render `/account` re-opens the error-state flash. | F16/F17 |
| F27 | `seeker-tab-bar.ts` hardcodes `/account/favorites` and `/account/settings` with no session awareness, so guests now funnel to the Lead Wall. That is the intended conversion path, but making the tabs session-reactive is a design decision worth taking deliberately. | F17 |
| F28 | **Deployment prerequisite created by F16.** Passing `allowedHosts` to the constructor flips `isAllowedHostConfigured`, so an *unrecognised* host is now a hard **400**, not a CSR fallback. A missing `NG_ALLOWED_HOSTS` refuses to boot (by design); a **wrong** one is an outage. Behind a proxy it must list the **public** hostname, not `localhost`. See `docs/DEPLOY.md`. | F16 |
| F29 | `toneFor` / `TONES` in `tenants.ts` are dead — no template reference. Free to delete. | T10 |
| F30 | `hostelId` is read untracked (`this.store.selected()` inside an rxjs `map`) in both invoice streams on the tenant profile — the same latent staleness class as the `roomId` bug fixed in T10, just not reachable today because switching hostels navigates away. | T10 |
| F31 | `nx format:write` is unusable even when scoped: it always also rewrites `nx.json` and `tsconfig.base.json`, and reformats unrelated call sites in any file it touches. And `nx format:check` only inspects files changed vs base, so its "clean" result is misleading — the repo is broadly not prettier-conformant. Supersedes F5 with the mechanism. | batch 3 |
| F32 | Three pre-existing `web:test` failures remain untriaged: `session-store.spec.ts > tracks role + permissions for a host session`, `admin.routes.spec.ts > exposes roles, contracts and payments`, `moderator.routes.spec.ts > exposes the six moderator screens`. Plus 5 pre-existing `web:lint` errors and 2 in `lib:lint`. | ongoing |
| F33 | Pre-existing dialog a11y in the tenant form drawer (now on two pages, not one): Escape is bound on a backdrop with `tabindex="-1"`, and the panel calls `$event.stopPropagation()` on keydown so Escape can never reach it. `role="dialog" aria-modal="true"` with no focus trap. T10 added focus-in and focus-restore only. | T10 |
| F34 | `<app-host-tab-bar>` is `fixed bottom-0 z-40` rendered after the router-outlet, so on mobile it paints over the tenant drawer's sticky footer, partly covering Cancel/Save. T10 means this now affects the tenant **profile** page too. | T10 |
| F1 | `date-picker` clear affordance is a `<span role="button">` at 20px — fails WCAG 2.2 SC 2.5.8 (24px min) and binds only `keydown.enter`, so Space does nothing. Real a11y bug. `lib/src/ui/lib/date-picker/date-picker.ts:121-132` | T5 |
| F2 | Lead Wall + Host team password fields set no `autocomplete` at all, so password managers won't offer to save on registration. `hh-input` now has the passthrough; the call sites just need it. | T5 |
| F3 | `settings.html` still uses raw `.hh-input`, so the two Account tabs now differ visually. Blocked: its email field has a rich label with a "Can't be changed" badge that `hh-input`'s string `label` can't express — needs a label projection slot on the atom. | T5 |
| F4 | Password rules are inconsistent across surfaces: Lead Wall requires uppercase + digit, Host team and Security require length only. A host can set a staff password that registration would reject. | T5 |
| F5 | Repo is ~684 files away from prettier-conformant, with no `format` nx target and no CI gate. The half-state guarantees churn on every touched file. Either adopt and bulk-format in one commit, or drop the config. | T5 |
| F6 | `lib:typecheck` runs against `tsconfig.lib.json`, which **excludes** `*.spec.ts` — so no spec file in `lib` is ever type-checked by that target. | T5 |
| F7 | Storybook does not run: `SB_FRAMEWORK_ANGULAR_0001`, needs `npx storybook automigrate`. Story files typecheck but can't render. | pre-existing |
| F8 | **Backend:** billing cron matches `billing_date` against `Date.today.day` exactly, so days 29–31 silently skip short months (day 31 misses 5 months/year). `renter_billing_job.rb` also builds `Time.zone.local(y, m, billing_due_date)`, which raises for a nonexistent day. Needs last-day clamping in both jobs, plus a range constraint on the column. **Tenants already stored with an out-of-range day remain un-invoiced until a host reopens and re-saves them — an audit/backfill is likely needed.** | T11 |
| F9 | `search-bar.html:58` has the **identical trapped-backdrop bug** as B5 (Budget/Sharing popovers), same `backdrop-blur` cause. Root fix is removing `backdrop-blur` from `site-header.html:2`, but that's a design change needing sign-off. | B5 |
| F10 | Log out renders unstyled: `account-menu.html` uses `<button hh-button variant="text">` but `account-menu.ts` has `imports: [RouterLink]` — `Button` is missing, so the attributes are dead. One-line fix. | B5 |
| F11 | `hostel-profile` and `moderator/review/room-type-row` can still create duplicate room types — same missing guard as B7, on the edit flow. The B7 rule is enforceable on create and bypassable on edit. | B7 |
| F12 | Capacity is not derived from room type on the create surfaces, which is **why the B7 screenshot reads "Quad sharing · Sleeps 1"**. `moderator/review/room-type-row.ts` already has the Quad→4 mapping these two lack. | B7 |
| F13 | `+$event \|\| N` coercion bugs: `newRoomCapacity.set(+$event \|\| 1)` silently turns a typed `0` into `1`; `newRoomPrice.set(+$event \|\| 0)` lets a Rs 0 row through that the backend rejects (`price > 0`), surfacing as a late API error rather than inline validation. | B7 |
| F14 | `<label>` over `hh-dropdown` trips `@angular-eslint/template/label-has-associated-control` (existing offenders in `mess-notifications.html`). Properly fixable only by adding an `id`/`labelledby` input to `dropdown.ts`. Same ticket could add `label`/`error` inputs for parity with `hh-input` — but note that needs `host: { class: 'block' }`, which would blockify all 24 pill-variant call sites. | T11 |
| F16 | **SSR is silently disabled in a plain deployment.** `@angular/ssr`'s SSRF guard rejects *every* hostname when `allowedHosts` is empty, falling back to CSR with an empty `<app-root>` and no error. So in a bare `node dist/apps/web/server/server.mjs` run, **every `RenderMode.Server` route degrades to client-side rendering** — `/auth`, `/search`, listing pages. Fixed locally by setting `NG_ALLOWED_HOSTS`; needs to be configured in the deployment. Highest-impact finding of the batch. | B2 |
| F17 | `/account/*` has **no `canActivate`** (`app.routes.ts:48-81`). The seeker tab bar's Favorites and Account settings links are reachable while signed out and never redirect to `/auth`. | B2 |
| F18 | The Lead Wall close button is a hardcoded `[routerLink]="['/']"` (`lead-wall.html:30`) and ignores `returnUrl`, so dismissing the wall always dumps you on the home page even when you arrived from a listing. | B2 |
| F19 | `features/moderator/review/review.ts` holds a **third copy** of the photo-upload pipeline and is now the only surface not on the shared image policy — it still accepts gif and any image type. The obvious next consolidation; would delete the most code. | B6/T6 |
| F20 | Pre-existing bug in `hostel-profile.ts`: a failed photo **replacement** revokes the old blob URL before the new upload resolves, leaving the card pointing at a revoked `src`. The two creation surfaces avoid this; the fix should be backported. | B6/T6 |
| F21 | Photo **labels** are collected in all three surfaces and sent in none. `label_id` is only accepted at presign time, but the label dropdown only appears *after* upload completes — structurally unfixable without reordering the flow. | B6/T6 |
| F22 | `apps/web/project.json` declares a **literal** style path `node_modules/ngx-material-intl-tel-input/lib/assets/css/flags.css` (plus sibling `../img/flags.png` assets) which cannot resolve via Node's upward walk. Every worktree-based agent had to hand-create a junction to build. Referencing it via a package specifier would fix worktree builds permanently. Supersedes the build half of F15. | trio + batch 2 |
| F15 | **Worktree friction:** fresh git worktrees don't carry the gitignored `apps/web/src/app/{api,google-maps,google-oauth}.env.ts`, so `web:typecheck` fails until a build regenerates them. Worse, `apps/web/project.json` declares a **literal** style path `node_modules/ngx-material-intl-tel-input/.../flags.css` that can't resolve by walking up to the parent repo's `node_modules`, so `nx build web` fails in any worktree until a junction is made. Both bit all three parallel agents. Fix: commit `*.env.example.ts` and/or make `typecheck` depend on the env-generation targets. | trio |
