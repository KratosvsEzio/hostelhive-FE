# Mobile app

The Android (and future iOS) app is the same Angular app wrapped by Capacitor 7: a browser-only build
loaded in a native WebView, with plugins for the status bar, splash screen, back button, push,
camera, geolocation and Google sign-in. This area covers the native wrapper, the `isMobile` switch
that picks phone chrome, and push registration. The build and store steps are in `MOBILE.md` and
`STORE.md`; this file links to them and does not repeat them.

## Where it lives

- `capacitor.config.ts`: `appId`, `webDir: dist/apps/web-mobile/browser`, `androidScheme: 'https'`, the
  temporary `allowMixedContent` opt-in, splash and GoogleAuth plugin config. It reads the git-ignored
  `.env` at sync time.
- `apps/web/src/app/capacitor/native.ts`: `provideCapacitorNative()`. On native only: status bar style,
  `SplashScreen.hide()`, a silent `push.init()`, and the Android back button wired to
  `Location.back()` or `App.exitApp()`.
- `apps/web/src/app/core/mobile-app.ts`: `MobileApp.isMobile`, the switch for phone chrome.
- `apps/web/src/app/core/push-notifications.ts`: `PushNotificationsService` (`init`, `rotate`, `token`,
  `registrationId`, `received`).
- `apps/web/src/app/core/interceptors/push-token-interceptor.ts`: sends `X-FCM-Token` / `X-Device-Id`.
- `apps/web/src/app/shared/photo-picker/native-camera.ts`, `lib/src/maps/lib/geolocation.ts`: the other
  native plugin users, both lazy.
- `android/`: the committed native project. Release signing is in `android/app/build.gradle` (reads
  `android/keystore.properties` if present; see `android/keystore.properties.example`).
  `android/app/google-services.json` is the Firebase config. `android/app/src/debug/AndroidManifest.xml`
  allows cleartext for debug builds only.
- `apps/web/project.json` targets `build-mobile` (no `server`/`ssr`), `cap-sync`, `cap-open-android`.
  The npm scripts are `build:mobile`, `mobile:sync`, `mobile:android`, `mobile:ios` and
  `icons:generate` in `package.json`.
- `tools/build-android.ps1` (headless APK), `tools/setup-ios.sh` (Mac only; there is no `ios/` folder yet),
  `tools/generate-icons.mjs`.

## How it works

**One config for web and native.** `appConfig` is shared. Every native step checks
`Capacitor.isNativePlatform()` and imports its plugin dynamically, so the web bundle's eager path
never loads plugin code. Google sign-in splits by platform in `app.config.ts`: the Capacitor plugin on
native, Google Identity Services on the web. GA never starts on native
(`core/google-analytics/google-analytics.service.ts`).

**Phone chrome.** `MobileApp.isMobile` is true inside the native app, or when `?mobile=1` has pinned it
for this tab (sessionStorage), or when the viewport is 767px wide or less (a live `matchMedia`). It is
always false on the server. It drives the seeker tab bar instead of the footer (`app.ts`), and the
host/staff tab bars instead of the sidebar (`layout/host-shell/`, `layout/staff-shell/`).

**Push.** At startup `apps/web/src/app/capacitor/native.ts` calls `push.init()` silently: it registers only if permission was
already granted. After a sign-in succeeds, `AuthService` calls `init({ prompt: true })`, which may
show the Android 13+ permission dialog. Firebase delivers the token asynchronously into `token`; the
`registrationId` is our own `crypto.randomUUID()`. The interceptor attaches both headers to
authenticated requests and to the four session calls; the backend links the device to the signed-in
user on any authenticated request carrying `X-FCM-Token` (`be-hostelhive` `Api::ApiController`
`before_action :link_device`, since BE PR #39), so a token granted or rotated mid-session reaches it on
the next request. On sign-out `AuthService` calls `rotate()`,
which unregisters at Firebase and re-registers under a new id. On Android, `init` creates the
`hh_default` channel at MAX importance; `android/app/src/main/AndroidManifest.xml` names it as the default. A tap on a
notification opens `/notifications`. A push that arrives in the foreground bumps `received`, which
the notification bell reads.

## Reuse, don't rebuild

- `MobileApp.isMobile` for any phone-versus-desktop chrome decision. Do not add another width check.
- `PushNotificationsService` for anything about push; never call `PushNotifications` directly.
- Follow the `apps/web/src/app/capacitor/native.ts` pattern for a new plugin: platform check first, then a dynamic `import()`.
- `.safe-pb`, `.safe-pb-4`, `.hh-pb-tabbar` in `apps/web/src/global.css` for safe-area and tab-bar
  clearance.

## Traps

- The packaged app has no SSR and no `/sitemap.xml`. Bare paths go through `keepLocale` to `/en/...`,
  like on the web.
- Without `android/app/google-services.json` the build still passes and push silently does nothing. The Gradle
  script only logs a line (`android/app/build.gradle`).
- Android channel importance is fixed when the channel is created. To change it, use a new channel id
  in `apps/web/src/app/core/push-notifications.ts` and `android/app/src/main/AndroidManifest.xml` together.
- `allowMixedContent` and the debug cleartext manifest are temporary, for a LAN http backend. Release
  builds have neither.
- A notification tap always opens the list, because the backend sends no `data` block for routing yet
  (`openNotifications` comment).
- `appId` (`com.hostelhive.app`) cannot practically change after the first store upload.

## Decisions

- [Ask for push permission after sign-in; rotate the registration on sign-out](../decisions/mobile-app/push-permission-after-sign-in-rotate-on-sign-out.md)
- [Phone chrome follows viewport width, not only the native platform](../decisions/mobile-app/mobile-chrome-follows-width-not-platform.md)

## See also

- `MOBILE.md` (build commands, Capacitor 7 pin, Android/iOS prerequisites, push and maps on device),
  `STORE.md` (release keystore, store submission checklist)
- [app-shell-and-routing](./app-shell-and-routing.md), [auth-and-session](./auth-and-session.md),
  [maps](./maps.md), [ui-library](./ui-library.md), [tooling](./tooling.md)
