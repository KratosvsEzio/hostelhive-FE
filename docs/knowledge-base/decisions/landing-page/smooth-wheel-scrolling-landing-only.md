# Smooth wheel scrolling with Lenis, on the landing page only

**Status:** Accepted
**Area:** [landing-page](../../area/landing-page.md)

## Context

On Windows a mouse-wheel notch moves the page about 100 px within a single frame. On a long,
photographic page with a scroll-linked hero that reads as a series of jumps, even at a perfect
frame rate. Measured over 12 notches: 12 frames, each jumping 100 px.

## Decision

Use [Lenis](https://github.com/darkroomengineering/lenis) (`lenis`, pinned) for smooth wheel
scrolling on the landing page only:

- **Loading:** `useSmoothScroll()` starts it from the `Home` constructor, in the browser only. It is
  loaded with a dynamic `import()`, so it lands in its own chunk and stays out of the initial bundle.
- **What stays native:** touch and trackpad scrolling, and anyone who asked for reduced motion
  (`respectReducedMotion`). Lists with their own scroll keep it (`allowNestedScroll`).
- **Teardown:** destroyed when the page is, so every other page scrolls natively.

The same 12 notches now spread over about 300 frames, with the biggest single-frame jump 41 px.
Checked: a dropdown list scrolls itself and not the page; the wheel over the Leaflet map scrolls the
page; leaving `/` removes the `lenis` class.

## Alternatives rejected

- **App-wide smooth scrolling**: the console pages are dense tools with nested scroll areas (tables,
  drawers, date pickers); a glide there is friction, not polish.
- **CSS `scroll-behavior: smooth`**: only affects programmatic and anchor scrolling, not the wheel.
- **A hand-written wheel interpolator**: Lenis already handles nested scroll, reduced motion, touch
  and resize correctly.

## Consequences

- While Lenis runs, `html.lenis` turns off the site-wide `scroll-behavior: smooth`
  (`apps/web/src/global.css`), which would otherwise fight it.
- A new scrollable element on the landing page that should not be smoothed can opt out with
  `data-lenis-prevent`.

## Evidence

- `apps/web/src/app/features/public/home/smooth-scroll.ts`
- `apps/web/src/global.css` (the Lenis block)
- Commit `35b7999` "perf(web): smooth landing-page scrolling"
