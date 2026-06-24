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
Create `android/keystore.properties` (git-ignored — see `keystore.properties.example`):
```
storeFile=../../hostelhive-upload.jks
storePassword=********
keyAlias=hostelhive
keyPassword=********
```
Then the release `signingConfig` in `android/app/build.gradle` (ask me to wire this — it
reads the file above only if present, so debug builds keep working without it):
```gradle
def ksFile = rootProject.file('keystore.properties')
def ks = new Properties()
if (ksFile.exists()) { ks.load(new FileInputStream(ksFile)) }
android {
  signingConfigs {
    release {
      if (ksFile.exists()) {
        storeFile file(ks['storeFile']); storePassword ks['storePassword']
        keyAlias ks['keyAlias'];          keyPassword ks['keyPassword']
      }
    }
  }
  buildTypes { release { signingConfig signingConfigs.release } }
}
```

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
      feature → `ACCESS_FINE/COARSE_LOCATION`) and **account data** (name/email). Declare
      these in Play's *Data safety* form and Apple's *App Privacy* questionnaire.
- [ ] **Maps key referrers** — add `https://localhost/*` and `capacitor://localhost/*` to
      the Google Maps API key's allowed referrers, or the map is blank on device.
- [ ] **Screenshots** per device size — capture from the running app (phone + tablet/iPad).
- [ ] **Store listing** — title, short/full description, feature graphic (Play), category,
      content rating questionnaire.
- [ ] **Bump versions** each release — Android `versionCode`/`versionName` in
      `android/app/build.gradle`; iOS build/version in Xcode.

## What's automated vs. manual
- **Automated (Capacitor / this repo):** native projects, app id, icons, splash, the web
  build, `bundleRelease` / Xcode archive once signing is set.
- **Manual (you):** the two store accounts, the keystore + passwords, certificates, all
  listing content, privacy policy, and hitting "Submit".
