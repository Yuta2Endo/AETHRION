export type DistributionMode =
  | 'direct_distribution'
  | 'google_play_eea_alternative_billing'
  | 'google_play_standard_policy'
  | 'web_distribution';

export interface PlatformConfig {
  distributionMode: DistributionMode;
  adsEnabled: boolean;
  adsMode: 'development' | 'production';
  yandexRewardedAdUnitId: string | null;
  apiBaseUrl: string;
  paymentsEnabled: boolean;
}

function readMode(value: string | undefined): DistributionMode {
  switch (value) {
    case 'direct_distribution':
    case 'google_play_eea_alternative_billing':
    case 'google_play_standard_policy':
    case 'web_distribution':
      return value;
    default:
      return 'direct_distribution';
  }
}

export function readPlatformConfig(): PlatformConfig {
  const adsMode = (import.meta.env.VITE_ADS_MODE as string | undefined) === 'production' ? 'production' : 'development';
  const rewardedId = (import.meta.env.VITE_YANDEX_REWARDED_AD_UNIT_ID as string | undefined)?.trim() || null;

  return {
    distributionMode: readMode(import.meta.env.VITE_DISTRIBUTION_MODE as string | undefined),
    adsEnabled: (import.meta.env.VITE_ADS_ENABLED as string | undefined)?.toLowerCase() !== 'false',
    adsMode,
    yandexRewardedAdUnitId: rewardedId,
    apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:5173/api',
    paymentsEnabled: (import.meta.env.VITE_PAYMENTS_ENABLED as string | undefined)?.toLowerCase() === 'true',
  };
}

export function validatePlatformConfig(config: PlatformConfig): string[] {
  const issues: string[] = [];
  if (config.adsMode === 'production' && !config.yandexRewardedAdUnitId) {
    issues.push('Production ads mode requires VITE_YANDEX_REWARDED_AD_UNIT_ID.');
  }
  if (config.distributionMode === 'google_play_eea_alternative_billing') {
    issues.push('Google Play EEA alternative billing mode requires verified eligibility, enrollment, and compliant implementation before activation.');
  }
  return issues;
}