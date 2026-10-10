# HostelHive — Publishing to the App Store & Google Play

Capacitor builds **real native apps** that both stores accept:
- **Google Play** ← a signed **`.aab`** from `gradlew bundleRelease`
- **App Store** ← an Xcode **Archive** (`.ipa`), uploaded with Xcode or Transporter

The app is technically build-ready (bundle id `com.hostelhive.app`, icons, splash, version
1.0). What remains is **store-side work only you can do** (accounts, signing secrets,
metadata, privacy policy, review). This file covers the build/signing parts; the rest is
done in App Store Connect / Play Console.

---

## Android → Google Play (release AAB)

### 1. Create your upload keystore (ONE time — you do this; never commit it)
```bash
keytool -genkey -v -keystore hostelhive-upload.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias hostelhive
```
Keep the `.jks` file and its passwords safe (a lost upload key can be reset with Play App
Signing; a lost *app* signing key cannot — so enrol in **Play App Signing**, which is the default).

### 2. Tell Gradle about it (secrets stay out of git)
Copy `android/keystore.properties.example` to `android/keystore.properties` (git-ignored)
and fill in your values:
```
storeFile=../../hostelhive-upload.jks
storePassword=********
keyAlias=hostelhive
keyPassword=********
```
`storeFile` is resolved relative to `android/app/`, so `../../` is the repo root.

That is all — the release `signingConfig` is already wired in `android/app/build.gradle`.
It reads `android/keystore.properties` only if the file is present, so debug builds (and
unsigned release builds) keep working without it.

### 3. Build the AAB
```powershell
npm run build:mobile        # web SPA
npx cap sync android
cd android; .\gradlew.bat bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```
Upload that `.aab` to a Play Console track (internal → closed → production).

---

## iOS → App Store (on a Mac, Xcode 16+)

iOS signing is handled by Xcode — no manual cert wrangling needed:
```bash
bash tools/setup-ios.sh     # builds + cap add ios + sync + icons + opens Xcode
```
In Xcode: **Signing & Capabilities → Automatically manage signing**, pick your Team (from
your Apple Developer enrolment). Then **Product → Archive → Distribute App → App Store Connect**.

---

## Before you submit (both stores)

- [ ] **Apple Developer Program** ($99/yr) and **Google Play Developer** ($25 one-time).
- [ ] **Privacy policy URL** (hosted, public) — required by both.
- [ ] **Data collection declarations** — HostelHive uses **location** (the "Near me" map
      feature → `ACCESS_FINE/COARSE_LOCATION`), **account data** (name/email) and a
      **push token** (Firebase Cloud Messaging, sent to the API with the device's
      registration id). Declare these in Play's *Data safety* form and Apple's *App
      Privacy* questionnaire.
- [ ] **Map tiles** — build with `CARTO_BASEMAP_KEY` set in `.env`, or every map tile is
      watermarked. Keep `localhost` on the key's domain allow-list — it is the app's
      WebView origin (see `MOBILE.md` → *Maps on device*).
- [ ] **Push on iOS** — configure APNs in the Firebase project and Xcode (Android push is
      already wired through `android/app/google-services.json`).
- [ ] **Screenshots** per device size — capture from the running app (phone + tablet/iPad).
- [ ] **Store listing** — title, short/full description, feature graphic (Play), category,
      content rating questionnaire.
- [ ] **Bump versions** each release — Android `versionCode`/`versionName` in
      `android/app/build.gradle`; iOS build/version in Xcode.

## What's automated vs. manual
- **Automated (Capacitor / this repo):** native projects, app id, icons, splash, the web
  build, Android release signing (once `android/keystore.properties` exists), Android push,
  `bundleRelease` / Xcode archive.
- **Manual (you):** the two store accounts, the keystore + passwords, certificates, all
  listing content, privacy policy, and hitting "Submit".
