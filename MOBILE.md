# HostelHive — Mobile (Capacitor)

The Android & iOS apps are the **same Angular app** wrapped with **Capacitor 7** —
no second codebase. Capacitor loads the no-SSR SPA build inside a native WebView
and bridges native APIs (status bar, splash screen, hardware back button,
geolocation) through plugins.

> Pinned to Capacitor **7** (not 8) on purpose: Capacitor 8's CLI requires
> Node ≥ 22, and this workspace runs on Node 20. Capacitor 7 fully supports
> Node 20. Revisit when the toolchain moves to Node 22+.

## TL;DR commands

| Command | What it does |
| --- | --- |
| `npm run build:mobile` | Production SPA build → `dist/apps/web-mobile/browser` |
| `npm run mobile:sync` | Build **+** copy into the native project(s) (`cap sync`) |
| `npm run mobile:android` | Build + sync + open in Android Studio |

Equivalent Nx targets: `nx run web:build-mobile`, `nx run web:cap-sync`,
`nx run web:cap-open-android`.

## One-time prerequisites

### Android — two ways to build

**A. Android Studio (recommended, easiest).** Install Android Studio (bundles JDK 21 +
Android SDK 35 + Gradle), then `npm run mobile:android` → opens the project → press ▶
to run on an emulator or a USB device (USB debugging on). This machine currently has no
Java/SDK (`java`, `ANDROID_HOME` unset), so this is required before it can compile.

**B. Headless one-command APK (no Android Studio).** Produces a debug APK using a
portable toolchain under `D:\buildtools` (downloads JDK 21 + Android SDK on first run):
```powershell
powershell -ExecutionPolicy Bypass -File tools\build-android.ps1
```
It is **resumable** — re-run it and it continues partial downloads (handy on a slow or
flaky connection). Output: `android\app\build\outputs\apk\debug\app-debug.apk`.
For a release/store build you must add a signing keystore (your passwords — do that
step yourself) and run `gradlew bundleRelease`.

### iOS (requires a Mac — cannot build on Windows)
On a Mac with **Xcode 16+** and CocoaPods installed:
```bash
bash tools/setup-ios.sh   # deps → SPA build → cap add ios → sync → icons → opens Xcode
```
(`@capacitor/ios` is already installed. The script is re-runnable.)

## Project layout

- **`capacitor.config.ts`** (repo root) — `appId: com.hostelhive.app`,
  `appName: HostelHive`, `webDir: dist/apps/web-mobile/browser`.
  ⚠️ **Confirm `appId` before the first store upload** — it's the store/bundle
  identity and is painful to change afterward.
- **`apps/web/src/app/capacitor/native.ts`** — `provideCapacitorNative()`:
  styles the status bar, hides the splash, wires the Android back button.
  A **no-op on web/SSR** (guarded by `Capacitor.isNativePlatform()`), so the same
  `app.config.ts` serves web and mobile.
- **`build-mobile`** Nx target — a browser-only (no SSR) build so Capacitor gets a
  real `index.html` SPA. The default `build` target (SSR) is untouched.
- **`android/`** — the native project. It's committed; build artifacts inside are
  git-ignored by Capacitor's generated `android/.gitignore`.

## ⚠️ Google Maps on device — action required

The Google Maps key is **HTTP-referrer-restricted** to the web domains. Inside the
app the WebView origin is `https://localhost` (Android) / `capacitor://localhost`
(iOS), so **Maps and Places will be blocked on device** until those origins are
allowed. In Google Cloud Console → the API key → *Website restrictions*, add:

```
https://localhost/*
capacitor://localhost/*
```

(Or issue a separate key for the mobile app.)

## Status & remaining follow-ups

- **App icon & splash art** — DONE. The brand bed-in-hive icon set + light/dark splash
  are generated from `apps/web/public/favicon.svg` via `npm run icons:generate`
  (`tools/generate-icons.mjs` rasterises web favicons + PWA icons + `assets/` sources
  with sharp, then `capacitor-assets generate --android` writes the Android launcher,
  adaptive and splash images). Re-run after editing the mark. iOS variants generate on a Mac.
- **Native geolocation** — DONE. A "Near me" control on `/search/map` calls
  `GeolocationService` (`@hostelhive/maps`), which uses `@capacitor/geolocation` on
  device (native permission prompt) and falls back to the browser API on web;
  `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` are in `AndroidManifest.xml`.
- **Safe-area insets** — DONE. `viewport-fit=cover` + `env(safe-area-inset-*)`
  (`.safe-pt` on the top bars, a calc on the map FAB) so chrome clears notches /
  status bars / home indicators. A no-op until the app runs edge-to-edge.
- **Push notifications** — not set up; needs `@capacitor/push-notifications` plus a
  Firebase project (`google-services.json`) and APNs config.
- **Offline fonts/icons** — DONE. Inter + Poppins (`@fontsource`) and the Tabler icon
  webfont (`@tabler/icons-webfont`) are self-hosted via `global.css` and bundled into
  the build (woff2 land in `…/assets/public/media/`) — renders with no network.
- **Mobile map view** — DONE. `/search/map` has an Airbnb-style list ⇄ map toggle (a
  floating "Show map / Show list" pill on phones); desktop keeps the split view.
- **Live reload during dev** — `npx cap run android -l --external` after starting
  the dev server.
