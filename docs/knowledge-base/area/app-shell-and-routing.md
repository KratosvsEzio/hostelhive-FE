# App shell and routing

The root `App` component, the providers and app initializers in `app.config.ts`, the route table,
and the chrome every page sits inside: the site header and footer, the two console shells, the
mobile bottom tab bars, and the toast host. Also how the five areas (public seeker, seeker account,
host console, admin, moderator) are split and guarded at the route level. Auth itself is covered in
[auth-and-session](./auth-and-session.md) and the language machinery in [i18n](./i18n.md).

## Where it lives

- `apps/web/src/app/app.ts`, `app.html`: the root. Decides from the URL whether to show the header,
  footer, seeker tab bar, consent banner and tab-bar clearance. Also holds the skip link, the startup
  veil and the temporary dev-setup gate.
- `apps/web/src/app/app.config.ts`: every provider and `provideAppInitializer` (scroll reset, API base
  URL, i18n, geo, Google auth, Capacitor, session restore, GA, dev `?role=` seed).
- `apps/web/src/app/app.routes.ts`: `LOCALISED_ROUTES`, mounted twice by `appRoutes`.
- `apps/web/src/app/route-reuse-strategy.ts`: `AppRouteReuseStrategy`.
- `apps/web/src/app/core/startup-gate.ts`: `StartupGate`, the counter behind the startup veil.
- `apps/web/src/app/core/scroll-reset.ts`: `startScrollReset`, scroll-to-top on a path change.
- `apps/web/src/app/core/i18n/locale-prefix-matcher.ts`, `apps/web/src/app/core/i18n/keep-locale.ts`, `apps/web/src/app/core/i18n/locales.ts`: locale-prefixed
  routing (`routePath`, `withLocale`, `hasLocalePrefix`).
- `apps/web/src/app/layout/area.ts`: `areaOf(url)` and `isConsoleArea`.
- `apps/web/src/app/layout/components/`: `site-header`, `site-footer`, `account-menu`,
  `notification-bell`, `search-bar`, `toast-host`, `console-drawer`, `apps/web/src/app/layout/components/mobile-tab-bar/` (seeker, host,
  staff), `subscription-gate`, `subscription-loading`.
- `apps/web/src/app/layout/host-shell/`: `HostLayout` (`apps/web/src/app/layout/host-shell/host-shell.ts`), `hostNav` (`apps/web/src/app/layout/host-shell/host-nav.ts`),
  `hostPagePath` and `opensWithoutSubscription` (`apps/web/src/app/layout/host-shell/host-route.ts`).
- `apps/web/src/app/layout/staff-shell/staff-shell.ts`: `StaffLayout`, shared by `/admin` and `/moderator`.
- `apps/web/src/app/layout/dashboard-layout/`: `DashboardLayout`, the per-page chrome inside a console
  (title, actions, back link, breadcrumbs, scroll area).

## How it works

**Two mounts of one tree.** `appRoutes` mounts `LOCALISED_ROUTES` under `:locale`, guarded by
`localePrefixMatcher` (first segment must be in `LOCALE_CODES`), and again bare under a pathless parent
carrying `keepLocale`. The bare tree only redirects: `keepLocale` sends any unprefixed URL to its
prefixed twin, using the active language mid-session or the stored preference (else `en`) on arrival.
English lives at `/en/...` like every other language. See the decision below.

**Area split** (`app.routes.ts`): public pages have no guard; `/account` and `/notifications` use
`authGuard`; `/host/listings/new` (the onboarding wizard) and its `/payment` step use only `authGuard`, so
a seeker can become a host; `/host` uses `roleGuard(...HOST_ROLES)`; `/admin` and `/moderator` both use
`roleGuard(...STAFF_ROLES)`. Finer checks live in the feature route files: `permissionGuard(...)` per
page, plus `knownHostelGate`, `bookingsGate` and `monthlyOnlyGate` in
`apps/web/src/app/features/host/host.routes.ts`. Both guards in `apps/web/src/app/core/auth/guards.ts`
return `true` on the server; the client re-runs them after the session is restored.

**Chrome.** `App` renders one `SiteHeader` for every route except the onboarding wizard and
`/mess/confirm`. Footer and `SeekerTabBar` show only in the seeker area; which one depends on
`MobileApp.isMobile` (see [mobile-app](./mobile-app.md)). The consoles bring their own shell as the
parent component of their child routes: `HostLayout` loads the hostel list, syncs the `:hostelId`
param into `HostPropertyStore` and runs the subscription gate (bouncing to
`/host/:id/subscription` unless `opensWithoutSubscription`); `StaffLayout` filters its nav by
permission. Both size their sidebar from `ConsoleDrawer` (a 4rem icon rail by default, 16rem expanded,
remembered in localStorage) and swap to `HostTabBar` / `StaffTabBar` under 768px. `SiteHeader` insets
itself by the same width.

**Startup.** `AuthService.restoreSession` and `GeoPreference` each call `StartupGate.hold()`; the
veil in `app.html` stays up until both release, capped at 6s. This stops a language redirect from
moving the page under a reader.

**Route reuse.** `AppRouteReuseStrategy` reuses the component when only a route-driven drawer opens
on `Tenants`, `Rooms` or `Invoices`, so the list is not torn down and refetched.

## Reuse, don't rebuild

- `areaOf` / `isConsoleArea` (`layout/area.ts`) to decide which area a URL is in. Never write
  `startsWith('/host')`: it matches `/hostel/:id`.
- `routePath` (`core/i18n/locales.ts`) before comparing any URL against a route path; `hostPagePath`
  (`layout/host-shell/host-route.ts`) for the page below `/host/:hostelId`.
- `hostNav` (`layout/host-shell/host-nav.ts`) for host destinations. The sidebar and the mobile More page
  both read it, so a new page needs one edit.
- `DashboardLayout` for every console page's title bar and scroll area.
- `NotificationService.show` / `muteErrors` (`core/notification.service.ts`) for toasts; `ToastHost`
  is already mounted at the root.
- `StartupGate.hold()` only for work that runs at startup and can change the page.

## Traps

- `App.inSeekerArea` (`app.ts`) is a second, hand-written area check that does not use `areaOf`, and the
  two lists differ (`app.ts` also excludes `/reset_password`, `/forbidden`, `/mess/confirm`). A new
  chrome-free route has to be added to `app.ts` as well as to `layout/area.ts` if it matters there.
- Order in `app.routes.ts` matters: `host/listings/new/payment` and `host/listings/new` must stay before
  `host`, and the `:locale` mount before the bare one.
- `{ path: '**', redirectTo: '' }` sends unknown URLs to the home page; there is no 404 page.
- `app.config.ts` still has the DEV-ONLY `?role=` seed and the tester base-URL override
  (`core/dev-api-base-url.ts`, `<hh-dev-setup-gate />` in `app.html`). Both are marked "remove before
  go-live". With `?role=super-admin` on any URL, the client-side `roleGuard` lets anyone into the
  console chrome; only the API's refusals protect the data.
- Stale comments: `layout/host-shell/host-shell.ts` ("slide-in drawer on mobile web") and
  `core/mobile-app.ts` ("overlay-drawer sidebar" at 768-1023px) describe a drawer that no longer
  exists. `ConsoleDrawer` (`layout/components/console-drawer/console-drawer.ts`) says the sidebar
  only narrows to a rail now.
- `apps/web/src/app/core/scroll-reset.ts` resets on a path change only. A query-param navigation (search filters) keeps its
  scroll position, and so do Back and Forward.

## Decisions

- [Every URL carries a language prefix, English included](../decisions/i18n/every-locale-prefixed-in-url.md) (recorded under i18n)
- [Scroll to top on a path change, not with `withInMemoryScrolling`](../decisions/app-shell-and-routing/scroll-reset-on-path-change.md)

## See also

- [auth-and-session](./auth-and-session.md), [i18n](./i18n.md), [ssr-seo-and-prerender](./ssr-seo-and-prerender.md),
  [mobile-app](./mobile-app.md), [host-console](./host-console.md),
  [host-billing-and-subscription](./host-billing-and-subscription.md),
  [admin-and-moderation](./admin-and-moderation.md), [seeker-account](./seeker-account.md)
- `docs/HostelHive-Frontend-Build-Plan.md` (part 2, architecture), `docs/RISKS.md` (R13: host tab bar over
  drawer actions)
