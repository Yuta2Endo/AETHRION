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
import type { CorporateMarketSignal } from '@/simulation/contracts';
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
} as const;

function updateCommodity(
  commodity: MarketCommodity,
  hours: number,
  demandFactor: number,
  supplyFactor: number,
): MarketCommodity {
  const supplyRatio = commodity.supply / commodity.baseSupply;
  const demandRatio = commodity.demand / commodity.baseDemand;

  const supply = Math.max(
    0,
    commodity.supply + commodity.supplyGrowth * hours * supplyRatio * supplyFactor,
  );

  const rawDemand =
    commodity.demand + commodity.demandGrowth * hours * demandRatio * demandFactor;
  const demand = Math.min(
    Math.max(0, rawDemand),
    commodity.baseDemand * ECONOMY_RULES.demandSaturation,
  );

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
  const supplyFactor =
    1 +
    (signal ? (clamp(signal.supplyPressure, 0, 100) / 100) * ECONOMY_RULES.corporateSupplyWeight : 0);
  const corporateDemandFactor =
    1 +
    (signal ? (clamp(signal.demandPressure, 0, 100) / 100) * ECONOMY_RULES.corporateDemandWeight : 0);

  const commodities = state.commodities.map((commodity) =>
    updateCommodity(
      commodity,
      hours,
      activityFactor * corporateDemandFactor,
      supplyFactor,
    ),
  );

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
