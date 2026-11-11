import { readPlatformConfig, validatePlatformConfig } from '@/platform/config/platformConfig';
import { createYandexAdsBridge } from './yandexAdsBridge';
import type { RewardedAdBridge, RewardedAdCompletion, RewardedAdConfig, RewardedAdState } from './types';

export interface RewardedAdsServiceOptions {
  bridge?: RewardedAdBridge;
  now?: () => number;
}

export class RewardedAdsService {
  private readonly bridge: RewardedAdBridge;
  private readonly now: () => number;
  private state: RewardedAdState = {
    state: 'idle',
    error: null,
    lastRewardedAt: null,
    completionToken: null,
  };
  private inFlight: Promise<RewardedAdCompletion> | null = null;
  private readonly grantedTokens = new Set<string>();
  private initialized = false;

  constructor(options: RewardedAdsServiceOptions = {}) {
    this.bridge = options.bridge ?? createYandexAdsBridge();
    this.now = options.now ?? (() => Date.now());
  }

  getConfig(): RewardedAdConfig {
    const platform = readPlatformConfig();
    return {
      enabled: platform.adsEnabled,
      provider: 'yandex',
      mode: platform.adsMode,
      adUnitId: platform.yandexRewardedAdUnitId,
    };
  }

  getState(): RewardedAdState {
    return { ...this.state };
  }

  async initialize(): Promise<void> {
    const config = this.getConfig();
    if (!config.enabled) {
      this.state = { ...this.state, state: 'unavailable', error: 'Advertising is disabled by configuration.' };
      return;
    }

    const issues = validatePlatformConfig(readPlatformConfig());
    const blocking = issues.filter((issue) => issue.toLowerCase().includes('ads'));
    if (blocking.length > 0) {
      this.state = { ...this.state, state: 'unavailable', error: blocking[0] };
      throw new Error(blocking[0]);
    }

    this.state = { ...this.state, state: 'initializing', error: null };
    await this.bridge.initialize(config);
    this.initialized = true;
    this.state = { ...this.state, state: 'idle', error: null };
  }

  async load(): Promise<void> {
    const config = this.getConfig();
    if (!config.enabled) {
      this.state = { ...this.state, state: 'unavailable', error: 'Advertising is disabled by configuration.' };
      return;
    }
    if (this.inFlight) throw new Error('A rewarded ad flow is already in progress.');

    if (!this.initialized) {
      await this.initialize();
    }

    const adUnitId = config.mode === 'production'
      ? config.adUnitId
      : (config.adUnitId || 'demo-rewarded-yandex');

    if (!adUnitId) {
      this.state = { ...this.state, state: 'failed', error: 'No rewarded ad unit ID configured.' };
      throw new Error('No rewarded ad unit ID configured.');
    }

    this.state = { ...this.state, state: 'loading', error: null };
    try {
      await this.bridge.loadRewarded(adUnitId);
      const available = await this.bridge.isAvailable().catch(() => config.mode === 'development');
      this.state = { ...this.state, state: available ? 'ready' : 'unavailable', error: available ? null : 'Rewarded ad inventory unavailable.' };
      if (!available) throw new Error('Rewarded ad inventory unavailable.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load rewarded ad.';
      this.state = { ...this.state, state: 'failed', error: message };
      throw error;
    }
  }

  async showAndGrant<T>(grant: (completion: RewardedAdCompletion) => Promise<T> | T): Promise<T> {
    if (this.inFlight) throw new Error('A rewarded ad flow is already in progress.');

    const flow = (async (): Promise<T> => {
      this.state = { ...this.state, state: 'showing', error: null };
      const completion = await this.bridge.showRewarded();

      if (!completion.verified) {
        throw new Error('Rewarded ad completion was not verified.');
      }
      if (this.grantedTokens.has(completion.completionToken)) {
        throw new Error('Reward already granted for this completion.');
      }

      const result = await grant(completion);
      this.grantedTokens.add(completion.completionToken);
      this.state = {
        state: 'completed',
        error: null,
        lastRewardedAt: this.now(),
        completionToken: completion.completionToken,
      };
      return result;
    })();

    this.inFlight = flow.then(() => undefined as unknown as RewardedAdCompletion);
    this.inFlight.catch(() => undefined);
    try {
      return await flow;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rewarded ad failed.';
      this.state = { ...this.state, state: 'failed', error: message };
      throw error;
    } finally {
      this.inFlight = null;
    }
  }

  reset(): void {
    this.inFlight = null;
    this.initialized = false;
    this.grantedTokens.clear();
    this.state = { state: 'idle', error: null, lastRewardedAt: null, completionToken: null };
  }
}

export const rewardedAdsService = new RewardedAdsService();