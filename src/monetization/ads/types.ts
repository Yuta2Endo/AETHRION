export type AdProvider = 'yandex';

export type AdLoadState = 'idle' | 'initializing' | 'loading' | 'ready' | 'showing' | 'completed' | 'failed' | 'unavailable';

export interface RewardedAdReward {
  type: string;
  amount: number;
}

export interface RewardedAdConfig {
  enabled: boolean;
  provider: AdProvider;
  mode: 'development' | 'production';
  adUnitId: string | null;
}

export interface RewardedAdState {
  state: AdLoadState;
  error: string | null;
  lastRewardedAt: number | null;
  completionToken: string | null;
}

export interface RewardedAdCompletion {
  verified: boolean;
  reward?: RewardedAdReward;
  completionToken: string;
}

export interface RewardedAdBridge {
  initialize(config: RewardedAdConfig): Promise<void>;
  loadRewarded(adUnitId: string): Promise<void>;
  showRewarded(): Promise<RewardedAdCompletion>;
  isAvailable(): Promise<boolean>;
}