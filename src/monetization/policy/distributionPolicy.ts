import { readPlatformConfig, type DistributionMode } from '@/platform/config/platformConfig';

export interface PolicyDecision {
  mode: DistributionMode;
  allowed: boolean;
  reason?: string;
}

export function getDistributionMode(): DistributionMode {
  return readPlatformConfig().distributionMode;
}

export function canUseExternalPayments(mode: DistributionMode = getDistributionMode()): PolicyDecision {
  if (mode === 'direct_distribution' || mode === 'web_distribution') {
    return { mode, allowed: true };
  }
  if (mode === 'google_play_eea_alternative_billing') {
    return {
      mode,
      allowed: false,
      reason: 'Blocked pending verified developer eligibility, Play Console enrollment, compliant alternative billing implementation, disclosures, and reporting.',
    };
  }
  return {
    mode,
    allowed: false,
    reason: 'External Robokassa payment flows are not enabled for this distribution mode under current Google Play policy requirements.',
  };
}

export function isModeImplemented(mode: DistributionMode): boolean {
  // Architecturally prepared; safe gating implemented. No mode is claimed as production-approved.
  return mode === 'direct_distribution' || mode === 'web_distribution' || mode === 'google_play_standard_policy' || mode === 'google_play_eea_alternative_billing';
}