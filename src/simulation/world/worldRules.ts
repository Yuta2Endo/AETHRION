/**
 * World Engine — deterministic evolution rules.
 *
 * `evolveWorld` is a pure function: the same state and context always produce
 * the same result. It contains no UI, rendering or React dependency.
 *
 * Rules (all rates expressed per simulated hour):
 * 1. Development grows by `developmentTrend * stability`.
 * 2. Infrastructure converges toward development.
 * 3. Research capacity grows when infrastructure is sufficient, otherwise it
 *    decays toward it.
 * 4. Market activity converges toward infrastructure.
 * 5. Stability drifts toward a target derived from the development level.
 */

import { logger } from '@/core/logging/logger';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import { isValidWorldState, type WorldRegion, type WorldState } from './worldState';

/** Context required to evolve the world. */
export interface WorldContext {
  /** Current tick number. */
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
}

/** Simulation hours contained in one millisecond. */
export const SIM_HOUR_MS = 3_600_000;

export const WORLD_RULES = {
  /** Fraction of the development gap closed per simulated hour. */
  infrastructureConvergence: 0.08,
  researchConvergence: 0.05,
  marketConvergence: 0.06,
  /** Infrastructure required before research capacity can grow. */
  researchThreshold: 40,
  /** Research decay applied when infrastructure is below the threshold. */
  researchDecay: 0.02,
  /** Base stability target before the development bonus. */
  stabilityTargetBase: 0.55,
  /** Divisor applied to development when computing the stability target. */
  stabilityDevelopmentDivisor: 250,
  /** Stability drift rate per simulated hour. */
  stabilityDrift: 0.02,
} as const;

function evolveRegion(region: WorldRegion, hours: number): WorldRegion {
  const { indicators } = region;

  const growth = region.developmentTrend * region.stability * hours;
  const development = clamp(indicators.development + growth, 0, 100);

  const infrastructure = clamp(
    indicators.infrastructure +
      (development - indicators.infrastructure) * WORLD_RULES.infrastructureConvergence * hours,
    0,
    100,
  );

  const researchTarget = infrastructure;
  const researchDelta =
    researchTarget >= WORLD_RULES.researchThreshold
      ? (researchTarget - indicators.researchCapacity) * WORLD_RULES.researchConvergence * hours
      : (researchTarget - indicators.researchCapacity) * WORLD_RULES.researchDecay * hours;
  const researchCapacity = clamp(indicators.researchCapacity + researchDelta, 0, 100);

  const marketActivity = clamp(
    indicators.marketActivity +
      (infrastructure - indicators.marketActivity) * WORLD_RULES.marketConvergence * hours,
    0,
    100,
  );

  const stabilityTarget =
    WORLD_RULES.stabilityTargetBase +
    development / WORLD_RULES.stabilityDevelopmentDivisor;
  const stability = clamp(
    region.stability + (stabilityTarget - region.stability) * WORLD_RULES.stabilityDrift * hours,
    0,
    1,
  );

  return {
    ...region,
    indicators: {
      development: roundTo(development),
      infrastructure: roundTo(infrastructure),
      researchCapacity: roundTo(researchCapacity),
      marketActivity: roundTo(marketActivity),
    },
    stability: roundTo(stability),
  };
}

/**
 * Evolves the world by one tick.
 *
 * Invalid input is rejected safely: the incoming state is returned unchanged
 * and the failure is logged, so a corrupted world can never propagate.
 */
export function evolveWorld(state: WorldState, context: WorldContext): WorldState {
  if (!isValidWorldState(state)) {
    logger.error('World Engine rejected an invalid world state — state left unchanged');
    return state;
  }
  if (!context || !isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    logger.error('World Engine rejected an invalid tick context — state left unchanged');
    return state;
  }

  const hours = context.deltaMs / SIM_HOUR_MS;
  if (hours <= 0) {
    // Nothing to advance (paused clock) — keep the tick counter in sync.
    return { ...state, tick: state.tick + 1 };
  }

  const regions = state.regions.map((region) => evolveRegion(region, hours));

  const activeRegionId =
    state.activeRegionId !== null && regions.some((r) => r.id === state.activeRegionId)
      ? state.activeRegionId
      : regions[0]?.id ?? null;

  return {
    regions,
    activeRegionId,
    tick: state.tick + 1,
  };
}
