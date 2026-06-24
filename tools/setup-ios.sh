#!/usr/bin/env bash
# HostelHive — one-command iOS setup & launch.
#
# iOS apps can ONLY be built on macOS. Run this on a Mac with:
#   • Xcode 16+            (from the App Store)
#   • CocoaPods            (sudo gem install cocoapods  — or  brew install cocoapods)
#   • Node 20+             (matches the project)
#
# It is safe to re-run: it adds the iOS platform only if missing, then syncs.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/6 Installing dependencies"
npm ci

echo "==> 2/6 Building the web app (no-SSR SPA → dist/apps/web-mobile/browser)"
npm run build:mobile

if [ ! -d "ios" ]; then
  echo "==> 3/6 Adding the iOS platform (first run only)"
  npx cap add ios
else
  echo "==> 3/6 iOS platform already present"
fi

echo "==> 4/6 Syncing web assets + native plugins into iOS"
npx cap sync ios

echo "==> 5/6 Generating the iOS app icon + splash from assets/"
npx capacitor-assets generate --ios

echo "==> 6/6 Opening Xcode"
echo "    In Xcode: pick a Simulator or your device, then Run (Cmd+R)."
echo "    For a distributable build: Product > Archive."
echo "    NOTE: add https://localhost/* and capacitor://localhost/* to the Google Maps"
echo "          API key referrer allow-list, or the map will be blank on device."
npx cap open ios
