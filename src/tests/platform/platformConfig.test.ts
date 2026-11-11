import { describe, expect, it } from 'vitest';
import { readPlatformConfig, validatePlatformConfig } from '@/platform/config/platformConfig';

describe('platform config', () => {
  it('provides safe defaults and validates production ads requirements', () => {
    const config = readPlatformConfig();
    expect(config.distributionMode).toBeTruthy();
    expect(['development', 'production']).toContain(config.adsMode);

    const issues = validatePlatformConfig({
      ...config,
      adsMode: 'production',
      yandexRewardedAdUnitId: null,
    });
    expect(issues.some((i) => i.includes('Production ads mode'))).toBe(true);
  });

  it('flags EEA alternative billing mode as requiring verified enrollment', () => {
    const issues = validatePlatformConfig({
      distributionMode: 'google_play_eea_alternative_billing',
      adsEnabled: true,
      adsMode: 'development',
      yandexRewardedAdUnitId: null,
      apiBaseUrl: 'http://localhost',
      paymentsEnabled: false,
    });
    expect(issues.some((i) => i.toLowerCase().includes('enrollment'))).toBe(true);
  });
});