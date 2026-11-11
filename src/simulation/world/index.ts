/**
 * World Engine — public surface.
 * Baseline implementation (Stage 02).
 */

export {
  INITIAL_REGIONS,
  INDICATOR_KEYS,
  REGION_TIERS,
  createInitialWorld,
  findRegion,
  getMarketActivityIndex,
  getWorldMetrics,
  isValidWorldState,
} from './worldState';
export type {
  IndicatorKey,
  RegionId,
  RegionIndicators,
  RegionTier,
  WorldMetrics,
  WorldRegion,
  WorldState,
} from './worldState';

export { WORLD_RULES, evolveWorld, SIM_HOUR_MS } from './worldRules';
export type { WorldContext } from './worldRules';
