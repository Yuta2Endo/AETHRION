/**
 * Android platform integration (planned for later stages).
 * Stage 01: status documented only. Google Play Billing and AdMob integrations
 * are planned and will be wired via Capacitor once gameplay foundations exist.
 * No monetization or ads are added in Stage 01 per development rules.
 */

export const androidPlatform = {
  initialized: false,
  billingAvailable: false,
  adsAvailable: false,
  status: 'planned',
  notes: [
    'Capacitor configured (capacitor.config.ts).',
    'Google Play Billing — planned for later stages.',
    'Google AdMob — planned for later stages.',
    'No monetization before gameplay foundations exist.',
  ],
} as const;

export function getAndroidPlatformStatus() {
  return { ...androidPlatform };
}
