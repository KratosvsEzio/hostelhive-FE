# HostelHive — Frontend Build Plan & Engineering Brief

**Prepared by:** Engineering & Delivery (PM + Principal Engineer review of **PRD v3.0**)
**Date:** 11 June 2026 · updated 12 June 2026 for PRD v3 (Features 6–8)
**Scope:** Frontend only. Backend is reported complete; all APIs available.
**Target framework:** Angular 22 (current stable as of 3 June 2026)
**Audience:** Internal stakeholders + design generation ("Claude Design") handoff
**Status:** Design phase complete — **25 screens** built in `design-mockups/` on a custom Tailwind design system; brand resolved to **orange `#F36E21`** + ink + white (extracted from the client's Figma). **Build phase started 12 June 2026 — M0 (walking skeleton) in progress on Nx + Angular 22; live status + concrete v3 engineering in `HostelHive-Implementation-Plan.md` (§11 Execution Log).**

---

## 0. Executive Summary

HostelHive is a two-sided marketplace with **distinct frontends** wearing one brand:
a **public, SEO-driven seeker site**, an **authenticated host dashboard** (with scoped **Manager/Warden**
sub-users — F8), and an **internal staff console** spanning **Moderator** review and the **Super Admin
panel** (roles, subscription contracts, payments — F6). These have different rendering needs (SSR vs SPA),
different auth/security postures, and different release urgency.

The PRD is unusually complete on *what* to build but — as expected for a "BE-is-done, FE-remaining"
brief — is **silent on the frontend's hardest dependencies**: the API contract, the auth/refresh
flow, the listing-payment + **subscription-webhook** return flows, the image-upload mechanism, and (in v3) the
**permission-flag list and Manager/Warden property-scoping** contract. These are the critical path; everything else is well-specified enough to plan against.

This document delivers: (1) a gap analysis with a prioritised open-questions register, (2) a
recommended Angular 22 architecture, (3) a phased milestone plan built around shipping the
*marketplace loop* early, and (4) a design brief ready to hand to design generation for an
Airbnb-quality result.

---

## 0.1 Decisions locked (11 June 2026)

| Decision | Choice | Consequence for this plan |
|----------|--------|---------------------------|
| Release strategy | **Marketplace loop first** | v1.0 = Seeker + Host + Moderator (M0–M3 + hardening); Operations/Billing + ~~Analytics~~ ship as **Release 1.1** (M4–~~M5~~). M5 was absorbed into the overview — Impl. Plan §11, 2026-08-26. |
| UI foundation | **Tailwind CSS + Angular CDK** custom design system | Locked; Angular Material/PrimeNG not used. Maximises Airbnb-grade visual control. |
| App topology | **Two apps**: `web` (public SSR) + `console` (host, Manager/Warden, Moderator **and** Super Admin behind role guards) | `/admin/**` (Moderator + Super Admin — incl. roles/contracts/payments, F6) is edge IP-allowlisted per §9.2; Manager/Warden are property-scoped hosts (F8). `/admin` can split into its own app later if sensitivity warrants. |
| API contract | **To be confirmed with BE team** | Assume OpenAPI 3 + generated SDK; a 1–2 week contract-capture spike is held in reserve. |

**Resolved since:** palette = **orange `#F36E21` + ink `#1F1F1F` + white/`#F5F5F5`** (extracted from the client's Figma, not the PRD's navy/amber); design phase complete (25 screens); PRD v3 added Features 6–8. **Still open:** API-contract confirmation (Q-API).

---

## PART 1 — GAP ANALYSIS & CRITICAL QUESTIONS

### 1.1 Blocking contradictions inside the PRD (must be resolved before/at kickoff)

| # | Contradiction | Where | Impact | Proposed resolution |
|---|---------------|-------|--------|---------------------|
| C1 | **Google OAuth / Social login** is described as live in the Lead Wall flow ("Social login bypasses email verification") **but listed as out-of-scope / future roadmap (Medium)**. | §4.4 vs §13 | Auth UI scope, Lead Wall flow, registration screens | Treat OAuth as **out of v1**; email-verification Lead Wall only. Design the auth modal so an OAuth button can drop in later without rework. |
| C2 | **Seeker reviews & ratings** appear as a listing-detail section, a `reviews` DB table, and a "Most Reviewed" sort option — **but reviews are explicitly out-of-scope / future (High)**. | §4.2, §4.3, §10.2.2, §11.1 vs §13 | Listing detail layout, sort control, search results | For v1: **hide the reviews section and the "Most Reviewed" sort**; keep DOM/layout slots reserved. Host card "response rate" (C3) is affected too. |
| C3 | **Host "response rate"** is shown on the host profile card, but there is **no messaging/inquiry system in v1** (in-app messaging is future). | §4.3.1 vs §13 | Host card content | Drop "response rate" for v1, or replace with a static trust signal (e.g., "Verified host", member-since). |
| C4 | **Online rent payment** is future, yet invoices carry "Payment instructions / account details" and the dashboard tracks "Collected vs Pending". | §7.4.1, §8.2 vs §13 | Billing & analytics semantics | Confirmed consistent: v1 tracks payment *status* set manually/by BE; it does **not** process tenant payments in-app. Clarify who marks an invoice "paid" (host action vs BE reconciliation). |
| C5 | Lead Wall says **JWT session minted on email verify**, but the email-verify click happens in a **fresh browser tab/deep link**. Returning the user to the originating listing *with phone visible* needs the intent + token to survive that round-trip. | §4.4 | Auth + routing state | Persist a `returnUrl`/intent token through the verification link; on verify, establish session and redirect. Needs a defined BE redirect contract (see Q-API). |

### 1.2 Foundational unknowns — the real frontend critical path

These are **not** in the PRD and block the data layer. Listed by risk.

| ID | Question | Why it's critical | Default if unanswered |
|----|----------|-------------------|-----------------------|
| **Q-API** | Is there an **OpenAPI/Swagger spec** (or at least a Postman collection) for the completed BE? Base URLs per env, error envelope shape, pagination style (cursor vs offset)? | The entire typed data layer, client generation, and ~30% of effort estimation hinge on this. A FE-only build with no contract is a reverse-engineering project. | Pending BE-team confirmation. Assume OpenAPI 3 and generate a typed SDK; a 1–2 week contract-capture spike is held in reserve if no spec exists. |
| **Q-AUTH** | **Token lifecycle from the client**: access + refresh tokens? Where stored (httpOnly cookie strongly preferred vs localStorage)? Silent refresh on 401, or forced re-login at expiry (24h seeker / 8h moderator)? | Drives the HTTP interceptor, route guards, session UX, and security posture. | Access token in memory + refresh token in httpOnly secure cookie; interceptor does 401→refresh→retry. |
| **Q-PAY** | **Payment integration shape**: hosted redirect (Stripe Checkout / JazzCash redirect) vs embedded (Stripe Elements)? What's the **return URL contract** and how does the FE learn success (poll status vs redirect with signed result)? Is the listing fee fixed and where displayed? | Feature 2 cannot complete without it; webhook confirms server-side but the *client* needs a deterministic "what now" after redirect. | Hosted redirect + return URL → FE polls `GET /listings/{id}/payment-status` until `active/in-review`. |
| **Q-UPLOAD** | **Image upload mechanism**: presigned-URL direct-to-S3/R2 vs multipart-through-API? Is there server-side transcode/thumbnail generation, and how is the async malware-scan ("pending") state surfaced to the client? | Determines the upload component, progress UX, retry logic, and how "pending moderation/scan" states render. | Presigned direct-to-storage + client-side compression; poll/receive image status. |
| **Q-MAPS** | One **Google Maps API key per environment**, referrer-restricted? Are **Places Autocomplete + Geocoding** called **directly from the browser** (same key) or **proxied through BE** (quota/billing control)? | Affects map module design, cost control, and the §9.2 "never expose unrestricted keys" requirement. | Browser-side Maps JS SDK with referrer-restricted key; Places/Geocoding proxied through BE if quota control is required. |
| **Q-RT** | The moderator "new media pending" **badge counter** — polling or push (SSE/WebSocket)? Acceptable staleness? | Determines whether we need real-time infra or simple polling. | Poll every 30–60s; no realtime infra in v1. |
| **Q-MULTIROLE** | Can one account be **both a Seeker and a Host**? One identity with multiple roles, or separate accounts? | Shapes auth model, routing, and the account/profile area across all apps. | One identity, role claims; UI surfaces the role(s) the user holds. |

### 1.3 Per-feature gaps & decisions

**Feature 1 — Search & Discovery**
- **Map-based search view (Airbnb's signature split map+list)** is *not* in the PRD — only a card grid + a map on the *detail* page. This is the single biggest UX call for an "Airbnb-like" result. **Recommend** adding a toggleable map/list split view to search; flag as scope.
- Price-range slider bounds are "derived from lowest/highest active room price" — needs an endpoint returning min/max for the current filter context (else bounds are wrong as filters change).
- Pagination is specified as a **"load-more" button (not infinite scroll)** for SEO — confirm offset vs cursor and page size.
- Lead Wall return-to-listing intent must survive email verification (see C5/Q-AUTH).

**Feature 2 — Host Onboarding**
- **Two sources of draft truth**: localStorage auto-save every 30s (§10.2.3) *and* a server-side `status='onboarding'` record (§5.2) *and* "single in-progress" guard. Reconciliation rule needed (server is source of truth; localStorage is a crash-recovery cache only).
- Wizard step 4 is **Room Configuration**, and `min_price/max_price` are derived from rooms — so rooms are created *during* onboarding *and* managed later in Feature 4. Confirm the room model is continuous across both.
- Rich-text description (bold/lists/links) → needs an editor + **HTML sanitisation**; decide stored format (sanitised HTML vs markdown).
- "Single in-progress" must still allow a multi-property host to start a *new* onboarding once a prior listing is published.

**Feature 3 — Moderator Console**
- Inline rich-text editing reuses the same editor/sanitisation decision.
- **Delta media pipeline** (live-listing image uploads) needs its own secondary queue + badge (Q-RT).
- Audit-log sidebar needs a `moderation_logs` read endpoint; confirm pagination/realtime.
- §9.2 **IP allowlisting** for the moderator panel is infra, but the FE must render a graceful "access blocked" state.

**Feature 4 — Operations & Billing**
- Mostly BE (cron, PDF, WhatsApp). FE = CRUD for rooms/tenants + the **utility-split override UI** (show computed pro-rata per tenant, allow manual override before issuing) + invoice list/PDF view.
- Does the FE render invoices or only link to BE-generated PDFs? **Assume** list + download/view BE PDF.
- Pro-rata previews: does the FE compute previews or only display BE results? **Assume** display BE-computed; FE may show a read-only preview.
- Date/timezone handling pinned to **UTC+5** (cron at server midnight) — be explicit in all date logic.

**Feature 5 — Analytics Dashboard**

> **Shipped differently (2026-08-26).** There is no analytics screen: the host **overview**
> carries the KPI cards and the charts, with `overview/revenue|occupancy|movement` detail
> pages behind them. The separate `16-analytics` page was built, superseded, and deleted —
> see `HostelHive-Implementation-Plan.md` §11. The first question below was answered
> **N calls, not one**: `overview_cards` for the KPI row and a per-series endpoint for each
> chart, so a slow or failed chart costs only its own card. The multi-property selector
> became a `:hostelId` path segment rather than a query param, and exports were not built.

- KPI cards: confirm a **single aggregated endpoint** vs N calls (dashboard P95 < 2s).
- Multi-property selector persists in URL (`?property=all|{id}`) — routing/state pattern.
- Exports: PDF is "branded" → **BE-generated**; CSV can be **client-side**. Confirm per export.
- Chart data series (rent vs utility, occupancy timeline) — confirm shapes/endpoints.

### 1.4 Cross-cutting gaps (process & non-functional)

- **No timeline, team size, or deadline** given → milestones below use effort bands + a sample team; recalibrate once known.
- **No existing design assets / Figma** → this plan feeds the design-generation step (Part 4).
- **i18n / Urdu / RTL** not addressed for the Pakistan market → assume English-only v1, architected for later localisation; PKR currency formatting throughout.
- **Hosting & CI/CD for the FE** unspecified (public SSR app needs a Node/edge host; dashboards are static SPA on CDN).
- **Product analytics / error tracking** (GA4/Amplitude + Sentry) not mentioned → recommend including.
- **Testing strategy, content/empty/error states, and accessibility ownership** (WCAG 2.1 AA; moderators write alt text per §9.4) need to be first-class, not afterthoughts.

---

## PART 2 — RECOMMENDED FRONTEND ARCHITECTURE (Angular 22)

### 2.1 Stack

| Concern | Recommendation | Rationale |
|--------|----------------|-----------|
| Framework | **Angular 22**, standalone components, **zoneless** change detection, **Signals** as primary reactivity | Current stable; zoneless + signals = best performance and the modern idiom |
| Monorepo | **Nx workspace** | Three apps + shared libs, enforced module boundaries, affected build/test in CI, generators |
| Rendering | **SSR + hydration** for the public seeker app; **prerender** city/SEO landing pages; **CSR/SPA** for host + moderator | SEO + sub-1.5s search (§9.1) demand SSR; authed dashboards don't need it |
| Styling / design system | **Tailwind CSS + Angular CDK** (behaviour primitives) — a custom, headless-styled component library | Airbnb-level visual control while keeping a11y; **avoid Angular Material as the visual base** (fights bespoke design) |
| Forms | **Signal Forms** (stable in v22) for the onboarding wizard, billing, utility-split; typed Reactive Forms where needed | Native, signal-driven, ideal for the long multi-step wizard |
| Server state / data | **`httpResource`/`rxResource`** (stable in v22) for read-heavy signal-driven fetching; thin typed API SDK **generated from the OpenAPI spec** | Native caching/loading/error as signals; generated client kills drift and a class of bugs |
| Cross-cutting state | **NgRx SignalStore** only where genuinely shared (auth/session, dashboard filters); plain signal services elsewhere | Lightweight, signal-first; avoid classic Store/Effects boilerplate |
| Maps | **`@angular/google-maps`** wrapper + a `maps` lib (Places Autocomplete, Geocoding, draggable pin, reverse-geocode) | Official wrapper; lazy-loaded SDK |
| Charts | **ApexCharts (`ng-apexcharts`)** or ECharts | Modern, responsive, good-looking analytics |
| Rich text | **TipTap** (or Quill) + **DOMPurify** | Description editing with safe sanitisation |
| Uploads | Presigned direct-to-storage + **`browser-image-compression`**, batch UI with per-file progress (signals) | Meets 3–20 images / 10MB / concurrent (§5.5) without proxying large files through the API |
| i18n | **Transloco** (runtime) or Angular i18n; default English | Structured for Urdu later; PKR/number pipes |
| Auth | JWT access (memory) + refresh (httpOnly cookie); functional `CanActivateFn` guards per role; HTTP interceptor for attach + 401-refresh-retry | Per §9.2; pending Q-AUTH |
| Testing | **Vitest** (unit) + **Playwright** (e2e) + **Storybook** (component QA + visual regression via Chromatic) | Storybook doubles as the **design-handoff surface** |
| Quality gates | ESLint + Prettier, Husky/lint-staged, Nx affected, bundle budgets, Lighthouse CI | Enforce §9.1 perf budgets in CI |
| Observability | **Sentry** (FE errors) + product analytics (GA4/Amplitude) | Operability from day one |

### 2.2 Repo topology (Nx)

**Apps** *(locked: two apps)*
- `web` — public seeker site (SSR): search, listing detail, Lead Wall, seeker account, SEO landing pages.
- `console` — single authenticated app for **both host and moderator**, separated by **role-based route guards** and lazy-loaded feature areas. Moderator routes are additionally protected at the **edge/network layer (IP allowlist)** per §9.2, since they no longer have a separate deployment.
  *Trade-off accepted: simpler operations at the cost of weaker physical isolation between host and moderator surfaces; enforced instead by guards + edge rules + separate route bundles.*

**Libraries**
- `ui` — design-system components (Tailwind + CDK).
- `data-access` — generated API SDK, DTOs, `httpResource` wrappers, interceptors.
- `auth` — session SignalStore, guards, interceptors, Lead Wall.
- `maps` — Google Maps pin/autocomplete/geocode.
- `feature-*` — `feature-search`, `feature-listing`, `feature-onboarding`, `feature-moderation`, `feature-operations`, ~~`feature-analytics`~~. *(Shipped as folders under `apps/web/src/app/features/`, not Nx libs — Impl. Plan §11, 2026-06-13. There is no analytics feature: it lives in the overview — §11, 2026-08-26.)*
- `util` — pipes (PKR, dates @ UTC+5), validators, config, error handling.

### 2.3 Cross-cutting standards
- **Every screen ships five states**: default, loading (skeletons), empty, error, and permission-gated. This is a definition-of-done item, not polish.
- **Performance budgets enforced in CI** to hit §9.1 (search < 1.5s P95, detail+map < 2.5s, dashboard < 2s): route-level code-splitting, `@defer` for below-the-fold (map, carousel, charts), image lazy-loading + responsive `srcset`, lazy Maps/charts SDKs.
- **Accessibility WCAG 2.1 AA** baked into the `ui` lib (focus management, keyboard nav, contrast, text-plus-colour status, map text fallback per §9.4).
- **Security**: strict CSP, sanitised rich text, referrer-restricted map keys, no tokens in localStorage if avoidable, HMAC-verified flows are BE-side but FE must handle their outcomes.

---

## PART 3 — BUILD PLAN & MILESTONES

### 3.1 Phasing strategy: ship the *marketplace loop* first

Rather than build feature-by-feature in PRD order, we sequence to get **one listing through the
entire lifecycle early** — Host creates → Moderator approves → Seeker discovers → Lead Wall converts.
This proves every hard integration (maps, uploads, payments, auth, moderation) on a thin slice,
de-risks the program, and gives stakeholders a working demo by the end of M1.

**Per the locked release decision, the program splits into two releases:** **Release 1.0 — Marketplace Loop** (M0 → M1 → M2 → M3 → hardening → launch) makes the platform live and revenue-generating; **Release 1.1 — Operate & Analyze** (M4 → M5 → hardening) adds the post-approval operational tools. The milestone table keeps M0–M6 numbering; the gantt below shows the two launch points.

**PRD v3 update (Features 6–8) — detailed re-slotted milestones are in `HostelHive-Implementation-Plan.md §5`.** In brief: **subscription contracts (F7)** join Release 1.0 (a host subscribes to publish — checkout+webhook proved in M1, the billing page + expiry-gating in a focused M3.5); the **Super Admin panel (F6: roles, contracts, payments)** extends M3 alongside moderation; **Manager/Warden sub-users (F8)** join M4 ops. Net timeline ≈ **26–29 weeks** (up from ~20–22).

### 3.2 Milestones

| Milestone | Outcome (exit criteria) | Key epics | Effort band |
|-----------|-------------------------|-----------|-------------|
| **M0 — Foundation / Walking Skeleton** | Nx workspace, 2 app shells, CI/CD, design tokens + Storybook + core `ui` kit, auth shell + interceptors + guards, OpenAPI-generated SDK, env config, Maps key wired, global loading/error/empty patterns. One "hello" route renders SSR + SPA in CI. | Tooling, design-system v1, auth scaffold, data layer | **S–M** |
| **M1 — "First Light": the listing lifecycle (thin vertical slice)** | A host can create a minimal listing (with map pin + image upload + sandbox payment), a moderator can approve it, and a seeker can find it and pass the Lead Wall. Proves maps, uploads, payments, email-verify, moderation end-to-end. | Onboarding core, moderation core, search+detail core, Lead Wall | **L** |
| **M2 — Discovery depth (Feature 1 full)** | Full filter set, sort, rich listing detail, interactive detail map + info window, SSR/SEO, optional **map+list split search**, city landing pages. | Search engine, listing detail, SEO | **M–L** |
| **M3 — Moderation depth (Feature 3 full)** | Full review queue (paginated, sortable, searchable), inline rich-text editing, per-image approve/reject/replace/set-primary, map verification, decision actions + notifications, **delta media pipeline** queue + badge, audit log. | Review queue, media pipeline | **M–L** |
| **M4 — Operations & billing UI (Feature 4)** | Room CRUD, tenant check-in/out, utility entry + **pro-rata split override UI**, invoice list + PDF view. (Cron/PDF/WhatsApp are BE.) | Rooms, tenants, utilities, invoices | **L** |
| ~~**M5 — Analytics dashboard (Feature 5)**~~ **— absorbed into the overview, 2026-08-26** | KPI cards (deep-linking), revenue + occupancy charts, tenant ledger, **multi-property URL-persisted filter**, ~~PDF/CSV exports~~ (not built). Delivered on `/host/:hostelId/overview` + three detail pages, not as its own screen — Impl. Plan §11. | KPIs, charts, ledger | **M** |
| **M6 — Hardening & launch** | Hit all §9 NFRs: perf budgets green, WCAG 2.1 AA audit passed, security review (CSP/XSS/keys), cross-browser/device QA, e2e coverage, Sentry+analytics live, empty/error polish, UAT, launch runbook. | Perf, a11y, security, QA | **M–L** |

### 3.3 Indicative timeline & team (assumption — recalibrate after Q-API answer)

Sample **3–4 senior Angular engineers + 1 product designer + 1 QA**. Two-release cadence:

```
RELEASE 1.0 — Marketplace Loop (≈12 weeks)
M0  ███                Wk 1–3    Foundation / design system
M1     ██████          Wk 3–9    First Light (host→moderate→seek→Lead Wall)
M2        ████         Wk 8–11   Discovery depth        (overlaps M1)
M3          ███        Wk 10–12  Moderation depth
H1            ██       Wk 12–13  Hardening  ★ LAUNCH v1.0

RELEASE 1.1 — Operate & Analyze (≈8 weeks)
M4              █████  Wk 13–18  Operations & billing UI
M5                  ███ Wk 18–21 Analytics dashboard
H2                   ██ Wk 21–22 Hardening  ★ LAUNCH v1.1
```

If the BE has **no OpenAPI contract**, add a **1–2 week contract-capture spike** before M1.

### 3.4 Top risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| No/partial API contract (Q-API) | Med–High | Capture spike in M0; generate SDK; lock error/pagination/auth contracts first |
| Payment return-flow ambiguity (Q-PAY) | Med | Nail return URL + status-poll contract in M1 against sandbox before building the wizard tail |
| Upload + async scan/moderation states (Q-UPLOAD) | Med | Prototype presigned upload + status polling in M1 |
| Map cost/quota & key exposure (Q-MAPS) | Med | Decide proxy-vs-direct early; referrer-restrict keys; cache geocode results |
| Scope creep from "future" items leaking into v1 (reviews, OAuth, messaging) | Med | Enforce C1–C3 resolutions; reserve layout slots, don't build |
| "Airbnb-quality" expectation vs PRD's navy/amber tokens | Med | Resolve the palette/system tension up front in design brief (Part 4) |

---

## PART 4 — DESIGN BRIEF FOR "CLAUDE DESIGN" (Airbnb-quality)

> Hand this section to the design-generation step. It defines the aesthetic, the screen inventory,
> the required states, and the component system to produce.

### 4.1 Aesthetic direction
Airbnb's DNA, applied to HostelHive: **generous whitespace, photography-forward cards with large
rounded corners, soft shadows, crisp friendly typography, gentle micro-interactions, sticky filter
bars, map+list split discovery, and prominent trust signals** (verified badges, host avatar,
member-since). Mobile-first; big tap targets; calm, confident, uncluttered.

### 4.2 Palette — RESOLVED
Brand was set from the client's Figma (not the PRD's navy/amber): **brand orange `#F36E21`** (primary/accent) +
**ink `#1F1F1F`** (text) + **white / `#F5F5F5`** surfaces, with pastel card tints and **gender tags** in
blue `#2B6CB0` (Boys) / rose `#BE3A75` (Girls) / orange (Co-living). Type **Poppins (display) + Inter (body)**.
Status: success `#27AE60`, warning `#F39C12`, error `#E74C3C`. All tokens live in `design-mockups/assets/hh-theme.js`.

### 4.3 Screen inventory to design

> **Built (PRD v3): 25 screens in `design-mockups/`** — the v2 list below plus the v3 additions: Host **Subscription & Billing** + **Team & Staff** (Managers/Wardens), and the **Super Admin** console (**Roles & Permissions**, **Contracts**, **Payments**). The list below is the original v2 target.

**Public / Seeker (SSR)**
1. Home / city landing (hero search, featured listings, trust band)
2. Search results — **list view** (filter sidebar/drawer, card grid, load-more)
3. Search results — **map+list split view** (clustered pins ↔ cards) *(if approved)*
4. Listing detail (hero carousel, amenities grid, room cards, **interactive map + info window**, host card, sticky "Show Phone" CTA bar on mobile)
5. **Lead Wall modal** (Login / Register tabs, validation, "verify your email" state, success → phone revealed)
6. Seeker account (profile, saved/recent) — light

**Host / Console**
7. Host home / "my listings" (status chips: onboarding, in-review, published, paused)
8. **Onboarding wizard** — 5 steps with progress stepper: (1) Basic info (2) **Location & map pin** (3) **Media upload** (drag-drop, label dropdown, set-primary, progress) (4) Room configuration (5) Payment & review
9. Payment redirect + **return/confirmation** screen (pending, success, failed/retry)
10. Rooms management (room cards: number, floor, capacity, occupancy, availability)
11. Tenants (check-in form, tenant list, check-out)
12. Utilities — **bill entry + pro-rata split table with manual override**
13. Invoices list + **invoice PDF view**
14. ~~**Analytics dashboard**~~ — KPI cards, revenue chart, occupancy timeline, tenant ledger, multi-property selector, ~~exports~~. **Shipped inside the host home (item 7), not as a screen of its own — 2026-08-26, Impl. Plan §11.**

**Moderator / Admin**
15. **Review queue** (table: thumbnail, name, city, host, submitted, days-in-queue; sort/search)
16. Listing review detail — inline edit, image grid actions (approve/reject/replace/set-primary), map verification, decision bar (Approve & Publish / Request Changes / Reject), audit-log sidebar
17. **Delta media queue** (pending images for live listings) + badge

### 4.4 Required states (every screen)
Default · Loading (skeletons) · Empty · Error · No-results · Permission-gated/blocked.

### 4.5 Design-system components to produce
Buttons (primary/secondary/ghost/destructive), inputs/selects/checkboxes/radios, **range slider**,
chips/tags, **cards** (listing, room, KPI), **modal** (Lead Wall), **carousel**, **map container**,
**multi-step stepper/wizard**, **data table**, **charts**, toasts, badges (gender/status/verified),
avatars, **file-upload dropzone**, **rich-text toolbar**, pagination/load-more, sticky filter bar,
bottom CTA bar (mobile).

### 4.6 Responsive & accessibility
Breakpoints **375 / 768 / 1280** (max content 1280). Map min-height 220px mobile / 380px detail /
420px onboarding. WCAG 2.1 AA: AA contrast, visible focus, keyboard nav, **never colour-only**
status, alt text on imagery, **text address fallback** for maps.

### 4.7 Handoff format
Prefer **Figma** (component library + the 25 screens × key states) or high-fidelity mockups, mirrored
into **Storybook** as the engineering source of truth. Build the design-system primitives first, then
compose screens from them. *(Status: HTML mockups are the source of truth; a Figma variable + component
library was partially started in the client's file — see implementation notes.)*

---

## Appendix A — Working assumptions (until answered)
- BE exposes an OpenAPI 3 contract; typed SDK generated from it.
- Auth: access token in memory + refresh in httpOnly cookie; interceptor handles refresh.
- Payments: hosted redirect + FE status-poll on return.
- Uploads: presigned direct-to-storage + client compression; async scan/moderation status polled.
- Maps: referrer-restricted key per env; Places/Geocoding proxied through BE if quota control needed.
- OAuth, reviews/ratings, in-app messaging, online rent payment = **out of v1** (layout slots reserved).
- English-only v1, PKR, dates in UTC+5; architected for later i18n.
- One identity may hold multiple roles (seeker/host) pending confirmation.
