/**
 * Market Integration — public surface.
 * Stage 04 implementation.
 */

export {
  createInitialMarketState,
  findListing,
  isValidMarketState,
} from './marketState';
export type { MarketListing, MarketState } from './marketState';

export {
  MAX_PRICE_FACTOR,
  PRICE_ELASTICITY,
  QUALITY_BASE_FACTOR,
  QUALITY_FACTOR_WEIGHT,
  SALE_TRANSACTION_THRESHOLD,
  buildCorporateMarketSignal,
  ensureListing,
  getProductDemand,
  processSales,
} from './marketRules';
export type { CorporateSignalInput, SalesContext, SalesResult } from './marketRules';
