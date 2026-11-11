/**
 * Market Integration — deterministic sales rules.
 *
 * Sales are a pure function of the market state, the product state, the
 * market activity and the elapsed simulated time. There is no randomness and
 * no guaranteed profit: a high price reduces demand, a low quality reduces
 * demand, and the available inventory caps the sales.
 */

import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import type { CorporateMarketSignal } from '@/simulation/contracts';
import {
  getProductDefinition,
  type ProductInstance,
  type ProductState,
} from '@/simulation/products';
import {
  findListing,
  isValidMarketState,
  type MarketListing,
  type MarketState,
} from './marketState';

/** Elasticity of the demand with respect to the price. */
export const PRICE_ELASTICITY = 1.5;
/** Quality influence: 0.5 at quality 0 up to 1.5 at quality 100. */
export const QUALITY_BASE_FACTOR = 0.5;
/** Quality influence per point of quality. */
export const QUALITY_FACTOR_WEIGHT = 0.01;
/** Upper bound of the price factor. */
export const MAX_PRICE_FACTOR = 2;
/** Sales revenue is recorded in the corporate ledger in batches of this size. */
export const SALE_TRANSACTION_THRESHOLD = 1_000;

export interface SalesContext {
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Aggregate commercial activity of the world, 0..100. */
  marketActivityIndex: number;
  /** Market reach multiplier from the unlocked technologies. */
  marketReach: number;
  /** Simulated time the sale is recorded at. */
  simTimeMs: number;
  /**
   * The market demand modifier of the active global events (Stage 06).
   *
   * Optional: when it is absent the sales behave exactly as in Stage 04.
   */
  eventMarketDemand?: number;
}

/**
 * Potential demand of a product per simulated hour.
 *
 * ```
 * demand = baseDemand
 *        × marketActivity
 *        × qualityFactor
 *        × priceFactor
 *        × marketReach
 * ```
 */
export function getProductDemand(
  product: ProductInstance,
  baseDemand: number,
  context: SalesContext,
): number {
  const qualityFactor =
    QUALITY_BASE_FACTOR + product.quality * QUALITY_FACTOR_WEIGHT;

  const referencePrice = basePriceOf(product);
  const priceFactor =
    product.price > 0 && referencePrice > 0
      ? clamp((referencePrice / product.price) ** PRICE_ELASTICITY, 0, MAX_PRICE_FACTOR)
      : 0;

  const activityFactor = clamp(context.marketActivityIndex / 100, 0, 2);
  const reachFactor = context.marketReach > 0 ? context.marketReach : 1;
  // The active global events may raise or lower the demand of the market.
  const eventFactor = clamp(context.eventMarketDemand ?? 1, 0.5, 2);

  return Math.max(
    0,
    baseDemand * activityFactor * qualityFactor * priceFactor * reachFactor * eventFactor,
  );
}

/**
 * Reference price of a product instance.
 */
function basePriceOf(product: ProductInstance): number {
  const definition = getProductDefinition(product.definitionId);
  return definition ? definition.basePrice : product.price;
}

export interface SalesResult {
  products: ProductState;
  market: MarketState;
  /** Revenue batch that should be recorded in the corporate ledger. */
  revenueToRecord: number;
  /** Units sold per product instance. */
  unitsSold: Record<string, number>;
}

/**
 * Processes the market sales of one tick.
 */
export function processSales(
  products: ProductState,
  market: MarketState,
  context: SalesContext,
): SalesResult {
  if (!isValidMarketState(market)) {
    return { products, market, revenueToRecord: 0, unitsSold: {} };
  }
  if (!isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    return { products, market, revenueToRecord: 0, unitsSold: {} };
  }

  const hours = context.deltaMs / 3_600_000;
  const unitsSold: Record<string, number> = {};
  let revenueToRecord = 0;

  const listings = market.listings.map((listing) => {
    if (!listing.active) {
      return { ...listing, lastTickUnitsSold: 0 };
    }

    const product = products.instances.find(
      (instance) => instance.id === listing.productInstanceId,
    );
    if (!product || product.status !== 'ready' || product.inventory <= 0) {
      return { ...listing, lastTickUnitsSold: 0 };
    }

    const definition = getProductDefinition(product.definitionId);
    if (!definition) return { ...listing, lastTickUnitsSold: 0 };

    const demand = getProductDemand(product, definition.baseDemand, context);
    const pendingDemand = listing.pendingDemand + demand * hours;
    const sold = Math.min(Math.floor(pendingDemand), product.inventory);

    if (sold <= 0) {
      return {
        ...listing,
        pendingDemand: roundTo(pendingDemand, 4),
        lastTickUnitsSold: 0,
      };
    }

    const revenue = roundTo(sold * listing.price, 2);
    const pendingRevenue = roundTo(listing.pendingRevenue + revenue, 2);

    // The corporate ledger is updated in batches so that the transaction list
    // stays readable. The balance only ever changes through a transaction.
    const batch = pendingRevenue >= SALE_TRANSACTION_THRESHOLD ? pendingRevenue : 0;

    unitsSold[product.id] = (unitsSold[product.id] ?? 0) + sold;
    revenueToRecord = roundTo(revenueToRecord + batch, 2);

    return {
      ...listing,
      unitsSold: listing.unitsSold + sold,
      revenue: roundTo(listing.revenue + revenue, 2),
      pendingDemand: roundTo(pendingDemand - sold, 4),
      pendingRevenue: batch > 0 ? 0 : pendingRevenue,
      lastTickUnitsSold: sold,
    };
  });

  const nextMarket: MarketState = { ...market, listings, tick: market.tick + 1 };

  // Apply the sales to the product instances.
  const nextProducts: ProductState = {
    ...products,
    instances: products.instances.map((instance) => {
      const sold = unitsSold[instance.id];
      if (!sold || sold <= 0) return instance;
      return {
        ...instance,
        inventory: roundTo(instance.inventory - sold, 4),
        unitsSold: instance.unitsSold + sold,
        revenue: roundTo(instance.revenue + sold * instance.price, 2),
      };
    }),
    tick: products.tick + 1,
  };

  return { products: nextProducts, market: nextMarket, revenueToRecord, unitsSold };
}

/**
 * Ensures a listing exists for a product.
 */
export function ensureListing(
  market: MarketState,
  productInstanceId: string,
  price: number,
  active: boolean,
): MarketState {
  const existing = findListing(market, productInstanceId);
  if (existing) {
    return {
      ...market,
      listings: market.listings.map((listing) =>
        listing.productInstanceId === productInstanceId
          ? { ...listing, price, active }
          : listing,
      ),
    };
  }

  const listing: MarketListing = {
    productInstanceId,
    price,
    active,
    unitsSold: 0,
    revenue: 0,
    pendingDemand: 0,
    pendingRevenue: 0,
    lastTickUnitsSold: 0,
  };

  return { ...market, listings: [...market.listings, listing] };
}

export interface CorporateSignalInput {
  /** Average productivity of the workforce, 0..100. */
  workforceProductivity: number;
  /** Market reach multiplier from the unlocked technologies. */
  marketReach: number;
  /** Total manufacturing capacity of the corporation. */
  productionCapacity: number;
  /** Number of finished products offered on the market. */
  activeProducts: number;
}

/**
 * Builds the corporate market signal that the Economy Engine consumes.
 */
export function buildCorporateMarketSignal(
  input: CorporateSignalInput,
): CorporateMarketSignal {
  const productivity = clamp(input.workforceProductivity, 0, 100);
  const reach = input.marketReach > 0 ? input.marketReach : 1;

  return {
    demandPressure: clamp(roundTo(productivity * reach, 2), 0, 100),
    supplyPressure: clamp(
      roundTo(input.productionCapacity * 0.8 + input.activeProducts * 5, 2),
      0,
      100,
    ),
    productivity,
  };
}
