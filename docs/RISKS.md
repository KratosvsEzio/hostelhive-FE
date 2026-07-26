# HostelHive — Risk Register

Consolidated from the follow-ups discovered while working the Trello board (F1–F34 in
[trello-tickets.md](trello-tickets.md)) plus findings from the B8 error-handling audit.
Triaged by **severity** and **owner** — the owner is who can actually close it, which is
the point: many of these are not frontend bugs.

Owner legend: **FE-now** (fixable in this repo, in unlocked files) · **FE-blocked**
(needs the in-flight maps/search changeset committed first) · **Backend** (Rails, not this
repo) · **Product** (a decision, not code) · **Deploy** (deployment config).

---

## CRITICAL — data loss, outage, or acting on a false belief

| # | Risk | Owner | Status |
|---|---|---|---|
| R1 | **~20 mutation sites fail silently.** `setActive`/`setInactive` have no error handler at all; room/invoice deletes optimistically remove a row then silently revert; favourite writes are `catchError(() => of(null))`. The user believes the action worked when it didn't. | FE-now | **B8 closes the class** |
| R2 | **Stale `draftId` → silent overwrite of an existing hostel.** `hh:onboarding:draft` never clears `draftId`, so returning to `/host/listings/new` `PUT`s over a published hostel instead of creating a new one. B4 widened the reach. Real data corruption. | Product | F24 — needs a draft-lifecycle decision |
| R3 | **`NG_ALLOWED_HOSTS` misconfig = total outage.** Since the F16 fix, unset → refuses to boot; *wrong* (e.g. `localhost` behind a proxy) → hard 400 on every request. | Deploy | F28 — documented in [DEPLOY.md](DEPLOY.md) |
| R4 | **Two backend routes do not exist — CONFIRMED.** `config/routes.rb:55` is `resources :renters, only: [:index, :show, :create, :update, :new, :edit]` (no `:destroy`), and there is no `favourites`/`favorites` match at all. Delete-renter always 404s; favourite writes are swallowed. Filed as backend tickets (BE-1, BE-2 below). **B3 (favourites) is now blocked on backend, not just on the uncommitted changeset.** | Backend | **confirmed real** — B8 makes them loud |

## HIGH — feature broken or a real exposure

| # | Risk | Owner | Status |
|---|---|---|---|
| R5 | **Tenant status change is a silent no-op.** FE sends `disposition_id`; Rails permits only `status_id` and discards the rest → 200 OK, nothing changes. | Backend-confirm + FE | B9 — blocked on the API probe |
| R6 | **Billing cron matches the exact day.** Days 29–31 are never billed in short months; tenants already stored with an out-of-range day are silently un-invoiced. | Backend + data audit | F8 |
| R7 | **Capacity/type divergence corrupts the public search facet.** "Quad sharing · Sleeps 1" makes a listing findable under the wrong bed-count filter. | FE-now | **T9 closes it** |
| R8 | **Naive error echo would leak the internal API origin + full URL** to end users (Angular's synthetic `HttpErrorResponse.message`). | FE-now | **B8 Safeguard B** |
| R9 | **The interceptor never surfaces 4xx.** Only 5xx/network are notified, with two hardcoded generic strings — so most real failures are invisible or mislabelled. | FE-now | **B8 closes it** |

## MEDIUM — correctness/UX, latent

| # | Risk | Owner | Status |
|---|---|---|---|
| R10 | `favorites.ts` fetches at construction with no `isBrowser` guard; `security.ts` reads no session. The F17 guard + Client render make them unreachable, not correct. | FE-now | F26 |
| R11 | `hostelId` read untracked inside both invoice rxjs streams on the tenant profile — same staleness class as the `roomId` bug T10 fixed. | FE-now | F30 |
| R12 | Tenant-form-drawer dialog a11y: Escape bound on a `tabindex=-1` backdrop the panel `stopPropagation`s; no focus trap. Now on two pages. | FE-now | F33 |
| R13 | `<app-host-tab-bar>` (`fixed bottom-0 z-40`) paints over the drawer's sticky Cancel/Save on mobile. | FE-now | F34 |
| R14 | Four `hh-button`-without-`Button` sites render unstyled. | FE-blocked | F23 |
| R15 | 401 silently signs the user out — no "session expired" signal. | FE-now | B8 follow-up (deferred) |
| R16 | No dedupe/stack-cap on toasts — a fanned-out dashboard against a down API stacks identical toasts. | FE-now | **B8 adds coalescing** |

## LOW — hygiene

| # | Risk | Owner | Status |
|---|---|---|---|
| R17 | Dead wizard step machinery + a stale class docstring claiming a 5-step wizard. | FE-now | F25 |
| R18 | Dead `toneFor`/`TONES` in `tenants.ts`. | FE-now | F29 |
| R19 | Repo is broadly non-prettier-conformant; `nx format:write` rewrites unrelated config. | FE-now | F31 |
| R20 | 3 pre-existing `web:test` failures + 5 `web:lint` errors, untriaged. | FE-now | F32 |

---

## Blocked, and on whom

- **On the in-flight maps/search changeset** (uncommitted, ~19 files): B1, T3, T4, B3, T8, R14. Committing or stashing it unblocks five tickets.
- **On a product decision**: T1, T2, T7 (underspecified), R2 (draft lifecycle).
- **On the backend / an API probe**: R4, R5, R6.

## What this pass closes

B8 (global) + T9 together close **R1, R7, R8, R9, R16** outright and make **R4, R5** *loud
instead of silent* — which is the correct treatment for a bug the frontend can surface but
not fix. Everything else is registered above with an owner so it stops living as a scattered
note.

---

## Backend hand-off tickets

The frontend cannot close these. They are written to be actioned by whoever owns the Rails
API (`D:\be-hostelhive`).

- **BE-1 — Add `DELETE renters/:id`.** `config/routes.rb:55` omits `:destroy`, so the host
  console's "remove tenant" action always 404s. Either add the route + a
  `renters#destroy` (soft-delete or hard, product's call) or the FE should hide the action.
  Until then B8 shows the host a pinned "couldn't remove" toast.
- **BE-2 — Add the favourites endpoints.** No `favourites`/`favorites` route exists, yet the
  FE calls `POST`/`DELETE /api/favourites/*` (`favourites-api.ts`). Every write 404s and is
  currently swallowed. Blocks **B3** and the seeker favourite feature entirely.
- **BE-3 — Tenant status change ignores the payload (R5/B9).** The FE sends
  `renter[disposition_id]`; `renter_params` permits only `:status_id` and Rails silently
  drops the rest → `update({})` → 200 OK, no change. Either accept `disposition_id` and sync
  it to `status_id`, or the FE must switch to sending `status_id`. **Needs the live
  `possible_statuses[]` shape** (does each entry carry an `id`? a `dispositions[]`?) — one
  read-only probe answers it. This is B9's blocker.
- **BE-4 — Billing cron short-month handling (R6/F8).** `HostelRenterBillingJob` matches
  `billing_date == Date.today.day` exactly, so days 29–31 are skipped in short months, and
  `RenterBillingJob` builds `Time.zone.local(y, m, billing_due_date)` which raises on a
  nonexistent day. Needs last-day clamping in both jobs, a `1..31` range constraint on the
  column, and an audit of tenants already stored out of range (silently un-invoiced).
