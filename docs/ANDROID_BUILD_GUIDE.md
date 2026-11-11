# AETHRION — Android Build Guide (Stage 10 / 10.1)

**App ID:** `com.aethrion.app`  
**App Name:** `AETHRION`  
**Web dir:** `dist`  
**Capacitor:** `^8.6.0` (core/cli/android)

> **Status (Stage 10.1, local environment):** Root `android/` project source/config is tracked in Git (with local/build/generated files ignored). A local repeatable debug build and device install/smoke test were executed on the verified environment below; this is **not** a clean-machine build claim. See `docs/STAGE_10_1_FINAL_REPORT.md`.

## Verified local environment (Stage 10.1)

- Node `v26.13.0`, npm `11.20.0`, Capacitor CLI `8.6.0`
- Android SDK: `E:\ASGG` (`ANDROID_HOME`/`ANDROID_SDK_ROOT`), build-tools 34.0.0/35.0.0/36.0.0/36.1.0, platforms 34–37
- JDK for Gradle/AGP build: **Microsoft OpenJDK 21.0.13.0.2 LTS** (`JAVA_HOME`)
- Gradle wrapper: `8.14.3-all`, AGP `8.13.0`, Kotlin `2.0.21`
- `compileSdk`/`targetSdk` 36, `minSdk` 24
- Device (ADB): `10AFAB1AD60032K` (Android 16, SDK 36)

## 1. Prerequisites

- Node.js + npm (project uses Node v26.x / npm 11.x in this environment)
- Java JDK compatible with Capacitor 8 / target Android Gradle Plugin (JDK 17+ typically required; verify against installed Capacitor/AGP)
- Android SDK (platforms/build-tools), `ANDROID_HOME`/`ANDROID_SDK_ROOT` configured
- Android Studio or command-line Gradle toolchain

## 2. Web production build and sync

```bash
npm ci
npm run build
npx cap sync android
```

- Do **not** run `npx cap init` (already initialized).
- Do **not** run `npx cap add android` if `android/` already exists. If missing and toolchain is available, generate once: `npx cap add android`.
- **Tracked Android project:** `android/` source/config is versioned; local/build/generated artifacts (e.g. `local.properties`, `.gradle/`, `**/build/`, copied `assets/public`, generated capacitor json/config, `capacitor-cordova-android-plugins/`) remain ignored and regenerable.
- **`cap sync` safety:** verify custom native code/registration survives sync (e.g. `YandexAdsPlugin.kt`, `MainActivity.registerPlugin(...)`) — **verified in Stage 10.1**.
- Ensure Capacitor uses bundled local assets (`dist`) — no dev server URL in release.

## 3. Debug build (Gradle)

From `android/` (use Gradle wrapper):

```bash
./gradlew assembleDebug
```

(Windows: `gradlew.bat assembleDebug`)

**Stage 10.1 verified result (local):** `BUILD SUCCESSFUL` with JDK 21 + Android SDK `E:\ASGG`.
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Size/timestamp (recorded): 16,170,741 bytes, 2026-11-12 06:50:16 (local)
- Install/launch smoke: `adb install -r ...` Success, `adb shell am start -n com.aethrion.app/.MainActivity` on `10AFAB1AD60032K`.

## 4. Release build configuration (no secrets committed)

- **Versioning:** set `versionCode` / `versionName` in `android/app/build.gradle` (keep aligned with app release process).
- **SDK levels:** choose `minSdk`, `compileSdk`, `targetSdk` compatible with Capacitor 8 and current Play requirements (verify with installed AGP/Gradle).
- **Signing:** configure release signing via **local, gitignored** material only:
  - Option A: `android/keystore.properties` (gitignored) referenced from Gradle, e.g.
    - `storeFile`, `storePassword`, `keyAlias`, `keyPassword`
  - Option B: environment variables / CI secrets injected at build time.
- **Never commit:** keystores, passwords, private keys, Robokassa/Yandex secrets, tokens.

Example (local, not committed) `keystore.properties`:

```properties
storeFile=../release.keystore
storePassword=***
keyAlias=***
keyPassword=***
```

## 5. Release artifact

```bash
./gradlew bundleRelease   # AAB (Play)
# or
./gradlew assembleRelease # APK
```

Verify: application ID `com.aethrion.app`, version, permissions, signing, and that no dev/debug endpoints or secrets are bundled.

## 6. Verification checklist (when tooling/devices available)

- Install/launch, dashboard/navigation, World View rendering and touch controls
- Background/resume, save/load, offline behavior, no duplicate loops/renderers
- Back button behavior
- WebGL fallback on unsupported devices
- Yandex Ads: init, load, rewarded test placement, verified completion, failure paths
- Robokassa: test-mode flow via secure backend, status recovery, no client secrets

Record device model, Android version, WebView version, and results.

## 7. Known limitations / blockers (updated Stage 10.1)

- **Not a clean-clone build proof:** validated on the current local machine only.
- Release signing/AAB/store readiness not executed or claimed.
- Yandex Ads: plugin/SDK built and initialized; full rewarded load/show/verified reward E2E **not** verified without configured test ad unit IDs/inventory.
- Robokassa: runnable local backend + idempotent verification logic exist, but **no** real merchant credentials, no secure authenticated identity integration, no public HTTPS `ResultURL`, and no device-to-backend E2E test-mode transaction completed.
- Device must not use `localhost` for backend API; configure reachable LAN/HTTPS endpoint and auth when testing payments.