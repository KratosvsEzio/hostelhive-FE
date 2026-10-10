# The site header floats over the landing hero

**Status:** Pending — on branch `feat/mascot-loader` (PR #43), not on `main`
**Area:** [landing-page](../../area/landing-page.md)

## Context

The landing hero is a full-screen photo. The site header (`app-site-header`, one header shared by
every area) is a sticky white bar with the Where / Budget / Accommodation search on `/` and `/search`.
Over the hero that would put a white band and a second search bar above a hero that already has one.

## Decision

On `/` only, `SiteHeader` adds two classes:

- `hh-header-float` (fixed, not sticky, so the hero starts at the top of the window under it);
- `hh-header-overlay` while the reader is within 80 % of a viewport height from the top: transparent,
  white logo, light controls, and no header search bar (the hero carries its own).

Past that point it is the usual white bar again, with the search.

## Alternatives rejected

- **A separate landing-only header component**: two headers drift apart; the account menu, bell and
  language switcher would have to be wired twice.
- **Switching sticky → fixed at the threshold**: makes the page jump by the header's height mid-scroll.
  The header is fixed for the whole visit to `/` instead.

## Consequences

- The overlay styles live in `apps/web/src/global.css`, scoped with `header.` so they outrank the
  utility classes on the header, and reach into the language switcher, bell and avatar.
- Other pages are untouched; a test covers both (`site-header.spec.ts`, "SiteHeader over the landing
  hero").

## Evidence

- `apps/web/src/app/layout/components/site-header/site-header.ts` (`onLanding`, `overlay`)
- `apps/web/src/app/layout/components/site-header/site-header.spec.ts`
- Commit `083e611`
