/**
 * Economy Engine — deterministic market rules.
 *
 * `updateEconomy` is a pure function: the same state and context always
 * produce the same result. It contains no UI, rendering or React dependency.
 *
 * Price model:
 *   imbalance   = (demand - supply) / max(demand + supply, 1)      -> -1..1
 *   targetPrice = basePrice * (1 + imbalance * ELASTICITY)
 *   newPrice    = price + (targetPrice - price) * ADJUSTMENT_RATE * hours
 *   price       = clamp(newPrice, priceFloor, priceCeiling)
 *
 * Supply and demand evolve proportionally to their reference level, so growth
 * compounds instead of running away. Demand is additionally scaled by the
 * aggregate commercial activity of the world, so world development influences
 * the market without coupling the two modules.
 */

import { logger } from '@/core/logging/logger';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import type {
  CityMarketSignal,
  CommodityCategory,
  CompetitorMarketSignal,
  CorporateMarketSignal,
  EventEnvironmentModifiers,
} from '@/simulation/contracts';
import {
  isValidEconomyState,
  type EconomyState,
  type MarketCommodity,
} from './economyState';

/** Context required to update the economy. */
export interface EconomyContext {
  /** Current tick number. */
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Aggregate commercial activity of the world, 0..100. */
  marketActivityIndex: number;
  /**
   * The corporate market signal (Stage 04).
   *
   * Optional: when it is absent the market behaves exactly as in Stage 02.
   */
  corporateSignal?: CorporateMarketSignal;
  /**
   * The city market signal (Stage 05).
   *
   * Optional: when it is absent the market behaves exactly as in Stage 04.
   */
  citySignal?: CityMarketSignal;
  /**
   * The competitor market signal (Stage 06).
   *
   * Optional: when it is absent the market behaves exactly as in Stage 05.
   */
  competitorSignal?: CompetitorMarketSignal;
  /**
   * The modifiers of the active global events (Stage 06).
   *
   * Optional: when it is absent the market behaves exactly as in Stage 05.
   */
  eventModifiers?: EventEnvironmentModifiers;
}

export const ECONOMY_RULES = {
  /** How strongly a supply/demand imbalance moves the price. */
  elasticity: 0.45,
  /** Fraction of the distance to the target price closed per simulated hour. */
  adjustmentRate: 0.15,
  /** Maximum number of retained price samples per commodity. */
  historyLength: 24,
  /** How strongly world commercial activity amplifies demand. */
  demandActivityWeight: 0.5,
  /** Demand above this multiple of the reference is treated as saturated. */
  demandSaturation: 3,
  /** How strongly the corporate supply signal amplifies the commodity supply. */
  corporateSupplyWeight: 0.15,
  /** How strongly the corporate demand signal amplifies the commodity demand. */
  corporateDemandWeight: 0.15,
  /** How strongly the city amplifies the commodity demand. */
  cityDemandWeight: 0.15,
  /** How strongly the urban energy demand amplifies the energy demand. */
  cityEnergyWeight: 0.1,
  /** Energy demand (MWh/h) that corresponds to the maximum energy bonus. */
  cityEnergyReference: 2_000,
  /**
   * How strongly the city raises the saturation ceiling of the commodity
   * demand. A growing city consumes more, so the market can sustain a higher
   * level of demand.
   */
  citySaturationWeight: 0.25,
  /** How strongly the competitors raise the commodity supply. */
  competitorSupplyWeight: 0.12,
  /** How strongly the competitors raise the commodity demand. */
  competitorDemandWeight: 0.12,
} as const;

/**
 * How strongly the urban activity raises the demand of a commodity category.
 *
 * The city is a consumer, not a producer — it never adds supply to the
 * market.
 */
export const CITY_COMMODITY_WEIGHTS: Record<CommodityCategory, number> = {
  compute: 1,
  energy: 0.6,
  materials: 0.9,
  logistics: 1,
};

/**
 * Builds the urban activity index of the city signal, 0..100.
 *
 * The index blends the commercial activity, the research capacity, the
 * industrial capacity and the population of the city.
 */
export function getCityUrbanIndex(signal: CityMarketSignal): number {
  return clamp(
    signal.commercialActivity * 0.4 +
      signal.researchCapacity * 0.3 +
      Math.min(1, signal.industrialCapacity / 500) * 100 * 0.2 +
      Math.min(1, signal.population / 5_000) * 100 * 0.1,
    0,
    100,
  );
}

/**
 * The factor the city adds to the demand of a commodity category.
 *
 * The factor is bounded by 1.15 — the city can raise the demand by at most
 * fifteen percent. Without a city signal the factor is exactly 1 and the
 * market behaves exactly as in Stage 04.
 */
export function getCityDemandFactor(
  signal: CityMarketSignal | undefined,
  category: CommodityCategory,
): number {
  if (!signal) return 1;

  const urbanIndex = getCityUrbanIndex(signal);
  const activityFactor = 1 + (urbanIndex / 100) * CITY_COMMODITY_WEIGHTS[category] * ECONOMY_RULES.cityDemandWeight;

  const energyFactor =
    category === 'energy'
      ? 1 +
        Math.min(
          ECONOMY_RULES.cityEnergyWeight,
          (Math.max(0, signal.energyDemand) / ECONOMY_RULES.cityEnergyReference) *
            ECONOMY_RULES.cityEnergyWeight,
        )
      : 1;

  return roundTo(Math.min(1 + ECONOMY_RULES.cityDemandWeight, activityFactor * energyFactor), 6);
}

/**
 * The factor the city adds to the saturation ceiling of a commodity category.
 *
 * Without a city signal the factor is exactly 1 and the market behaves
 * exactly as in Stage 04.
 */
export function getCitySaturationFactor(
  signal: CityMarketSignal | undefined,
  category: CommodityCategory,
): number {
  if (!signal) return 1;

  const urbanIndex = getCityUrbanIndex(signal);
  return roundTo(
    1 +
      (urbanIndex / 100) *
        CITY_COMMODITY_WEIGHTS[category] *
        ECONOMY_RULES.citySaturationWeight,
    6,
  );
}

/**
 * The supply factor the competitors add to a commodity category.
 *
 * A competitor that undercuts the market (a negative price pressure) adds
 * more effective supply, one that pushes the prices up adds less. Without a
 * competitor signal the factor is exactly 1 and the market behaves exactly as
 * in Stage 05.
 */
export function getCompetitorSupplyFactor(
  signal: CompetitorMarketSignal | undefined,
  category: CommodityCategory,
): number {
  if (!signal) return 1;

  const pressure = clamp(signal.supplyPressure[category] ?? 0, 0, 100);
  const pricePressure = clamp(signal.pricePressure[category] ?? 0, -1, 1);
  const effective = clamp(pressure * (1 - pricePressure), 0, 150);

  return roundTo(1 + (effective / 100) * ECONOMY_RULES.competitorSupplyWeight, 6);
}

/**
 * The demand factor the competitors add to a commodity category.
 */
export function getCompetitorDemandFactor(
  signal: CompetitorMarketSignal | undefined,
  category: CommodityCategory,
): number {
  if (!signal) return 1;

  const pressure = clamp(signal.demandPressure[category] ?? 0, 0, 100);
  const pricePressure = clamp(signal.pricePressure[category] ?? 0, -1, 1);
  const effective = clamp(pressure * (1 + pricePressure), 0, 150);

  return roundTo(1 + (effective / 100) * ECONOMY_RULES.competitorDemandWeight, 6);
}

/**
 * The multiplier an active global event applies to the commodity demand.
 */
export function getEventDemandFactor(
  modifiers: EventEnvironmentModifiers | undefined,
  category: CommodityCategory,
): number {
  if (!modifiers) return 1;
  return clamp(modifiers.commodityDemand[category] ?? 1, 0.5, 2);
}

/**
 * The multiplier an active global event applies to the commodity supply.
 */
export function getEventSupplyFactor(
  modifiers: EventEnvironmentModifiers | undefined,
  category: CommodityCategory,
): number {
  if (!modifiers) return 1;
  return clamp(modifiers.commoditySupply[category] ?? 1, 0.5, 2);
}

function updateCommodity(
  commodity: MarketCommodity,
  hours: number,
  demandFactor: number,
  supplyFactor: number,
  cityFactor = 1,
  citySaturation = 1,
): MarketCommodity {
  const supplyRatio = commodity.supply / commodity.baseSupply;
  const demandRatio = commodity.demand / commodity.baseDemand;

  const supply = Math.max(
    0,
    commodity.supply + commodity.supplyGrowth * hours * supplyRatio * supplyFactor,
  );

  const effectiveDemandFactor = demandFactor * cityFactor;
  const rawDemand =
    commodity.demand + commodity.demandGrowth * hours * demandRatio * effectiveDemandFactor;
  const demandCap =
    commodity.baseDemand * ECONOMY_RULES.demandSaturation * citySaturation;
  const demand = Math.min(Math.max(0, rawDemand), demandCap);

  const total = demand + supply;
  const imbalance = total > 0 ? (demand - supply) / total : 0;

  const targetPrice = commodity.basePrice * (1 + imbalance * ECONOMY_RULES.elasticity);
  const adjustment = (targetPrice - commodity.price) * ECONOMY_RULES.adjustmentRate * hours;
  const price = clamp(commodity.price + adjustment, commodity.priceFloor, commodity.priceCeiling);

  const history = [...commodity.history, price].slice(-ECONOMY_RULES.historyLength);

  return {
    ...commodity,
    supply: roundTo(supply),
    demand: roundTo(demand),
    price: roundTo(price),
    trend: roundTo(price - commodity.price),
    history,
  };
}

/**
 * Updates the economy by one tick.
 *
 * Invalid input is rejected safely: the incoming state is returned unchanged
 * and the failure is logged, so a corrupted economy can never propagate.
 */
export function updateEconomy(state: EconomyState, context: EconomyContext): EconomyState {
  if (!isValidEconomyState(state)) {
    logger.error('Economy Engine rejected an invalid economy state — state left unchanged');
    return state;
  }
  if (
    !context ||
    !isFiniteNumber(context.deltaMs) ||
    context.deltaMs < 0 ||
    !isFiniteNumber(context.marketActivityIndex)
  ) {
    logger.error('Economy Engine rejected an invalid tick context — state left unchanged');
    return state;
  }

  const hours = context.deltaMs / 3_600_000;
  if (hours <= 0) {
    return { ...state, tick: state.tick + 1 };
  }

  const activityFactor =
    1 +
    (clamp(context.marketActivityIndex, 0, 100) / 100) * ECONOMY_RULES.demandActivityWeight;

  // The corporate market signal modulates the commodity supply and demand.
  // Without the signal both factors are exactly 1 and the market behaves
  // exactly as in Stage 02.
  const signal = context.corporateSignal;
  const supplyFactorBase =
    1 +
    (signal ? (clamp(signal.supplyPressure, 0, 100) / 100) * ECONOMY_RULES.corporateSupplyWeight : 0);
  const corporateDemandFactor =
    1 +
    (signal ? (clamp(signal.demandPressure, 0, 100) / 100) * ECONOMY_RULES.corporateDemandWeight : 0);

  // The city signal (Stage 05) raises the demand of the commodities the city
  // consumes. Without the signal every factor is exactly 1 and the market
  // behaves exactly as in Stage 04.
  const citySignal = context.citySignal;

  // The competitor signal (Stage 06) and the active global events modulate
  // the supply and the demand as well. Without them every factor is exactly 1
  // and the market behaves exactly as in Stage 05.
  const competitorSignal = context.competitorSignal;
  const eventModifiers = context.eventModifiers;

  const commodities = state.commodities.map((commodity) => {
    const category = commodity.category;

    const supplyFactor =
      supplyFactorBase *
      getEventSupplyFactor(eventModifiers, category) *
      getCompetitorSupplyFactor(competitorSignal, category);

    const demandFactor =
      activityFactor *
      corporateDemandFactor *
      getEventDemandFactor(eventModifiers, category) *
      getCompetitorDemandFactor(competitorSignal, category) *
      getCityDemandFactor(citySignal, category);

    return updateCommodity(
      commodity,
      hours,
      demandFactor,
      supplyFactor,
      1,
      getCitySaturationFactor(citySignal, category),
    );
  });

  const supplyIndex =
    (commodities.reduce((acc, c) => acc + c.supply / c.baseSupply, 0) /
      commodities.length) *
    100;
  const demandIndex =
    (commodities.reduce((acc, c) => acc + c.demand / c.baseDemand, 0) /
      commodities.length) *
    100;

  return {
    ...state,
    commodities,
    globalSupplyIndex: roundTo(supplyIndex, 2),
    globalDemandIndex: roundTo(demandIndex, 2),
    tick: state.tick + 1,
  };
}
