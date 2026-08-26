# HostelHive — Angular 22 Frontend Implementation Plan

> Approved 2026-06-11; updated 2026-06-12 for **PRD v3 (Features 6–8)**. Companion to `HostelHive-Frontend-Build-Plan.md` (high-level program plan).
> This is the concrete, design-informed engineering plan for the build.
> **Execution started 2026-06-12 — M0 (walking skeleton) in progress; live status in §11 Execution Log.**

## Context

**Why now.** HostelHive's backend is complete and the design phase is finished: **25** fully-linked,
brand-correct screens (`design-mockups/00-…` → `28-…`) covering all **8 PRD v3 features**, a
component-library spec (`design-mockups/30-design-system.html`), and design tokens extracted from Figma
(`design-mockups/assets/hh-theme.js`, `hh.css`, real logo PNG).

**What this plan adds.** A concrete, executable Angular 22 build: the Nx workspace shape, a
screen-by-screen mapping from each mockup to a route + component + lib, the foundation (M0) steps,
and the milestone slotting of all 25 screens. It reuses the design system verbatim — `hh-theme.js`
becomes the Tailwind preset and `30-design-system.html` is the spec for the `ui` library.

**Intended outcome.** A production Angular FE implementing the marketplace loop first
(Seeker + Host onboarding + Moderator), then Operations/Billing + ~~Analytics~~ (shipped inside
the host overview rather than as its own screen — §11, 2026-08-26), plus the v3 additions —
a **Super Admin panel** (roles, contracts, payments), **subscription contracts** (webhook-gated publishing),
and **Manager/Warden sub-users** — all matching the mockups because the same tokens drive both.

---

## 0. Confirm before M1 (the one true dependency)

FE-only build → the **API contract is the critical path**. From the BE team we need:
- **OpenAPI/Swagger spec?** (Branch A: generate typed SDK. Branch B: 1–2 wk contract-capture spike.)
- Base URLs per env; **auth token flow** (access+refresh; cookie vs header; 24h/8h expiry behaviour);
  **error envelope**; **pagination** (cursor vs offset + page size).
- **Payment**: hosted-redirect vs embedded; return-URL contract + success signal.
- **Image upload**: presigned-direct vs multipart; async scan/moderation "pending" status exposure.
- **Maps**: referrer-restricted key per env; Places/Geocoding browser-side vs BE-proxied.
- **Subscription webhook (F7)**: gateway → HMAC-verified webhook contract; how the FE learns contract activation (poll `contract-status` vs signed redirect); the plan/price catalogue source.
- **Roles & scoping (F6/F8)**: the granular permission-flag list + role→flag mapping endpoint; `property_staff_assignments` so Manager/Warden requests are `property_id`-scoped server-side (the FE only mirrors with guards).

Plan assumes **Branch A** with the spike in reserve. M0 proceeds regardless; only the typed
`data-access` SDK is gated on this.

---

## 1. Stack (locked)

Angular **22** (standalone, zoneless, Signals) · **Nx** monorepo · **Signal Forms** · **`httpResource`**
+ OpenAPI-generated SDK · **NgRx SignalStore** for cross-cutting state · **Tailwind** (preset from
`hh-theme.js`) · **SSR** (`@angular/ssr`) for `web` · `@angular/google-maps` · `ng-apexcharts` ·
TipTap + DOMPurify · **Vitest** + **Playwright** + **Storybook**.

---

## 2. Nx workspace topology

**Apps** — `web` (SSR seeker public) · `console` (one role-guarded SPA for every authenticated surface): **host** `/host/**`, **Manager/Warden** (scoped host — single property, reduced nav, no property selector), and the internal **staff** area `/admin/**` shared by **Moderator** and **Super Admin** (Feature 6 folds moderation into the admin panel). `/admin/**` is additionally edge-protected (IP allowlist, PRD §9.2). *(Two-app split still holds; if admin/payments sensitivity later warrants hard isolation, `/admin` can be split into its own app.)*

**Libs** — `ui` (design system + Storybook), `styles` (Tailwind preset + globals + fonts/icons/logo),
`data-access` (SDK + interceptors + httpResource), `auth` (session store + guards + Lead Wall),
`maps` (google-maps wrapper), `util` (PKR/date pipes, validators, presigned upload), and lazy feature
libs: `feature-home`, `feature-search`, `feature-listing`, `feature-onboarding`, `feature-host-shell`,
`feature-host-ops`, ~~`feature-host-analytics`~~, `feature-moderation`, **`feature-subscription`** (host billing + plan checkout, F7), **`feature-team`** (host sub-user management, F8), and **`feature-admin`** (Super Admin: roles, contracts, payments, F6).

> This split never shipped as Nx libs — see §11 (2026-06-13): the workspace was collapsed to
> one app plus one library, and these became folders under `apps/web/src/app/features/`.
> `feature-host-analytics` is struck through because its screen is gone entirely (§11,
> 2026-08-26), not merely relocated.

The `auth` lib expands to the full v3 role set — **Super Admin, Admin, Support Staff, Moderator, Host, Manager, Warden, Seeker** — with functional role guards plus a **`hasPermission` directive/guard** driven by granular flags (`contracts.view`, `payments.refund`, `roles.manage`, …), and **property-scope guards** so Manager/Warden routes resolve to a single `property_id`.

---

## 3. Design → Angular mapping (all 20 screens)

> **Routes and topology updated 2026-08-26 to what actually shipped.** Two columns below are
> the *original plan* and no longer describe the workspace: there is no separate `console`
> app and there are no `feature-*` libs — both were collapsed into one app plus one library
> (see §11, 2026-06-13). Read **App** as "which half of `web`" and **Feature lib** as the
> folder under `apps/web/src/app/features/`. The **Route** column is current.
>
> Every host-console route is scoped to a property: `/host/:hostelId/<section>`, defaulting
> to `overview`. A bare `/host` resolves the user's own hostel and redirects.

| Mockup | App | Route | Feature lib | Key components |
|--------|-----|-------|-------------|----------------|
| `00-home` | web | `/` | feature-home | HeroSearch, ListingCard, CityTile, HostCtaBand, HowItWorks, SiteFooter |
| `01-search-results` | web | `/search` | feature-search | SearchPill, FilterChips, PriceRangeFilter, ListingCard grid, LoadMore, states |
| `02-search-map` | web | `/search?view=map` | feature-search + maps | SplitListMap, MapPricePin, ListingRow, FilterChips, PriceRangeFilter (popover) |
| `03-listing-detail` | web | `/hostel/:slug` | feature-listing | PhotoGallery, AmenitiesGrid, RoomCard, NearbyList, DetailMap, ContactCard, HostCard, MobileContactBar |
| `04-lead-wall` | web | overlay + `/auth` | auth | LeadWallModal, AuthTabs, RegisterForm, VerifyEmailState |
| `09-host-overview` + `16` | console | `/host/:hostelId/overview` (+ `/revenue`, `/occupancy`, `/movement`) | host/overview | KpiCard, RevenueChart, OccupancyTimeline, TenantLedger, NeedsAttentionList — see the `16` note below |
| `10-host-listings` | console | *(no index route)* | — | Folded into the property switcher in the shell header and on `/more`; a host with one hostel never needed a list of one |
| `11-onboarding-wizard` | console | `/host/listings/new` | public/onboarding | Stepper, BasicInfoStep, MapPinStep, MediaUploadStep, RoomConfigStep, PaymentStep |
| `12-rooms` | console | `/host/:hostelId/rooms` (+ `create`, `bulk`, `edit/:roomId`, `:roomId`) | host/rooms | RoomTable, RoomFormDrawer, AvailabilityBadge, room-detail Calendar/Details tabs |
| `13-tenants` | console | `/host/:hostelId/tenants` (+ `create`, `edit/:id`, `profile/:id`) | host/tenants | TenantTable, CheckInDrawer, StatusChip |
| `14-utilities` | console | `/host/:hostelId/utilities` (+ `add`, `edit/:billId`) | host/utilities | UtilityBillForm, SplitTable (override), PeriodSelector |
| `15-invoices` | console | `/host/:hostelId/invoices` (+ `create`, `edit/:billId`) | host/invoices | InvoiceLedgerTable, InvoicePdfPreview |
| `16-analytics` | — | **deleted 2026-08-26** | — | Shipped as part of `09` instead. Mockup removed; see the §11 entry |
| `17-host-settings` | web | `/account/settings` | user/settings | ProfileForm, NotificationToggles, Security, DangerZone, Google-Analytics consent toggle — moved out of the console, since it is the account and not the hostel |
| `18-host-subscription` | console | `/host/:hostelId/subscription` | host/subscription | CurrentPlanCard, PlanTierCard, RenewalCountdown, PaymentHistoryTable, failed/expired states |
| `19-host-team` | console | `/host/:hostelId/team` (+ `edit/:staffId`) | host/team | StaffTable, AddStaffDrawer (Manager/Warden), ScopeBanner, reassign/deactivate |
| *(no mockup)* | console | `/host/:hostelId/bookings` | host/bookings | Month calendar + day ledger, bookings table, disposition + arrival filters, assign-room and booking-form drawers |
| *(no mockup)* | console | `/host/:hostelId/expenses` (+ `new`, `:id`, `:id/edit`) | host/expenses | ExpenseTable, AddGrocery, ExpenseDetail |
| *(no mockup)* | console | `/host/:hostelId/mess` (+ `add`, `confirmations`, `notifications`) | host/mess | WeeklyMenu, MessConfirmations, MessNotifications |
| *(no mockup)* | console | `/host/:hostelId/more` | host/more | The phone's overflow menu — every console destination that has no slot in the 5-tab bar |
| `20-moderation-queue` | console | `/admin/queue` | feature-moderation | ModConsoleShell, QueueTable, DaysInQueueBadge, QueueTabs |
| `21-moderation-review` | console | `/admin/review/:id` | feature-moderation | InlineEditFields, PhotoGrid, MapVerify, DecisionBar, AuditSidebar |
| `22-delta-media` | console | `/admin/media` | feature-moderation | PendingMediaGroup, PhotoApproveCard |
| `23-moderation-listings` | console | `/admin/listings` | feature-moderation | DispositionFilterChips, ListingsTable |
| `24-moderation-audit` | console | `/admin/audit` | feature-moderation | AuditTimeline, ActionIcon, DiffRow, AuditFilters |
| `25-moderation-settings` | console | `/admin/settings` | feature-moderation | ProfileSection, ReviewPrefs, Security (IP allowlist), SessionList |
| `26-admin-roles` | console | `/admin/roles` | feature-admin | RoleList, PermissionMatrix (granular flags), custom-role create |
| `27-admin-contracts` | console | `/admin/contracts` | feature-admin | ContractsTable, status filters, row actions (mark-paid/cancel/extend/refund), ContractDetail |
| `28-admin-payments` | console | `/admin/payments` | feature-admin | PaymentsTable, webhook/method columns, CSV export |
| `30-design-system` | — | Storybook | ui | Source-of-truth spec for every shared component |

---

## 4. M0 — Foundation / walking skeleton (~3 weeks)

1. **Workspace**: `create-nx-workspace` (Angular preset); `web` (SSR) + `console` apps; zoneless + standalone; module-boundary lint.
2. **Tokens → code**: port `hh-theme.js` → typed `tailwind-preset.ts` + CSS vars; bring `hh.css`, Inter/Poppins, Tabler, logo into `styles`.
3. **`ui` atoms** (spec = `30-design-system.html`): Button, Inputs, Chip, Badge (+ gender variants), StatusPill, Cards, Modal, Drawer, Toast, Skeleton, Empty/Error/Gate, Table, Stepper, Tabs, Pagination, RangeSlider, Tooltip + Storybook stories.
4. **`data-access`**: generate SDK from OpenAPI (or stub); HttpClient config, auth + error interceptors, httpResource helper.
5. **`auth`**: session SignalStore, role guards, login/register shells, refresh flow.
6. **App shells**: `web` nav+footer; `console` sidebar+topbar (host & moderator variants).
7. **CI/CD**: Nx affected lint/test/build, bundle budgets, Lighthouse CI, Playwright smoke, Husky.
8. **Exit**: one SSR route + one guarded console route render in CI; Storybook matches the token sheet.

---

## 5. Milestones (marketplace loop first)

| Milestone | Screens / scope | Band |
|-----------|-----------------|------|
| M0 Foundation | shells + `ui` atoms + Storybook + full role/permission guards (8 roles, flag directive) | ~3 wk |
| M1 First Light (loop) | `11`/`20`/`21`/`01`/`03`/`04` cores — proves maps, upload, **subscription checkout + webhook activation**, email-verify, moderation | ~6 wk |
| M2 Seeker depth | `00`, `01` full, `02`, `03` rich, SSR/SEO | ~3 wk |
| M3 Moderation & Admin · F6 | `20`–`25` + `26`/`27`/`28` (roles & permissions, contracts, payments consoles) | ~4 wk |
| M3.5 Subscriptions · F7 | `18` host billing + plan tiers + contract state machine, renewal reminders, expiry → listings-pause gating | ~3 wk |
| Hardening → ★ Release 1.0 | perf/a11y/security/QA | ~2 wk |
| M4 Host ops, billing & Team · F8 | `09`,`10`,`12`,`13`,`14`,`15`,`17`,`19` + Manager/Warden per-hostel scoping | ~6 wk |
| ~~M5 Analytics~~ | ~~`16` + multi-property exports~~ — **dropped 2026-08-26**: the overview absorbed it (§11) | ~~≈3 wk~~ |
| Hardening → ★ Release 1.1 | perf/a11y/QA | ~2 wk |

~3–4 senior Angular engineers + 1 QA ≈ **~26–29 weeks** (up from ~20–22 before Features 6–8).

---

## 6. Data layer & state

`httpResource`/SDK for server reads · entities per PRD §11 (incl. the status/disposition state machine §11.2)
**plus v3: `subscription_plans`, `contracts` (draft→pending-payment→active→expired/cancelled), subscription `payments`, `roles` + permission flags, `property_staff_assignments`** ·
SignalStores: `session` (role + permission flags), `dashboardFilters` (URL-synced `?property=`), `onboardingDraft`
(server truth + localStorage recovery), `reviewWorkingCopy`, **`subscription` (contract status + renewal), `adminContracts`/`adminPayments` filter state** ·
Manager/Warden scope enforced by route guards + `property_id`-scoped queries · Signal Forms for wizard/billing/settings/roles.

## 7. Definition of done (every screen)

Five states · responsive 375/768/1280 · WCAG 2.1 AA · unit + Playwright happy-path · Storybook story · within budget.

## 8. Risks

API contract (confirm first) · payment return flow · upload+scan states · map cost/quota ·
scope creep (reviews/OAuth/messaging stay out) · UTC+5 dates · **subscription webhook + expiry→listings-pause gating (F7)** · **Manager/Warden cross-property data leakage** — enforced server-side, FE guards only mirror (F8) · **permission-flag drift** between FE directives and BE checks.

## 9. Verification

Storybook vs `30-design-system.html` · rendered route vs `design-mockups/NN-*.html` (acceptance reference) ·
M1 full-loop Playwright · Lighthouse CI budgets (§9.1) · axe-core a11y · cross-browser matrix pre-release.

## 10. First actions

1. Confirm API contract with BE (§0).
2. Scaffold Nx workspace + port `hh-theme.js` → Tailwind preset.
3. Build `ui` atoms + Storybook from `30-design-system.html`.

---

## 11. Execution log (live) — started 2026-06-12

**Build kicked off 2026-06-12.** Environment: **Node 20.19.0**, **npm 10.8.2**, Windows. Stack as built: **Angular 21.2.9 + Nx 22.7.5** (both current stable), scope **`@hostelhive`** (imports like `@hostelhive/ui`), **npm**, **Vitest** (`vitest-analog` for Angular) + **Playwright**, **Tailwind v3**. `web` = SSR, `console` = CSR. Repo root = Nx root; `design-mockups/` + `docs/` kept as siblings (ignored by the build, retained as the acceptance reference).

### Version decision — Angular 21 now, Angular 22 by migration *(user decision, 2026-06-12)*
Angular 22 is the latest release (`@angular/core` 22.0.1), **but no Nx build supports it yet** — `@nx/angular` caps its Angular peer range at `< 22.0.0` on stable (22.7.5), the 23 RC, **and** today's canary. Rather than drop Nx (the monorepo backbone) or run Nx against an incompatible Angular, we build on **Angular 21 + Nx 22 (fully stable)** and will run a one-command **`nx migrate` to Angular 22 the moment Nx ships support** — before any v22-specific feature work (Signal Forms stable). M0 (scaffold, design system, shells) is version-agnostic, so the stagger costs nothing.
**Tailwind v3** chosen over v4 so the `styles` preset is a 1:1 port of `hh-theme.js` — exact parity with the 25 mockups, single shared source for both apps + Storybook. (v4's CSS-first migration is a later option.)

### Scaffold note
Nx 22's `angular-monorepo` preset now clones a fixed "shop" demo (`apps/shop`, `apps/api`, `@org` scope). We **discarded the demo projects**, reset the scope to `@hostelhive`, replaced the boundary tags, dropped the `@nx/docker`/`release` config, then generated the real `web`/`console` apps + 6 libs — reusing the install (no re-download).

### Workspace layout
- **Apps**: `apps/web` (SSR) + `apps/web-e2e`, `apps/console` (CSR) + `apps/console-e2e`.
- **Libs**: `ui` & `maps` (`type:ui`), `data-access` & `auth` (`type:data-access`), `util` & `styles` (`type:util`) — all `scope:shared`.
- **Boundaries** (`eslint.config.mjs`): `scope:{web,console,shared}` × `type:{app,feature,ui,data-access,util}`.

### M0 — walking skeleton

- [x] **Scaffold** Nx workspace + `web` (SSR) app — builds + prerenders ✓
- [x] **`console`** app (CSR) + module-boundary lint tags
- [x] **Tokens → code**: `hh-theme.js` → `styles` Tailwind preset (+ TS token mirror), `hh.css` → `global.css`, Inter/Poppins + Tabler (CDN), logo PNG. **Verified rendering** in the live SSR app (brand orange, gender blue/rose, fonts, icons, tooltip).
- [x] **`ui` atoms** — 18 components/directives built + verified live (Button, Badge[+gender], StatusPill, Chip, Card, Avatar, Tooltip, Skeleton, Toast, Empty/Error/Gate, Input, Toggle, Stepper, Tabs, Pagination, RangeSlider). Storybook configured + **builds** (17 stories; Button/Chip given render templates). *Refinement: wire Tailwind into the Storybook preview so stories render styled (components are already proven styled in-app).*
- [x] **`data-access`** — API config + DI tokens (`ACCESS_TOKEN`, `UNAUTHORIZED_HANDLER`, inverted so it never imports `auth`), auth + error interceptors, `apiGet()` (httpResource) + `ApiClient`, `provideDataAccess()`, `ApiError`/`Paginated` models. Typechecks clean. Typed OpenAPI SDK still gated on Q-API §0.
- [x] **`auth`** — `SessionStore` (signals: user/role/permissions/propertyId), `authGuard` + `roleGuard()` + `permissionGuard()` + `propertyScopeGuard` (8 roles), `*hhHasPermission` directive, `provideAuth()` bridge to data-access. Typechecks clean. Lead Wall *screen* → M1 (feature-auth).
- [x] **App shells** — web: `SiteNav` + `SiteFooter` + seeker `Home` (SSR-rendered, consumes `ui`). console: role-aware sidebar (host / sub-user / staff nav via `navForRole`) + topbar + `HostOverview`/`AdminHome`/`Forbidden`, guarded by `roleGuard`; dev session seed so `/host` renders. **Both verified in-browser.**
- [x] **Quality gates** — Vitest (7 projects green), ESLint with **module boundaries enforced** (10 projects green), bundle budgets (app `project.json`), Playwright smoke specs (web + console), cloud-free GitHub Actions CI (`lint test build typecheck e2e`). *Follow-ons: Husky/lint-staged, Lighthouse CI.*
- [x] **Exit** — web SSR home + guarded console `/host` **both render** (verified in-browser); `nx run-many -t lint test build typecheck` **green for all 10 projects**; Storybook builds.

### ✅ M0 complete (2026-06-12)
Walking skeleton stands: Nx workspace + `web` (SSR) + `console` (CSR), 6 shared libs (`ui` 18 components + Storybook, `styles` tokens, `data-access`, `auth` + 8-role guards, `util`, `maps`), both apps rendering and consuming the libraries, all gates green. **Open follow-ons** (tracked, non-blocking): Tailwind-in-Storybook-preview styling · Husky + Lighthouse CI · self-host fonts/Tabler · `npm audit` (11 transitive vulns) · `nx migrate` to Angular 22 when Nx adds support · the typed OpenAPI SDK (gated on Q-API). **Next: M1 — First Light** (the listing lifecycle: onboarding → moderation → search/detail → Lead Wall + subscription checkout).

### M1 — First Light (in progress, started 2026-06-12)
Built against a **stub data layer** (fixtures behind services) pending the API contract — only the SDK internals swap when it lands.
- [x] **Stub domain data** — `Listing`/`Room`/`HostSummary` models + `AMENITIES`, 6-listing fixtures, `ListingsApi` (filter/sort/paginate; `of(...)` stubs → HTTP later) in `data-access`.
- [x] **`feature-search`** — search **results (01)** live at `/search` (lazy): filter chips, price popover, sort, reactive grid, five states. (Map split-view 02 still to do.)
- [x] **9 feature libs built in parallel by sub-agents + integrated** (2026-06-12): `feature-listing` (03), `feature-auth` (Lead Wall 04), `feature-onboarding` (11), `feature-host-shell` (10/17/19), `feature-host-ops` (12/13/14/15 — utilities split reconciles exactly), `feature-host-analytics` (16, inline-SVG charts), `feature-subscription` (18, contract state machine), `feature-moderation` (20–25), `feature-admin` (26–28, permission matrix). Wired lazy/eager into `web` (`/search`,`/hostel/:slug`,`/auth`) + `console` (`/host/**`, `/admin/**`). **`nx run-many -t lint typecheck build` green for all 20 projects**; web detail + console utilities verified in-browser.
- **Integration fix-ups applied**: SSR render-mode (prerender home / server-render dynamic), 3 bare-boolean attrs → `[x]="true"`, flattened moderation's shell route.
- [x] **Shell consolidation + full pixel pass (2026-06-13)**: one `HostShell` + role-aware `StaffShell` (routed parents, sidebars pixel-matching mockups 09–28; per-area agent shells stripped to header-only); `HostOverview` (09) + web `Home` (00) rebuilt pixel-accurate; **search map split-view (02)** built (faux map + price pins); onboarding (11) moved to a full-screen route; role-switch dev seed (`?role=`); role-aware home redirect.
- [x] **ALL 25 screens (00–28) verified pixel-accurate in-browser** (web home/search/map/detail/Lead-Wall; host overview/listings/onboarding/rooms/tenants/utilities/invoices/analytics/settings/subscription/team; staff mod-queue/review/delta/listings/audit/settings + admin roles/contracts/payments). Inline-SVG charts + faux maps + day-weighted utility split all render correctly.
- [x] **Route smoke specs added** to all feature libs. **`nx run-many -t lint test build typecheck` green for all 20 projects.**
- **Hardening milestone (next)**: restore a11y + `eqeqeq` template lint to error + fix (WCAG 2.1 AA) · full First-Light e2e (needs real cross-app data) · swap stubs → typed OpenAPI SDK when the contract lands · real `@angular/google-maps` + `ng-apexcharts` (faux versions already match the static mockups) · `nx migrate` → Angular 22 when Nx supports it · remove dead `mod-shell.ts`.
- [x] **Architecture consolidation → 1 app + 1 lib (2026-06-13, user-directed)**: collapsed 20 Nx projects to **3** — `web` (single app) + `lib` (single library) + `web-e2e`. `console` merged into `web`: seeker routes SSR/prerendered, console routes (`/host/**`, `/admin/**`, `/forbidden`) lazy + `RenderMode.Client` + role-guarded; the app surfaces the right platform by auth/role. All 16 libs merged under `libs/lib/src/<area>/` keeping granular `@hostelhive/<area>` entry points (lazy chunks preserved) + a `@hostelhive/lib` barrel. Module boundaries disabled (one lib). `nx run-many -t lint test build typecheck` **green for all 3 projects**; seeker + host + admin verified rendering in-browser. Trade-off: `/admin` edge IP-allowlist (§9.2) replaced by guard + lazy-chunk + server-auth.
- [x] **Real map + functional search (2026-06-13, user-directed)**: `/search/map` faux map → **Leaflet + OpenStreetMap** (user chose free OSM over billable Google Maps — can't provision their API key). Real interactive map, price-pin markers at listing coords, auto-fit bounds, "search as I move", hover-row↔pin; SSR-safe (dynamic `import()` in `afterNextRender` + ResizeObserver `invalidateSize` for first-load tiles). **Search bar** — new nav `SearchBar` + wired home hero — selects city / budget / sharing → drives `?city&minPrice&maxPrice&sharing` query params that filter **both** list + map views; `ListingsApi` now filters city + sharing. Verified in-browser (Karachi → 2 stays, map auto-zooms in). Gate green for all 3 projects.
- [x] ~~**Map → Google Maps + Places (2026-06-13, user-directed)**~~ — **SUPERSEDED 2026-08-20**: replaced Leaflet with **full Google** — Google Maps tiles + `AdvancedMarkerElement` price-pin markers + **Places Autocomplete** location search (nav SearchBar + home hero). The billable Maps JS + Places key is pasted once into `provideGoogleMaps({ apiKey, mapId })` in `apps/web/src/app/app.config.ts` (loader + token in `@hostelhive/maps`). A picked place → `?place&lat&lng` → proximity search (`ListingQuery.near` + Haversine). Graceful no-key notice + plain-text→city fallback (verified). Type-correct, gate green (3 projects); **renders only once the user adds their key** (can't verify Google live without it).
- [x] **Search UX split (2026-06-13, user-directed)**: nav bar = Google Places location search only; gender / budget / sharing moved to a shared, URL-driven `SearchFilters` sub-header used by both search pages (shareable params, survives List⇄Map toggle). Verified filtering in-browser (Boys + Under Rs 10,000 → 1 stay). Gate green.
- [x] **Maps back to OpenStreetMap, Google stack deleted (2026-08-20)**: reversed the two Google Maps entries in this section. `lib/src/maps/lib/google-maps.ts`, `tools/generate-google-maps-env.mjs`, the `sync-maps-env` build target and `provideGoogleMaps()` are **all gone** (`59d3692`) — do not go looking for them. The map is **Leaflet + OSM tiles** (`lib/src/maps/lib/leaflet.ts`, `shared-map.ts`), and location search is **Nominatim + Photon** (`nominatim.ts`, `photon.ts`, `place-search.ts`, cached by `place-cache.ts`). No API key, no billing account, nothing to allowlist. The two struck-through entries below are kept for the decision history only.
- [x] **Host analytics screen (`16`) deleted, not finished (2026-08-26, user-directed)**: it had been unreachable for some time — routed at `/host/:hostelId/analytics` but linked from nowhere: not the sidebar, not the mobile tab bar, not `/more`. Investigating why turned up the real reason: **the overview had superseded it**. Both drew the same three charts, but `getAnalytics()` hardcoded `revenue`/`occupancy`/`ledger` to `[]` and never called the endpoints that fill them, so `16`'s charts rendered blank and its CSV export early-returned on empty revenue; the overview called `monthlyRevenue` / `occupancySummaries` / `tenantMovement` for real and grew three date-ranged detail pages (`overview/revenue|occupancy|movement`). Its ledger table never had a backing endpoint at all. Deleted: `features/host/analytics/` (545 lines), its route, `design-mockups/16-analytics.html`, and the orphaned `hostAnalytics` i18n group in all 18 locales. `charts/chart-helpers.ts` was **moved, not deleted** — it lived inside that folder but four live overview files import it, so it is now `features/host/overview/charts/`. Follow-on rename so nothing is misnamed after its page: `AnalyticsApi`→`OverviewApi` (`services/overview-api.ts`), `AnalyticsData`→`OverviewData` (`util/models/overview.ts`, trimmed to just `kpis`), `getAnalytics`→`overviewCards`. Separately, the GA4 tracking code — a different thing that only shared the word — moved to `core/google-analytics/` with `GoogleAnalyticsService` et al., `tools/generate-google-analytics-env.mjs`, and the `sync-google-analytics-env` target. **The `hh.consent.analytics` storage key and the `GA_MEASUREMENT_ID` env var were deliberately left alone**: renaming the first silently re-shows the cookie banner to everyone who already answered, and the second lives in `.env` and CI. Gate green (build + 646 tests).
- [x] ~~**Google key via `.env` + Places migrated to PlaceAutocompleteElement (2026-06-13)**~~ — **SUPERSEDED 2026-08-20**: key in git-ignored `.env` → `tools/generate-google-maps-env.mjs` injects it at build (web `sync-maps-env` dependsOn) → `provideGoogleMaps(googleMapsEnv)`. Classic `places.Autocomplete` is blocked for post-Mar-2025 Google accounts → migrated nav + home search to the new `PlaceAutocompleteElement` (new Places API; `gmp-select`→`fetchFields`→lat/lng). **Verified live with the key:** Google map + price pins render, real PK autocomplete predictions, place select → proximity search + recenter. Gate green. User must enable Places API (New) + Maps JS API, billing, and allowlist localhost/domain referrers.

### Other locked decisions
- **Two apps** confirmed — `web` (SSR) + `console`; `/admin/**` stays inside `console` (split out later only if isolation demands).
- The typed API SDK is the **only** M0 item gated on the BE contract (§0); everything else proceeds against stubs/fixtures.
- **Follow-ups**: `npm audit` flags 11 vulns (transitive, from the Nx template) → address in hardening; self-host fonts/Tabler (currently CDN) → hardening.
