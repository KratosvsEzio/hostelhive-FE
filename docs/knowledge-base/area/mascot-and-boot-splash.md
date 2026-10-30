# Mascot and boot splash

The Hive Bee is HostelHive's 3D mascot, used as decoration for waits, failed or empty searches, and
the landing page. It never carries meaning on its own: the copy beside it does, and it is hidden from
assistive tech. The boot splash is the first thing a full page load paints, before any JavaScript.

## Where it lives

- `apps/web/src/app/shared/mascot/mascot.ts`: the `hh-mascot` component and `supportsAlphaWebm()`.
- `apps/web/public/mascot/`: the clips. Each has a `.webm` (VP9 with alpha) and a `.webp` (animated):
  - `hello` and `hover`: glass-free greeting, then idle loop;
  - `search`: hunting loop with the magnifying glass;
  - `oops`: one apologetic shrug;
  - `key`: holding up a room key.
  - Stills: `still.webp` (with the glass) and `hover-still.webp` (without).
- `apps/web/src/index.html`: the boot splash `#hh-boot` (wordmark and bee), its inline CSS, and an
  inline script that picks the bee for the browser.
- `apps/web/src/app/core/boot-splash.ts`: `liftBootSplashWhenReady()`, called from the root
  component's constructor in `apps/web/src/app/app.ts`.
- `apps/web/public/hostelhive-wordmark.svg`: the wordmark the splash uses (it paints before the app's
  `hhLogo` exists).

## How it works

- **Modes** (`MascotMode`):
  - `greeting`: `hello`, then the `hover` loop.
  - `oops`: plays once.
  - `still`: a still image.
  - `search` and `key`: loops.
- **Picking a format:** `supportsAlphaWebm()` decides from the user agent. Chrome, Edge and Firefox
  get the WebM. WebKit, which includes every iOS browser, gets the WebP, because WebKit drops VP9's
  alpha channel and paints a black square.
- **Reduced motion:** gets the mode's still pose. The greeting and key poses have no glass; the search
  states keep it.
- **On the server:** it renders nothing.
- **`delay`:** holds the bee back, so a fast answer never flashes it.
- **Where it is used:**
  - the startup veil in `apps/web/src/app/app.html` (`greeting`);
  - the failed and empty search states in
    `apps/web/src/app/features/public/search/search-map/search-map.html` (`oops`, `still`);
  - the landing page (see [landing page](./landing-page.md)).
- **Boot splash:** static HTML, so it paints with the first byte. It stays while the `StartupGate` is
  busy (session and country still resolving), and for at least `BOOT_MIN_MS` (1.6 s from navigation
  start), then fades out over 250 ms and is removed. A CSS animation hides it after 10 s regardless,
  so a failed boot never covers the server-rendered page forever. With JavaScript off, a `<noscript>`
  style hides it.
- **The splash and the startup veil show only while the language may still change.** That is the
  one thing they hide: the country can switch the language, which navigates under someone reading.
  It cannot when the visitor chose a language before, or the URL names one and was not reached by a
  redirect to English (`LocaleStore.languageSettled`, mirroring `LocaleSync.wasSentHere`). For those
  visits, which include every crawler and shared link, an inline script before `#hh-boot` adds
  `hh-boot-skip` to `<html>` and removes the splash before its bee downloads, and `App.startingUp`
  ignores the `StartupGate`. Before this change the page was covered for at least 1.6 s, and about
  10 s on a throttled phone (SEO audit, 2026-10-31). A visitor redirected to `/en` (a URL with no
  language, such as `/search`) still gets the greeting as before.

## Reuse, don't rebuild

- Use `<hh-mascot mode="…" [size]="…" />` for any new bee. Don't hand-roll a `<video>`: the hero is
  the one exception, because it switches clips mid-animation and flies the bee through the clouds.
- Size is the bee itself: the clips are framed tight.

## Traps

- **Keep `index.html` and `mascot.ts` in step**: the splash's inline script duplicates the
  format and reduced-motion choice, because it runs before the app.
- **Keep the settled-language script in step with the app**: it restates
  `LocaleStore.languageSettled` with its own copy of the language codes and the chosen-language
  key. `core/boot-splash-settled.spec.ts` runs the real script from `index.html` and fails if the
  codes, the key or the rule drift.
- **Don't put the magnifying glass on the startup greeting**: nobody is searching yet. See the
  decision below.
- **An image has no `ended` event**: on the WebP path the greeting is swapped for the loop on a
  1.5 s timer started from the image's `load`, not from mount.

## Decisions

- [Alpha WebM for Blink and Gecko, animated WebP for WebKit](../decisions/mascot-and-boot-splash/alpha-webm-with-webp-for-webkit.md)
- [The startup greeting has no magnifying glass](../decisions/mascot-and-boot-splash/greeting-without-the-glass.md)

## See also

- [App shell and routing](./app-shell-and-routing.md) for the StartupGate and the startup veil.
- [Landing page](./landing-page.md).
