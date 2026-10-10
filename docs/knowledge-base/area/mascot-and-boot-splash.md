# Mascot and boot splash

> **Pending — not on `main`.** The Hive Bee mascot, the boot splash and the glass-free greeting live on
> branch `feat/mascot-loader` (PR #43). On `main` the app still shows a plain startup veil and the dev
> "Confirm backend URL" gate (`apps/web/src/app/features/dev-setup/`), which that branch removes.
> Remove this marker when the branch merges.

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

## Reuse, don't rebuild

- Use `<hh-mascot mode="…" [size]="…" />` for any new bee. Don't hand-roll a `<video>`: the hero is
  the one exception, because it switches clips mid-animation and flies the bee through the clouds.
- Size is the bee itself: the clips are framed tight.

## Traps

- **Keep `index.html` and `mascot.ts` in step**: the splash's inline script duplicates the
  format and reduced-motion choice, because it runs before the app.
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
