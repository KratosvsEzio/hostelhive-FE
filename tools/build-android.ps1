# HostelHive - build a debug APK on Windows without a full Android Studio install.
#
# Sets up a PORTABLE toolchain under D:\buildtools (JDK 21 + Android SDK 35), then
# runs `gradlew assembleDebug`. Fully RESUMABLE + idempotent: re-run and it continues
# partial downloads (curl -C -), re-extracts an incomplete JDK, skips installed SDK
# packages, and does an incremental Gradle build. Safe to re-run on a flaky network.
#
#   powershell -ExecutionPolicy Bypass -File tools\build-android.ps1
#
# Output APK: android\app\build\outputs\apk\debug\app-debug.apk
$ErrorActionPreference='Continue'; $ProgressPreference='SilentlyContinue'
$bt='D:\buildtools'; $proj=(Resolve-Path "$PSScriptRoot\..").Path
New-Item -ItemType Directory -Force $bt | Out-Null

function Fetch($url,$out){ curl.exe -L --fail --no-progress-meter --retry 20 --retry-all-errors --retry-delay 3 -C - -o $out $url; return $LASTEXITCODE }
function ZipOk($z){ if(-not(Test-Path $z)){ return $false }; tar.exe -tf $z *> $null; return ($LASTEXITCODE -eq 0) }
function JavaWorks($jh){ if(-not $jh -or -not(Test-Path "$jh\bin\java.exe")){ return $false }; & "$jh\bin\java.exe" -version *> $null; return ($LASTEXITCODE -eq 0) }
function MB($f){ if(Test-Path $f){ [math]::Round((Get-Item $f).Length/1MB,1) } else { 0 } }

# ---------- JDK 21 (Temurin, portable) - validated by actually running java ----------
$jh = (Get-ChildItem "$bt\jdk" -Directory -EA SilentlyContinue | Where-Object { Test-Path "$($_.FullName)\bin\java.exe" } | Select-Object -First 1).FullName
if(-not (JavaWorks $jh)){
  "==> Fetching JDK 21 (resumable)..."
  Fetch 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk' "$bt\jdk21.zip" | Out-Null
  if(-not (ZipOk "$bt\jdk21.zip")){ "JDK archive incomplete (" + (MB "$bt\jdk21.zip") + "MB of ~146MB) - re-run to resume."; exit 2 }
  New-Item -ItemType Directory -Force "$bt\jdk" | Out-Null
  tar.exe -xf "$bt\jdk21.zip" -C "$bt\jdk"
  $jh = (Get-ChildItem "$bt\jdk" -Directory | Where-Object { Test-Path "$($_.FullName)\bin\java.exe" } | Select-Object -First 1).FullName
}
if(-not (JavaWorks $jh)){ "JDK not runnable yet - re-run."; exit 2 }
$env:JAVA_HOME=$jh; $env:PATH="$jh\bin;$env:PATH"
"JAVA_HOME=$jh"

# ---------- Android command-line tools (gate on a COMPLETE zip, then always re-extract) ----------
$sdkm="$bt\android-sdk\cmdline-tools\latest\bin\sdkmanager.bat"
if(-not (ZipOk "$bt\clt.zip")){
  "==> Fetching Android command-line tools (resumable)..."
  Fetch 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' "$bt\clt.zip" | Out-Null
}
if(-not (ZipOk "$bt\clt.zip")){ "cmdline-tools archive incomplete (" + (MB "$bt\clt.zip") + "MB of ~150MB) - re-run to resume."; exit 2 }
New-Item -ItemType Directory -Force "$bt\clt-tmp","$bt\android-sdk\cmdline-tools\latest" | Out-Null
tar.exe -xf "$bt\clt.zip" -C "$bt\clt-tmp"
Copy-Item "$bt\clt-tmp\cmdline-tools\*" "$bt\android-sdk\cmdline-tools\latest\" -Recurse -Force
if(-not(Test-Path $sdkm)){ "cmdline-tools not ready - re-run."; exit 2 }
$env:ANDROID_HOME="$bt\android-sdk"; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME

# ---------- Pre-accept SDK licenses (headless) ----------
$lic="$env:ANDROID_HOME\licenses"; New-Item -ItemType Directory -Force $lic | Out-Null
Set-Content "$lic\android-sdk-license" "`n8933bad161af4178b1185d1a37fbf41ea5269c55`nd56f5187479451eabf01fb78af6dfcb131a6481e`n24333f8a63b6825ea9c5514f83c2829b004d1fee" -Encoding ascii

# ---------- SDK packages (sdkmanager resumes its own downloads) ----------
"==> Installing SDK packages (platform-tools, platforms;android-35, build-tools;35.0.0)..."
cmd /c "`"$sdkm`" --sdk_root=`"$env:ANDROID_HOME`" platform-tools platforms;android-35 build-tools;35.0.0"
"sdkmanager exit: $LASTEXITCODE"

# ---------- local.properties ----------
Set-Content "$proj\android\local.properties" ("sdk.dir=" + ($env:ANDROID_HOME -replace '\\','\\\\')) -Encoding ascii

# ---------- Build ----------
"==> gradlew assembleDebug..."
Push-Location "$proj\android"
& .\gradlew.bat assembleDebug --no-daemon --warning-mode=none
$gx=$LASTEXITCODE
Pop-Location
"gradle exit: $gx"
$apk="$proj\android\app\build\outputs\apk\debug\app-debug.apk"
if(Test-Path $apk){ "APK_OK -> " + $apk + " (" + (MB $apk) + " MB)" } else { "APK_MISSING" }
"DONE"
