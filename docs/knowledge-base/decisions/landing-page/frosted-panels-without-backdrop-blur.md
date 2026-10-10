# Frosted panels without a live backdrop blur

**Status:** Accepted
**Area:** [landing-page](../../area/landing-page.md)

## Context

Three landing sections (Hand-picked, Find by location, Loved by movers) use a frosted-glass look over
soft drifting glow blobs. They were first built with `backdrop-filter: blur(20px) saturate(1.5)`, and
the glow blobs had `filter: blur(60px)`.

Scrolling through those sections stuttered: 13–19 janky frames per pass while the featured listings
were loading. A backdrop blur is recomputed whenever what is behind it changes, and here the glows
drift and the loading skeletons shimmer, so every card re-blurred on every frame.

## Decision

- The frosted panels keep a translucent white fill, a bright border and a warm glow shadow, but no
  `backdrop-filter`. They sit on glows that are already soft, so blurring them changed almost nothing
  you could see; before/after screenshots look the same.
- The glow blobs drop their `filter: blur(60px)` for slightly wider radial gradients, which are
  already soft and cost nothing to paint at that size.

Janky frames while scrolling dropped to 2–5 per pass.

## Alternatives rejected

- **Static glows** (no drift): did not remove the cost on its own in measurement, and loses the life.
- **Keep the blur, drop the skeleton shimmer**: the shimmer is the app-wide loading pattern; and the
  cost returns as soon as anything behind the panels moves.

## Consequences

Don't reintroduce `backdrop-filter` on landing panels over moving backgrounds. A real frosted effect
is only worth its cost over a busy, static backdrop (for example a photo).

## Evidence

- `apps/web/src/app/features/public/home/home.scss` (the comment on `@mixin frosted` and `.hl-glow i`)
- Commit `35b7999` "perf(web): smooth landing-page scrolling"
