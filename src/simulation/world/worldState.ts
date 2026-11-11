/**
 * World Engine — world state definition and initial configuration.
 *
 * The world is a set of fictional regions with stable identifiers and
 * development indicators. No UI, rendering or React dependency.
 */

import { isFiniteNumber } from '@/core/utils';

export type RegionId = string;

/** Development stage of a region. */
export type RegionTier = 'core' | 'developed' | 'emerging' | 'frontier';

/**
 * Development indicators of a region. Every value is normalised to 0..100.
 */
export interface RegionIndicators {
  /** Overall development level. */
  development: number;
  /** Built infrastructure capacity. */
  infrastructure: number;
  /** Research and development capacity. */
  researchCapacity: number;
  /** Commercial activity of the region. */
  marketActivity: number;
}

export interface WorldRegion {
  /** Stable identifier — never reused, never derived from display data. */
  id: RegionId;
  name: string;
  tier: RegionTier;
  indicators: RegionIndicators;
  /** Signed development change per simulated hour. */
  developmentTrend: number;
  /** Political / social stability, 0..1. */
  stability: number;
}

export interface WorldState {
  regions: WorldRegion[];
  /** Currently focused region, or null. */
  activeRegionId: RegionId | null;
  /** Number of world ticks processed. */
  tick: number;
}

/** Aggregate indicators derived from the current world state. */
export interface WorldMetrics {
  regionCount: number;
  averageDevelopment: number;
  averageInfrastructure: number;
  averageResearchCapacity: number;
  averageMarketActivity: number;
  averageStability: number;
  /**
   * Aggregate commercial activity (0..100).
   * Consumed by the Economy Engine so that world development influences
   * demand without creating a dependency between the two modules.
   */
  marketActivityIndex: number;
}

export const REGION_TIERS: readonly RegionTier[] = ['core', 'developed', 'emerging', 'frontier'];

export const INDICATOR_KEYS = [
  'development',
  'infrastructure',
  'researchCapacity',
  'marketActivity',
] as const;

export type IndicatorKey = (typeof INDICATOR_KEYS)[number];

/**
 * Initial world configuration — a small, coherent set of fictional regions
 * suitable for the first playable prototype.
 */
export const INITIAL_REGIONS: readonly WorldRegion[] = [
  {
    id: 'aurora-basin',
    name: 'Aurora Basin',
    tier: 'core',
    indicators: {
      development: 82,
      infrastructure: 76,
      researchCapacity: 71,
      marketActivity: 84,
    },
    developmentTrend: 0.22,
    stability: 0.92,
  },
  {
    id: 'nova-reach',
    name: 'Nova Reach',
    tier: 'developed',
    indicators: {
      development: 64,
      infrastructure: 61,
      researchCapacity: 48,
      marketActivity: 58,
    },
    developmentTrend: 0.31,
    stability: 0.86,
  },
  {
    id: 'helion-rift',
    name: 'Helion Rift',
    tier: 'emerging',
    indicators: {
      development: 41,
      infrastructure: 33,
      researchCapacity: 27,
      marketActivity: 36,
    },
    developmentTrend: 0.46,
    stability: 0.71,
  },
  {
    id: 'cyther-peaks',
    name: 'Cyther Peaks',
    tier: 'emerging',
    indicators: {
      development: 33,
      infrastructure: 27,
      researchCapacity: 19,
      marketActivity: 24,
    },
    developmentTrend: 0.38,
    stability: 0.64,
  },
  {
    id: 'vanta-march',
    name: 'Vanta March',
    tier: 'frontier',
    indicators: {
      development: 18,
      infrastructure: 12,
      researchCapacity: 8,
      marketActivity: 11,
    },
    developmentTrend: 0.29,
    stability: 0.47,
  },
];

/**
 * Creates the initial world state.
 */
export function createInitialWorld(): WorldState {
  return {
    regions: INITIAL_REGIONS.map((region) => ({
      ...region,
      indicators: { ...region.indicators },
    })),
    activeRegionId: INITIAL_REGIONS[0]?.id ?? null,
    tick: 0,
  };
}

/**
 * Validates a world state.
 * Invalid states are rejected before they can corrupt the simulation.
 */
export function isValidWorldState(state: WorldState): boolean {
  if (!state || !Array.isArray(state.regions) || state.regions.length === 0) {
    return false;
  }
  if (!isFiniteNumber(state.tick) || state.tick < 0) {
    return false;
  }

  const seen = new Set<RegionId>();
  for (const region of state.regions) {
    if (!region || typeof region.id !== 'string' || region.id.length === 0) return false;
    if (seen.has(region.id)) return false;
    seen.add(region.id);

    if (typeof region.name !== 'string' || region.name.length === 0) return false;
    if (!REGION_TIERS.includes(region.tier)) return false;
    if (!isFiniteNumber(region.developmentTrend)) return false;
    if (!isFiniteNumber(region.stability) || region.stability < 0 || region.stability > 1) {
      return false;
    }
    if (!region.indicators) return false;
    for (const key of INDICATOR_KEYS) {
      const value = region.indicators[key];
      if (!isFiniteNumber(value) || value < 0 || value > 100) return false;
    }
  }

  if (state.activeRegionId !== null && !seen.has(state.activeRegionId)) {
    return false;
  }

  return true;
}

/**
 * Finds a region by its stable identifier.
 */
export function findRegion(state: WorldState, id: RegionId): WorldRegion | undefined {
  return state.regions.find((region) => region.id === id);
}

/**
 * Computes aggregate world indicators.
 */
export function getWorldMetrics(state: WorldState): WorldMetrics {
  const count = state.regions.length;
  if (count === 0) {
    return {
      regionCount: 0,
      averageDevelopment: 0,
      averageInfrastructure: 0,
      averageResearchCapacity: 0,
      averageMarketActivity: 0,
      averageStability: 0,
      marketActivityIndex: 0,
    };
  }

  const sum = (pick: (r: WorldRegion) => number): number =>
    state.regions.reduce((acc, region) => acc + pick(region), 0);

  const averageDevelopment = sum((r) => r.indicators.development) / count;
  const averageInfrastructure = sum((r) => r.indicators.infrastructure) / count;
  const averageResearchCapacity = sum((r) => r.indicators.researchCapacity) / count;
  const averageMarketActivity = sum((r) => r.indicators.marketActivity) / count;
  const averageStability = sum((r) => r.stability) / count;

  return {
    regionCount: count,
    averageDevelopment: Math.round(averageDevelopment * 100) / 100,
    averageInfrastructure: Math.round(averageInfrastructure * 100) / 100,
    averageResearchCapacity: Math.round(averageResearchCapacity * 100) / 100,
    averageMarketActivity: Math.round(averageMarketActivity * 100) / 100,
    averageStability: Math.round(averageStability * 100) / 100,
    marketActivityIndex: Math.round(averageMarketActivity * 100) / 100,
  };
}

/**
 * Aggregate commercial activity of the world (0..100).
 * Passed into the Economy Engine so demand reacts to world development.
 */
export function getMarketActivityIndex(state: WorldState): number {
  return getWorldMetrics(state).marketActivityIndex;
}
