import { describe, expect, it } from 'vitest';
import { canUseExternalPayments, isModeImplemented } from '@/monetization/policy/distributionPolicy';

describe('distribution policy', () => {
  it('allows external payments only in explicitly permitted modes', () => {
    expect(canUseExternalPayments('direct_distribution').allowed).toBe(true);
    expect(canUseExternalPayments('web_distribution').allowed).toBe(true);
    expect(canUseExternalPayments('google_play_standard_policy').allowed).toBe(false);
    expect(canUseExternalPayments('google_play_eea_alternative_billing').allowed).toBe(false);
  });

  it('marks supported policy modes as architecturally prepared (gated)', () => {
    expect(isModeImplemented('direct_distribution')).toBe(true);
    expect(isModeImplemented('google_play_standard_policy')).toBe(true);
    expect(isModeImplemented('google_play_eea_alternative_billing')).toBe(true);
    expect(isModeImplemented('web_distribution')).toBe(true);
  });
});