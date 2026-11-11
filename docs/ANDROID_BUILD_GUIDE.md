# AETHRION — Android Build Guide (Stage 10)

**App ID:** `com.aethrion.app`  
**App Name:** `AETHRION`  
**Web dir:** `dist`  
**Capacitor:** `^8.6.0` (core/cli/android) — audited

> **Environment status:** Android SDK, Gradle, and a generated native `android/` project are **not available** in the current workspace environment. Commands below are the documented, reproducible steps; results in this stage are reported honestly in `docs/STAGE_10_FINAL_REPORT.md`.

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
- Do **not** run `npx cap add android` if `android/` already exists. If missing and toolchain is available, generate once: `npx cap add android` (root `android/` is gitignored in this repo).
- Ensure Capacitor uses bundled local assets (`dist`) — no dev server URL in release.

## 3. Debug build (Gradle)

From `android/`:

```bash
./gradlew assembleDebug
```

(Windows: `gradlew.bat assembleDebug`)

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

## 7. Known limitations (this stage)

- No Android build executed here (missing SDK/Gradle/JDK-compatible toolchain and native project).
- No emulator/device verification performed.
- Release signing not configured/executed (no keystore fabricated). Store-readiness not claimed.