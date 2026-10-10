# Phone chrome follows viewport width, not only the native platform

**Status:** Accepted
**Area:** [mobile-app](../../area/mobile-app.md)

## Context

The app has two sets of chrome: web (footer, console sidebars) and phone (bottom tab bars, sheets,
the host More page). At first `isMobile` was true only inside the Capacitor WebView, or when
`?mobile=1` had been pinned in localStorage. Two opposite bugs were reported: a pinned desktop showed
the tab bar at 1493px, and a phone-width browser got no tab bar at all. Later, one demo pin left a
browser in phone chrome at every width for good, with nothing on screen to explain it.

## Decision

`MobileApp.isMobile` is true when any of these holds, checked in this order:

1. the app runs natively (`Capacitor.isNativePlatform()`);
2. `?mobile=1` has pinned it **for this tab** (sessionStorage; `?mobile=0` clears the pin);
3. the viewport is 767px wide or less, tracked live with `matchMedia`.

Startup also deletes any old localStorage pin. On the server the value is always `false`.

## Alternatives rejected

- **Native platform only.** A phone browser then gets desktop chrome, and the consoles' sidebar
  squeezes the content into an unreadable column at 375px.
- **A localStorage pin.** It outlives the tab and strands the browser in phone chrome.
- **A different breakpoint.** 768px is the phone/tablet split. Wider screens keep the console sidebar.

## Consequences

- The server cannot know the width, so it always renders web chrome. Anything that differs by width has
  to be mirrored in CSS to avoid a flash: the footer is `hidden md:block` in `app.html`.
- Every console destination must be reachable from the tab bar or the More page, because under 768px
  there is no sidebar. Both read `hostNav` / `hostTabBar` for this reason.

## Evidence

- `apps/web/src/app/core/mobile-app.ts`, `apps/web/src/app/core/mobile-app.spec.ts`
- `apps/web/src/app/app.html` (footer comment)
- Commits `ec7ed46` fix(mobile): drive the mobile chrome off viewport width, not just the platform flag
  (PR #14), `8beb0f5` fix(mobile): stop one demo pin from turning every desktop into a phone
