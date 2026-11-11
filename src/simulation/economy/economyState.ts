/**
 * Economy Engine — market state definition and initial configuration.
 *
 * Defines currencies, market commodities, prices and supply/demand
 * indicators. No UI, rendering or React dependency.
 */

import { isFiniteNumber } from '@/core/utils';

export type CurrencyId = string;
export type CommodityId = string;

/** Category of a traded commodity. */
export type CommodityCategory = 'compute' | 'energy' | 'materials' | 'logistics';

export interface Currency {
  id: CurrencyId;
  name: string;
  symbol: string;
  /** Reference value against the base currency. */
  baseValue: number;
  /** Fraction of the economy able to hold this currency, 0..1. */
  liquidity: number;
}

export interface MarketCommodity {
  id: CommodityId;
  name: string;
  category: CommodityCategory;
  /** Reference price used as the equilibrium anchor. */
  basePrice: number;
  /** Current market price. */
  price: number;
  /** Current supply, in units. */
  supply: number;
  /** Current demand, in units. */
  demand: number;
  /** Reference supply, used to compute the global supply index. */
  baseSupply: number;
  /** Reference demand, used to compute the global demand index. */
  baseDemand: number;
  /** Supply change per simulated hour. */
  supplyGrowth: number;
  /** Demand change per simulated hour. */
  demandGrowth: number;
  /** Lowest price the market may reach. */
  priceFloor: number;
  /** Highest price the market may reach. */
  priceCeiling: number;
  /** Price change produced by the last tick (signed). */
  trend: number;
  /** Bounded history of recent prices. */
  history: number[];
}

export interface EconomyState {
  currencies: Currency[];
  commodities: MarketCommodity[];
  /** Aggregate supply index, 100 = at reference level. */
  globalSupplyIndex: number;
  /** Aggregate demand index, 100 = at reference level. */
  globalDemandIndex: number;
  /** Number of economy ticks processed. */
  tick: number;
}

/** Aggregate market indicators. */
export interface EconomyMetrics {
  commodityCount: number;
  totalMarketValue: number;
  /** Average price change across commodities, in percent. */
  averagePriceChange: number;
  /** Average supply/demand imbalance, -1..1. */
  averageImbalance: number;
  globalSupplyIndex: number;
  globalDemandIndex: number;
}

export const COMMODITY_CATEGORIES: readonly CommodityCategory[] = [
  'compute',
  'energy',
  'materials',
  'logistics',
];

export const INITIAL_CURRENCIES: readonly Currency[] = [
  { id: 'aeth', name: 'Aether Credits', symbol: 'AΞ', baseValue: 1, liquidity: 0.94 },
  { id: 'volt', name: 'Volt Standard', symbol: 'V', baseValue: 0.18, liquidity: 0.61 },
];

export const INITIAL_COMMODITIES: readonly MarketCommodity[] = [
  {
    id: 'quantum-core',
    name: 'Quantum Core',
    category: 'compute',
    basePrice: 4200,
    price: 4200,
    supply: 820,
    demand: 780,
    baseSupply: 820,
    baseDemand: 780,
    supplyGrowth: 14,
    demandGrowth: 18,
    priceFloor: 2100,
    priceCeiling: 8400,
    trend: 0,
    history: [4200],
  },
  {
    id: 'helion-cell',
    name: 'Helion Cell',
    category: 'energy',
    basePrice: 950,
    price: 950,
    supply: 2400,
    demand: 2250,
    baseSupply: 2400,
    baseDemand: 2250,
    supplyGrowth: 26,
    demandGrowth: 21,
    priceFloor: 475,
    priceCeiling: 1900,
    trend: 0,
    history: [950],
  },
  {
    id: 'nano-lattice',
    name: 'Nano Lattice',
    category: 'materials',
    basePrice: 1750,
    price: 1750,
    supply: 640,
    demand: 700,
    baseSupply: 640,
    baseDemand: 700,
    supplyGrowth: 11,
    demandGrowth: 24,
    priceFloor: 875,
    priceCeiling: 3500,
    trend: 0,
    history: [1750],
  },
  {
    id: 'orbital-freight',
    name: 'Orbital Freight',
    category: 'logistics',
    basePrice: 620,
    price: 620,
    supply: 1150,
    demand: 980,
    baseSupply: 1150,
    baseDemand: 980,
    supplyGrowth: 19,
    demandGrowth: 9,
    priceFloor: 310,
    priceCeiling: 1240,
    trend: 0,
    history: [620],
  },
];

/**
 * Creates the initial economy state.
 */
export function createInitialEconomy(): EconomyState {
  return {
    currencies: INITIAL_CURRENCIES.map((currency) => ({ ...currency })),
    commodities: INITIAL_COMMODITIES.map((commodity) => ({
      ...commodity,
      history: [...commodity.history],
    })),
    globalSupplyIndex: 100,
    globalDemandIndex: 100,
    tick: 0,
  };
}

/**
 * Validates an economy state.
 * Invalid states are rejected before they can corrupt the simulation.
 */
export function isValidEconomyState(state: EconomyState): boolean {
  if (!state || !Array.isArray(state.currencies) || state.currencies.length === 0) return false;
  if (!Array.isArray(state.commodities) || state.commodities.length === 0) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;
  if (!isFiniteNumber(state.globalSupplyIndex) || !isFiniteNumber(state.globalDemandIndex)) {
    return false;
  }

  const currencyIds = new Set<CurrencyId>();
  for (const currency of state.currencies) {
    if (!currency || typeof currency.id !== 'string' || currency.id.length === 0) return false;
    if (currencyIds.has(currency.id)) return false;
    currencyIds.add(currency.id);
    if (typeof currency.name !== 'string' || currency.name.length === 0) return false;
    if (typeof currency.symbol !== 'string' || currency.symbol.length === 0) return false;
    if (!isFiniteNumber(currency.baseValue) || currency.baseValue <= 0) return false;
    if (!isFiniteNumber(currency.liquidity) || currency.liquidity < 0 || currency.liquidity > 1) {
      return false;
    }
  }

  const commodityIds = new Set<CommodityId>();
  for (const commodity of state.commodities) {
    if (!commodity || typeof commodity.id !== 'string' || commodity.id.length === 0) return false;
    if (commodityIds.has(commodity.id)) return false;
    commodityIds.add(commodity.id);

    if (typeof commodity.name !== 'string' || commodity.name.length === 0) return false;
    if (!COMMODITY_CATEGORIES.includes(commodity.category)) return false;
    if (!isFiniteNumber(commodity.basePrice) || commodity.basePrice <= 0) return false;
    if (!isFiniteNumber(commodity.price)) return false;
    if (commodity.price < commodity.priceFloor || commodity.price > commodity.priceCeiling) {
      return false;
    }
    if (!isFiniteNumber(commodity.priceFloor) || !isFiniteNumber(commodity.priceCeiling)) return false;
    if (commodity.priceFloor >= commodity.priceCeiling) return false;
    if (!isFiniteNumber(commodity.supply) || commodity.supply < 0) return false;
    if (!isFiniteNumber(commodity.demand) || commodity.demand < 0) return false;
    if (!isFiniteNumber(commodity.baseSupply) || commodity.baseSupply <= 0) return false;
    if (!isFiniteNumber(commodity.baseDemand) || commodity.baseDemand <= 0) return false;
    if (!isFiniteNumber(commodity.supplyGrowth)) return false;
    if (!isFiniteNumber(commodity.demandGrowth)) return false;
    if (!isFiniteNumber(commodity.trend)) return false;
    if (!Array.isArray(commodity.history)) return false;
    if (!commodity.history.every((value) => isFiniteNumber(value))) return false;
  }

  return true;
}

/**
 * Finds a commodity by its stable identifier.
 */
export function findCommodity(state: EconomyState, id: CommodityId): MarketCommodity | undefined {
  return state.commodities.find((commodity) => commodity.id === id);
}

/**
 * Supply / demand imbalance of a commodity, -1..1.
 * Positive means demand exceeds supply (upward price pressure).
 */
export function getImbalance(commodity: MarketCommodity): number {
  const total = commodity.demand + commodity.supply;
  if (total <= 0) return 0;
  return (commodity.demand - commodity.supply) / total;
}

/**
 * Computes aggregate market indicators.
 */
export function getEconomyMetrics(state: EconomyState): EconomyMetrics {
  const count = state.commodities.length;
  if (count === 0) {
    return {
      commodityCount: 0,
      totalMarketValue: 0,
      averagePriceChange: 0,
      averageImbalance: 0,
      globalSupplyIndex: state.globalSupplyIndex,
      globalDemandIndex: state.globalDemandIndex,
    };
  }

  let totalMarketValue = 0;
  let totalChange = 0;
  let totalImbalance = 0;

  for (const commodity of state.commodities) {
    totalMarketValue += commodity.price * commodity.supply;
    const previous = commodity.history.length > 1 ? commodity.history[commodity.history.length - 2] : commodity.price;
    const change = previous !== 0 ? ((commodity.price - previous) / previous) * 100 : 0;
    totalChange += change;
    totalImbalance += getImbalance(commodity);
  }

  return {
    commodityCount: count,
    totalMarketValue: Math.round(totalMarketValue * 100) / 100,
    averagePriceChange: Math.round((totalChange / count) * 1000) / 1000,
    averageImbalance: Math.round((totalImbalance / count) * 1000) / 1000,
    globalSupplyIndex: state.globalSupplyIndex,
    globalDemandIndex: state.globalDemandIndex,
  };
}
