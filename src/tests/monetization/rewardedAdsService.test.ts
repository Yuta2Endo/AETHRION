import { describe, expect, it, vi } from 'vitest';
import { RewardedAdsService } from '@/monetization/ads/rewardedAdsService';
import type { RewardedAdBridge } from '@/monetization/ads/types';

function createBridge(overrides: Partial<RewardedAdBridge> = {}): RewardedAdBridge {
  return {
    initialize: vi.fn(async () => undefined),
    loadRewarded: vi.fn(async () => undefined),
    isAvailable: vi.fn(async () => true),
    showRewarded: vi.fn(async () => ({ verified: true, completionToken: 'token-1', reward: { type: 'bonus', amount: 1 } })),
    ...overrides,
  };
}

describe('RewardedAdsService', () => {
  it('grants reward only after verified completion and is idempotent per completion token', async () => {
    const service = new RewardedAdsService({ bridge: createBridge() });
    const grant = vi.fn(async () => 'granted');

    await service.load();
    const result = await service.showAndGrant(grant);
    expect(result).toBe('granted');
    expect(grant).toHaveBeenCalledTimes(1);

    await expect(service.showAndGrant(grant)).rejects.toThrow(/in progress|already granted|unavailable|failed/i);
  });

  it('rejects when completion is not verified', async () => {
    const bridge = createBridge({
      showRewarded: vi.fn(async () => ({ verified: false, completionToken: 'bad' } as any)),
    });
    const service = new RewardedAdsService({ bridge });
    await service.load();

    await expect(service.showAndGrant(async () => 'x')).rejects.toThrow();
    expect(service.getState().state).toBe('failed');
  });

  it('reports load failures without blocking callers from handling them', async () => {
    const bridge = createBridge({
      loadRewarded: vi.fn(async () => { throw new Error('network'); }),
    });
    const service = new RewardedAdsService({ bridge });

    await expect(service.load()).rejects.toThrow('network');
    expect(service.getState().state).toBe('failed');
  });
});