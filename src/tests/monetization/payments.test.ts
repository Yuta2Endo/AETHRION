import { describe, expect, it } from 'vitest';
import { canTransitionPaymentStatus } from '@/monetization/payments/types';

describe('payment state machine', () => {
  it('allows valid transitions and blocks invalid ones', () => {
    expect(canTransitionPaymentStatus('created', 'pending')).toBe(true);
    expect(canTransitionPaymentStatus('pending', 'paid')).toBe(true);
    expect(canTransitionPaymentStatus('paid', 'refunded')).toBe(true);
    expect(canTransitionPaymentStatus('paid', 'pending')).toBe(false);
    expect(canTransitionPaymentStatus('failed', 'paid')).toBe(false);
    expect(canTransitionPaymentStatus('cancelled', 'paid')).toBe(false);
  });
});