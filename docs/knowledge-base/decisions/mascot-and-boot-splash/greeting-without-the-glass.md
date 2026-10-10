# The startup greeting has no magnifying glass

**Status:** Accepted
**Area:** [mascot-and-boot-splash](../../area/mascot-and-boot-splash.md)

## Context

The first mascot release used one character for every wait: the bee holding a magnifying glass. That
fits a search, but on app startup nobody is searching anything yet, and the glass read as the wrong
message on the very first screen a visitor sees.

## Decision

Two families of clips:

- **Greeting, no prop**: `hello` (flies in and waves), then the `hover` loop, with `hover-still.webp`
  for reduced motion. Used for the boot splash, the startup veil and the landing hero's resting bee.
- **Search states, with the glass**: `search` (hunting), `oops` (failed search), and `still.webp`
  (empty search).

The landing hero switches to `search` only while the search bar is actually in use.

## Alternatives rejected

- **One clip everywhere**: the original approach, rejected for the reason above.
- **A spinner on startup**: loses the brand moment the splash exists for.

## Consequences

When adding a new bee placement, pick the family by what the visitor is doing: waiting or browsing
gets the greeting family, searching gets the glass.

## Evidence

- `apps/web/src/app/shared/mascot/mascot.ts` (`MascotMode` doc comment, `stillSrc`)
- `apps/web/src/index.html` (the boot splash comment)
- Commit `6b2f13d` "feat(web): boot splash with the greeting bee; drop the backend URL modal"
