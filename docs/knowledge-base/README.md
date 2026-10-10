# HostelHive frontend knowledge base

A map of the HostelHive web app (`apps/web`, the `@hostelhive/ui` and `@hostelhive/maps` libraries in
`lib/`): what lives where, how it works, and the decisions that are not recoverable from the code.
Read the area you are about to touch before reading its source; an area file is a few hundred words
and replaces an exploratory read of dozens of files.

```
docs/knowledge-base/
  README.md                       this map
  area/<area>.md                  what lives where and what it does
  decisions/<area>/<decision>.md  why it is that way, one decision per file
```

## How to read it

- **Cite-the-file rule.** Every claim names the file that shows it, as a repo-relative path, so it can
  be checked in one jump. If the code says otherwise, the code wins and the entry is a finding to fix.
- **What is, not what was intended.** Where code and comments or plans disagree, the entry says so.
- **Pending markers.** `> **Pending — not on main**` in an area file, or `**Status:** Pending — …` in a
  decision, means the thing described lives on an unmerged branch (named in the marker) and does not
  exist on `main`. Removing the marker is part of merging that branch.
- **A decision is settled.** Don't re-derive it; if new work conflicts with one, raise that before
  building, and update the decision when it changes.
- **Link, don't restate.** Plans, deploy notes and the API contract already live in `docs/`; entries
  link to them.

## Areas

### Platform
- [App shell and routing](area/app-shell-and-routing.md): the root App, providers and startup, the
  route tree mounted twice (with and without a language prefix), area guards, and the header, footer,
  console shells and tab bars.
- [SSR, SEO and prerender](area/ssr-seo-and-prerender.md): the Express SSR server, which routes
  render where, the `Seo` head service, social images, the runtime sitemap, and SSR-safety patterns.
- [Mobile app](area/mobile-app.md): the Capacitor wrapper around the browser build, the `isMobile`
  switch, push registration, and the Android project.

### Data
- [Auth and session](area/auth-and-session.md): the session store, the 30-day token cookie, session
  restore, role and permission guards, sign-in screens, Google sign-in, and why SSR never has a session.
- [API and data](area/api-and-data.md): the API client, interceptors, the normalised error and global
  toast, backend response conventions, a map of every service and fixture, and the generated API URL.
- [Dates, money and time zones](area/dates-money-and-time-zones.md): API timestamps in their own
  offset, plain-day writes, whole-day range filters, hostel time zones, the `money` pipe, and how
  the visitor's country sets currency and language.

### Seekers
- [Landing page](area/landing-page.md): the "Above the clouds" home page.
- [Search and discovery](area/search-and-discovery.md): the header search bar, `/search` (state in
  the URL), filters, listing cards, the `/hostels/:place` landing pages and sitemap, and the public
  hostels filter contract as the code sends it.
- [Listing and booking](area/listing-and-booking.md): the `/hostel/:slug` page, the sign-in gate
  before contact details, the nightly-only booking flow, and `/mess/confirm`.
- [Seeker account](area/seeker-account.md): `/account/*` (bookings, change and cancel, favourites,
  settings, password) and `/notifications`.
- [Public content](area/public-content.md): About, Blog, Careers, Contact, FAQs, Credits, legal pages,
  the become-a-host wizard, and the image-credit pipeline.

### Hosts and staff
- [Host console](area/host-console.md): the host workspace at `/host/:hostelId`, shell and nav,
  multi-property switching, per-page permissions, host data services, hostel time zones.
- [Host billing and subscription](area/host-billing-and-subscription.md): the legacy contract and
  product model on main, the shell paywall and inline paywall card, and the Trello #93 rewrite (plan
  only, pending).
- [Admin and moderation](area/admin-and-moderation.md): the staff shell, the moderator review and
  media queues, and the admin roles matrix and read-only contracts, payments and listings, with what is
  live and what is still fixture data.

### Foundations
- [UI library](area/ui-library.md): the `@hostelhive/ui` components, Tailwind brand tokens, global CSS,
  logo, fonts, the rich-text editor, and the subsetted Tabler icon font.
- [Mascot and boot splash](area/mascot-and-boot-splash.md): the Hive Bee (`hh-mascot`) and the static
  boot splash.
- [Maps](area/maps.md): `@hostelhive/maps` (Leaflet, CARTO tiles, place search, location picker),
  the shipped geodata and its build scripts, where maps are used, price-pin markers.
- [i18n](area/i18n.md): Transloco across 18 locales, URL-prefixed languages, the locale store and link
  rewriting, country-based language and currency guesses, RTL, key style, the i18n check scripts.
- [Tooling](area/tooling.md): the Nx projects and targets, budgets, env generation, Vitest, ESLint,
  CI, every `tools/` script, the local dev servers.

## Other docs

- [Frontend build plan](../HostelHive-Frontend-Build-Plan.md) and
  [implementation plan](../HostelHive-Implementation-Plan.md): the original plans. Parts are out of
  date; the build plan marks the separate console app, the refresh-token design and Google Maps
  as *Superseded* inline, and the area files say where else.
- [API contract notes](../api/hostelhive-api.md), [risks](../RISKS.md), [deploy](../DEPLOY.md),
  [Trello tickets](../trello-tickets.md).
- [Implement run notes](../implement/): one file per ticket run, e.g. [#93 billing](../implement/93.md).
- Repo root: `README.md` (what the repo is, setup and commands), `AGENTS.md` (house rules for Nx),
  `MOBILE.md` and `STORE.md` (app builds, signing and store submission; see
  [mobile app](area/mobile-app.md)).
