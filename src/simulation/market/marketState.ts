/**
 * Market Integration — data model.
 *
 * A listing is the corporation's offer of one finished product on the market.
 */

import { isFiniteNumber } from '@/core/utils';

export interface MarketListing {
  productInstanceId: string;
  /** Current price per unit. */
  price: number;
  /** Whether the product is offered. */
  active: boolean;
  /** Lifetime units sold. */
  unitsSold: number;
  /** Lifetime sales revenue. */
  revenue: number;
  /** Accumulated fractional demand that has not been converted into units yet. */
  pendingDemand: number;
  /** Revenue that has not been recorded in the corporate ledger yet. */
  pendingRevenue: number;
  /** Units sold during the last tick. */
  lastTickUnitsSold: number;
}

export interface MarketState {
  listings: MarketListing[];
  tick: number;
}

export function createInitialMarketState(): MarketState {
  return {
    listings: [],
    tick: 0,
  };
}

export function findListing(
  state: MarketState,
  productInstanceId: string,
): MarketListing | undefined {
  return state.listings.find((listing) => listing.productInstanceId === productInstanceId);
}

export function isValidMarketState(state: MarketState): boolean {
  if (!state || !Array.isArray(state.listings)) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;

  const ids = new Set<string>();
  for (const listing of state.listings) {
    if (!listing || typeof listing.productInstanceId !== 'string') return false;
    if (ids.has(listing.productInstanceId)) return false;
    ids.add(listing.productInstanceId);
    if (!isFiniteNumber(listing.price) || listing.price < 0) return false;
    if (!isFiniteNumber(listing.unitsSold) || listing.unitsSold < 0) return false;
    if (!isFiniteNumber(listing.revenue) || listing.revenue < 0) return false;
    if (!isFiniteNumber(listing.pendingDemand) || listing.pendingDemand < 0) return false;
    if (!isFiniteNumber(listing.pendingRevenue) || listing.pendingRevenue < 0) return false;
  }

  return true;
}
