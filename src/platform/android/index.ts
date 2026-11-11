/**
 * Android platform integration status (Stage 10).
 *
 * This module reports client-side platform/monetization configuration state.
 * It does not claim native SDK/device verification or external enrollment.
 */

import { getPlatformInfo, isAndroidNative } from '@/platform/capacitor/platform';
import { readPlatformConfig, validatePlatformConfig } from '@/platform/config/platformConfig';

export function getAndroidPlatformStatus() {
  const platform = getPlatformInfo();
  const config = readPlatformConfig();
  const configIssues = validatePlatformConfig(config);

  return {
    initialized: platform.hasCapacitor,
    platform,
    androidNative: isAndroidNative(),
    distributionMode: config.distributionMode,
    ads: {
      provider: 'yandex' as const,
      enabled: config.adsEnabled,
      mode: config.adsMode,
      rewardedUnitConfigured: !!config.yandexRewardedAdUnitId,
      sdkIntegrated: false,
      deviceVerified: false,
    },
    payments: {
      provider: 'robokassa' as const,
      enabled: config.paymentsEnabled,
      serverAuthoritative: true,
      backendImplemented: false,
      deviceVerified: false,
    },
    configIssues,
    notes: [
      'Capacitor configuration audited (capacitor.config.ts, appId com.aethrion.app, webDir dist, androidScheme https).',
      'Root native android/ project not present in repository; Android toolchain/device verification not performed in this environment.',
      'Yandex Mobile Ads selected for advertising; integration requires native Android SDK/plugin and valid ad unit IDs.',
      'Robokassa selected for purchases; server-authoritative verification and external enrollment/policy gates required.',
      'No secrets or merchant credentials are stored in the client.',
    ],
  } as const;
}

export { getPlatformInfo, isAndroidNative } from '@/platform/capacitor/platform';