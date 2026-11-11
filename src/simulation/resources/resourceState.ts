/**
 * Resource & Supply Chain — data model.
 *
 * Resources are the physical inputs of production. Every resource is priced
 * from the Economy Engine, so a resource price follows the market trend of the
 * commodity it is linked to.
 */

import { isFiniteNumber } from '@/core/utils';
import type { ResourceId, ResourceRequirement } from '@/simulation/contracts';

export type ResourceCategory =
  | 'raw'
  | 'metal'
  | 'electronic'
  | 'energy'
  | 'component'
  | 'advanced'
  | 'data'
  | 'chemical';

export interface ResourceDefinition {
  id: ResourceId;
  name: string;
  category: ResourceCategory;
  /** Market commodity whose price trend drives this resource. */
  marketCommodityId: string;
  /** Price of one unit at the reference commodity price. */
  basePrice: number;
  /** Display unit. */
  unit: string;
  /** Maximum quantity the corporation may hold. */
  maxStorage: number;
}

export const RESOURCES: readonly ResourceDefinition[] = [
  {
    id: 'raw-materials',
    name: 'Raw Materials',
    category: 'raw',
    marketCommodityId: 'orbital-freight',
    basePrice: 40,
    unit: 't',
    maxStorage: 10_000,
  },
  {
    id: 'metals',
    name: 'Metals',
    category: 'metal',
    marketCommodityId: 'nano-lattice',
    basePrice: 120,
    unit: 't',
    maxStorage: 10_000,
  },
  {
    id: 'electronics',
    name: 'Electronics',
    category: 'electronic',
    marketCommodityId: 'quantum-core',
    basePrice: 260,
    unit: 'u',
    maxStorage: 5_000,
  },
  {
    id: 'energy',
    name: 'Energy',
    category: 'energy',
    marketCommodityId: 'helion-cell',
    basePrice: 55,
    unit: 'MWh',
    maxStorage: 20_000,
  },
  {
    id: 'components',
    name: 'Components',
    category: 'component',
    marketCommodityId: 'quantum-core',
    basePrice: 180,
    unit: 'u',
    maxStorage: 5_000,
  },
  {
    id: 'advanced-materials',
    name: 'Advanced Materials',
    category: 'advanced',
    marketCommodityId: 'nano-lattice',
    basePrice: 420,
    unit: 't',
    maxStorage: 2_500,
  },
  {
    id: 'research-data',
    name: 'Research Data',
    category: 'data',
    marketCommodityId: 'quantum-core',
    basePrice: 90,
    unit: 'TB',
    maxStorage: 4_000,
  },
  {
    id: 'industrial-chemicals',
    name: 'Industrial Chemicals',
    category: 'chemical',
    marketCommodityId: 'helion-cell',
    basePrice: 70,
    unit: 'L',
    maxStorage: 8_000,
  },
];

export interface ResourceBalance {
  resourceId: ResourceId;
  /** Total quantity owned. */
  quantity: number;
  /** Quantity reserved for production orders. */
  reserved: number;
  /** Lifetime quantity acquired. */
  lifetimeAcquired: number;
  /** Lifetime quantity consumed by manufacturing. */
  lifetimeConsumed: number;
}

export type ResourceTransactionType = 'purchase' | 'consume' | 'reserve' | 'release';

export interface ResourceTransaction {
  id: string;
  resourceId: ResourceId;
  type: ResourceTransactionType;
  /** Signed quantity: positive is an acquisition, negative a consumption. */
  quantity: number;
  /** Unit price at the time of the transaction. */
  unitPrice: number;
  /** Signed total cost: positive is money spent, negative money received. */
  totalCost: number;
  /** Owned quantity after the transaction. */
  balanceAfter: number;
  /** Reserved quantity after the transaction. */
  reservedAfter: number;
  simTimeMs: number;
}

export interface ResourceState {
  balances: ResourceBalance[];
  transactions: ResourceTransaction[];
  sequence: number;
  tick: number;
}

/** Maximum number of resource transactions kept in the ledger. */
export const MAX_RESOURCE_TRANSACTIONS = 50;

export function createInitialResourceState(): ResourceState {
  return {
    balances: RESOURCES.map((resource) => ({
      resourceId: resource.id,
      quantity: 0,
      reserved: 0,
      lifetimeAcquired: 0,
      lifetimeConsumed: 0,
    })),
    transactions: [],
    sequence: 0,
    tick: 0,
  };
}

export function getResourceDefinition(id: ResourceId): ResourceDefinition | undefined {
  return RESOURCES.find((resource) => resource.id === id);
}

export function findResourceBalance(
  state: ResourceState,
  id: ResourceId,
): ResourceBalance | undefined {
  return state.balances.find((balance) => balance.resourceId === id);
}

export function isValidResourceState(state: ResourceState): boolean {
  if (!state || !Array.isArray(state.balances)) return false;
  if (!Array.isArray(state.transactions)) return false;
  if (state.transactions.length > MAX_RESOURCE_TRANSACTIONS) return false;
  if (!isFiniteNumber(state.sequence) || state.sequence < 0) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;

  const ids = new Set<ResourceId>();
  for (const balance of state.balances) {
    if (!balance || typeof balance.resourceId !== 'string') return false;
    if (ids.has(balance.resourceId)) return false;
    ids.add(balance.resourceId);
    if (!isFiniteNumber(balance.quantity) || balance.quantity < 0) return false;
    if (!isFiniteNumber(balance.reserved) || balance.reserved < 0) return false;
    if (balance.reserved > balance.quantity) return false;
    if (!isFiniteNumber(balance.lifetimeAcquired) || balance.lifetimeAcquired < 0) return false;
    if (!isFiniteNumber(balance.lifetimeConsumed) || balance.lifetimeConsumed < 0) return false;
  }

  for (const transaction of state.transactions) {
    if (!transaction || typeof transaction.id !== 'string') return false;
    if (!isFiniteNumber(transaction.quantity)) return false;
    if (!isFiniteNumber(transaction.unitPrice) || transaction.unitPrice < 0) return false;
    if (!isFiniteNumber(transaction.totalCost)) return false;
    if (!isFiniteNumber(transaction.balanceAfter) || transaction.balanceAfter < 0) return false;
    if (!isFiniteNumber(transaction.reservedAfter) || transaction.reservedAfter < 0) return false;
  }

  return true;
}

/**
 * Sums a requirement into a flat list of resource amounts.
 */
export function normalizeRequirement(
  requirement: ResourceRequirement,
): Array<{ resourceId: ResourceId; amount: number }> {
  return Object.entries(requirement)
    .filter(([, amount]) => isFiniteNumber(amount) && amount > 0)
    .map(([resourceId, amount]) => ({ resourceId: resourceId as ResourceId, amount }));
}
