/**
 * Economy Engine — public surface.
 * Baseline implementation (Stage 02).
 */

export {
  COMMODITY_CATEGORIES,
  INITIAL_COMMODITIES,
  INITIAL_CURRENCIES,
  createInitialEconomy,
  findCommodity,
  getEconomyMetrics,
  getImbalance,
  isValidEconomyState,
} from './economyState';
export type {
  CommodityCategory,
  CommodityId,
  Currency,
  CurrencyId,
  EconomyMetrics,
  EconomyState,
  MarketCommodity,
} from './economyState';

export { ECONOMY_RULES, updateEconomy } from './economyRules';
export type { EconomyContext } from './economyRules';
