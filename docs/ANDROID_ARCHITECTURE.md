# AETHRION — Android Architecture (Stage 10)

**Project:** AETHRION  
**Stage:** 10 — Android Native Integration & Monetization  
**Status:** Architecturally prepared / partially implemented in-repo; native build and device verification **blocked** in this environment

## 1. Overview

AETHRION targets Android via **Capacitor 8** (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android` `^8.6.0`) wrapping the existing Vite/React/TypeScript web application (`webDir: dist`). The simulation, rendering, persistence, and UI remain the authoritative web application; native Android provides the container, lifecycle hooks, and platform SDK integrations (ads/payments) through Capacitor plugins.

## 2. Capacitor configuration (audited)

- **Config:** `capacitor.config.ts`
  - `appId`: `com.aethrion.app`
  - `appName`: `AETHRION`
  - `webDir`: `dist`
  - `server.androidScheme`: `https`
- **Scripts:** `android:init`, `android:add`, `android:sync`, `android:open` present in `package.json`.
- **Native project:** root `android/` directory **not present** in repository (and gitignored at root). Android platform generation/sync/build not executed (toolchain/SDK unavailable).

## 3. Platform layer (`src/platform/`)

| Module | Purpose |
|--------|---------|
| `capacitor/platform.ts` | Runtime detection of Capacitor/native platform (`android`/`ios`/`web`) via safe global probing (no hard dependency beyond core presence). |
| `config/platformConfig.ts` | Client-safe configuration (distribution mode, ads/payments flags, render quality inputs, public API base URL). Validation rejects unsafe/misaligned public config (e.g. production ads without unit ID, gated modes). |
| `lifecycle/lifecycle.ts` | Lifecycle manager: `visibilitychange` + Capacitor `App` plugin listeners (`pause`, `resume`, `backButton`) when available; graceful web fallback; disposal to avoid leaks/duplicate handlers. |
| `android/index.ts` | Aggregated platform/monetization status reporting (configuration-aware, no false claims of SDK/device verification). |

## 4. Application lifecycle integration

- **`AppShell`** boots/stops the simulation on mount/unmount as before, and installs lifecycle handling:
  - **Back button:** closes navigation sidebar when open (handled), otherwise defers to default/native behavior.
  - **Background/foreground:** WebView visibility and Capacitor pause/resume hooks are observed. Rendering (`WorldRenderer`) already pauses render work when hidden; Game Engine drops accumulator on foreground to avoid catch-up bursts. No duplicate simulation loops or renderers are created.
- **Save/restore:** autosave and persistence remain store/tick-driven; lifecycle changes do not alter save format or authoritative state.

## 5. Rendering on Android WebView

- **Quality profiles:** `src/rendering/core/quality.ts` supports `VITE_RENDER_QUALITY` (`auto|low|medium|high`) with device-capability heuristics, DPR capping, AA tuning, shadows disabled (mobile-conscious).
- **Safety:** WebGL capability detection, visibility-aware rendering, resize handling, context-loss handling, and full disposal (Stage 09). Graceful fallback to 2D/textual city overview when WebGL unavailable/fails.
- **Constraint:** not verified on Android WebView/device; no rendering moved to simulation Worker; no Three.js objects persisted.

## 6. Native plugin boundaries (ads/payments)

- **Pattern:** React/TypeScript service → Capacitor plugin interface (`Capacitor.Plugins.*`) → native Android (Kotlin) → third-party SDK (Yandex Ads) / authenticated backend (Robokassa). No native SDK calls from React; no monetization logic in simulation engines.
- **Yandex Ads:** client bridge (`src/monetization/ads/yandexAdsBridge.ts`) invokes `YandexAds` plugin when present; rewarded lifecycle/idempotency enforced in `RewardedAdsService`. Native Kotlin plugin/SDK wiring **scaffolded at architecture/contract level only** in this environment (no buildable Android project/device verification).
- **Robokassa:** client uses authenticated backend API (`src/monetization/payments/paymentClient.ts`) gated by distribution policy and config; **no secrets in client**. Server-authoritative verification implemented as reference logic in `server/src/payments/` (not deployed).

## 7. Permissions and security (intended/minimal)

- No unnecessary permissions added in-repo. Network access required for ads/backend when enabled. Release builds must bundle local assets (no dev server URL), exclude debug/dev config and secrets, and keep signing material outside Git.

## 8. Known blockers

- Android SDK/JDK/Gradle/toolchain and `android/` project unavailable here: cannot run `cap add/sync`, Gradle builds, manifest/Gradle hardening verification, or device/emulator tests.
- Native Yandex Ads SDK integration and runtime behavior unverified without Android project, dependencies, and credentials/device.
- Secure Robokassa backend deployment/auth/credentials not present.

See `docs/ANDROID_BUILD_GUIDE.md` and `docs/STAGE_10_FINAL_REPORT.md`.