import type { RewardedAdBridge, RewardedAdCompletion, RewardedAdConfig } from './types';

type PluginLike = {
  initialize?: (options: { mode: string; adUnitId?: string | null }) => Promise<void>;
  loadRewarded?: (options: { adUnitId: string }) => Promise<void>;
  showRewarded?: () => Promise<{ verified?: boolean; reward?: { type: string; amount: number }; completionToken?: string }>;
  isAvailable?: () => Promise<{ available: boolean } | boolean>;
};

function getPlugin(): PluginLike | undefined {
  const cap = (globalThis as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return cap?.Plugins?.YandexAds as PluginLike | undefined;
}

function isValidCompletion(value: unknown): value is { verified?: boolean; reward?: { type: string; amount: number }; completionToken?: string } {
  return typeof value === 'object' && value !== null;
}

export function createYandexAdsBridge(): RewardedAdBridge {
  return {
    async initialize(config: RewardedAdConfig): Promise<void> {
      const plugin = getPlugin();
      if (plugin?.initialize) {
        await plugin.initialize({ mode: config.mode, adUnitId: config.adUnitId });
        return;
      }
      // No native plugin available in this environment.
      if (config.mode === 'production' && !config.adUnitId) {
        throw new Error('Yandex Ads production mode requires a configured ad unit ID.');
      }
    },

    async loadRewarded(adUnitId: string): Promise<void> {
      const plugin = getPlugin();
      if (plugin?.loadRewarded) {
        await plugin.loadRewarded({ adUnitId });
        return;
      }
      if (!adUnitId) throw new Error('Missing rewarded ad unit ID.');
      // Simulated readiness for development/test environments without SDK.
    },

    async showRewarded(): Promise<RewardedAdCompletion> {
      const plugin = getPlugin();
      if (plugin?.showRewarded) {
        const result = await plugin.showRewarded();
        if (!isValidCompletion(result)) {
          throw new Error('Invalid rewarded ad completion payload.');
        }
        if (result.verified !== true) {
          throw new Error('Rewarded ad was not verified as completed.');
        }
        const token = typeof result.completionToken === 'string' && result.completionToken.length > 0
          ? result.completionToken
          : `reward_${Date.now()}`;
        return {
          verified: true,
          reward: result.reward && typeof result.reward.type === 'string' && Number.isFinite(result.reward.amount)
            ? { type: result.reward.type, amount: result.reward.amount }
            : undefined,
          completionToken: token,
        };
      }
      throw new Error('Rewarded ads are unavailable: native Yandex Ads plugin/SDK not integrated in this environment.');
    },

    async isAvailable(): Promise<boolean> {
      const plugin = getPlugin();
      if (plugin?.isAvailable) {
        const value = await plugin.isAvailable();
        if (typeof value === 'boolean') return value;
        return !!value?.available;
      }
      return false;
    },
  };
}