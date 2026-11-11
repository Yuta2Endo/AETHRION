# AETHRION — Yandex Ads Integration (Stage 10)

**Provider:** Yandex Mobile Ads (Android SDK) — owner-selected  
**Initial format:** **Rewarded ads** (user-initiated)  
**Status:** client architecture/service implemented; **native Kotlin Capacitor plugin and SDK (`7.18.2`) integrated/built and available on device (Stage 10.1, local)**. Live rewarded ad load/show/verified reward E2E remains **blocked** without configured test/production ad unit IDs and inventory.

## 1. Official references

- Android: https://ads.yandex.com/helpcenter/en/dev/android
- Quick start: https://ads.yandex.com/helpcenter/en/dev/android/quick-start
- Rewarded: https://ads.yandex.com/helpcenter/en/dev/android/rewarded

## 2. Architecture

`React/TypeScript UI` → `RewardedAdsService` (`src/monetization/ads/rewardedAdsService.ts`) → `YandexAdsBridge` (`yandexAdsBridge.ts`, Capacitor plugin `YandexAds`) → **Native Android Kotlin + Yandex Mobile Ads SDK**

- No direct SDK calls from React. No ad logic in simulation engines.
- Service enforces: config validation, init/load/show state machine, single in-flight flow, **reward granted only after verified completion callback**, idempotent completion-token handling.

## 3. Rewarded lifecycle

States: `idle | initializing | loading | ready | showing | completed | failed | unavailable`

- **Initialize:** validates config; production requires real ad unit ID (fails safely if missing). Development may use official demo/test placement IDs (never fabricated as production).
- **Load:** requests rewarded ad; readiness reflects availability/inventory.
- **Show:** user-initiated only; returns verified completion with token/reward payload from SDK/plugin.
- **Grant:** application grant callback executes only after verified completion; duplicate tokens never grant twice.
- **Failures:** init/load/show/inventory/lifecycle errors reported without blocking gameplay.

## 4. Native plugin contract (expected)

Capacitor plugin name: `YandexAds`
- `initialize({ mode, adUnitId? })`
- `loadRewarded({ adUnitId })`
- `showRewarded() -> { verified: boolean, completionToken: string, reward?: { type, amount } }`
- `isAvailable() -> { available: boolean } | boolean`

Kotlin implementation should wrap Yandex Mobile Ads SDK rewarded APIs, forward verified reward callbacks, handle activity lifecycle, and clean up resources. (Source scaffolding/build integration pending Android project/toolchain.)

## 5. Configuration (public, non-secret)

- `VITE_ADS_ENABLED`, `VITE_ADS_MODE` (`development|production`)
- `VITE_YANDEX_REWARDED_AD_UNIT_ID` (public placement ID). **Do not fabricate production IDs.**

## 6. Privacy and UX

- Rewarded ads explicit and user-understood before watching.
- No ads over payment/account-security screens; avoid intrusive placement during active gameplay.
- No unnecessary personal data collection or undisclosed tracking.

## 7. Blockers

- No generated `android/` project/Gradle/SDK in environment; native plugin/SDK not built or device-tested.
- No real Yandex ad unit IDs or account configuration; production readiness not claimed.