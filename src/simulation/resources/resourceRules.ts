/**
 * Resource & Supply Chain — deterministic rules.
 *
 * Every operation is **atomic**: a failed operation returns the incoming
 * state unchanged. Quantities are never negative and the reserved amount
 * never exceeds the owned amount.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { isFiniteNumber, roundTo } from '@/core/utils';
import type { ResourceId, ResourceRequirement } from '@/simulation/contracts';
import { findCommodity, type EconomyState } from '@/simulation/economy';
import {
  MAX_RESOURCE_TRANSACTIONS,
  RESOURCES,
  findResourceBalance,
  getResourceDefinition,
  isValidResourceState,
  normalizeRequirement,
  type ResourceDefinition,
  type ResourceState,
  type ResourceTransaction,
  type ResourceTransactionType,
} from './resourceState';

function failure<T>(code: string, message: string): Result<T, AppError> {
  return {
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  };
}

/**
 * Current price of one unit of a resource.
 *
 * The price follows the market: it is the base price scaled by the relative
 * price of the linked commodity in the Economy Engine.
 */
export function getResourceUnitPrice(
  definition: ResourceDefinition,
  economy: EconomyState,
): number {
  const commodity = findCommodity(economy, definition.marketCommodityId);
  if (!commodity || commodity.basePrice <= 0) return definition.basePrice;
  const ratio = commodity.price / commodity.basePrice;
  return roundTo(definition.basePrice * ratio, 2);
}

/**
 * Price of every resource, derived from the current market.
 */
export function getResourcePrices(economy: EconomyState): Record<ResourceId, number> {
  const prices = {} as Record<ResourceId, number>;
  for (const definition of RESOURCES) {
    prices[definition.id] = getResourceUnitPrice(definition, economy);
  }
  return prices;
}

/**
 * Quantity that is owned but not reserved.
 */
export function getAvailableQuantity(state: ResourceState, resourceId: ResourceId): number {
  const balance = findResourceBalance(state, resourceId);
  if (!balance) return 0;
  return roundTo(balance.quantity - balance.reserved, 4);
}

/**
 * Total cost of a requirement at the given unit prices.
 */
export function getRequirementCost(
  requirement: ResourceRequirement,
  prices: Record<ResourceId, number>,
): number {
  let total = 0;
  for (const { resourceId, amount } of normalizeRequirement(requirement)) {
    total += (prices[resourceId] ?? 0) * amount;
  }
  return roundTo(total, 2);
}

function appendTransaction(
  state: ResourceState,
  entry: Omit<ResourceTransaction, 'id'>,
): { state: ResourceState; transaction: ResourceTransaction } {
  const sequence = state.sequence + 1;
  const transaction: ResourceTransaction = {
    ...entry,
    id: `rsc_${String(sequence).padStart(5, '0')}`,
  };

  return {
    state: {
      ...state,
      sequence,
      transactions: [...state.transactions, transaction].slice(-MAX_RESOURCE_TRANSACTIONS),
    },
    transaction,
  };
}

/**
 * Purchases a resource from the market.
 *
 * The operation is atomic: the quantity and the financial effect are only
 * applied when both the storage capacity and the funds are sufficient. The
 * caller is responsible for charging the returned cost to the corporation.
 */
export function purchaseResource(
  state: ResourceState,
  input: {
    resourceId: ResourceId;
    quantity: number;
    unitPrice: number;
    /** Available funds; the purchase is rejected when insufficient. */
    availableFunds: number;
    simTimeMs: number;
  },
): Result<{ state: ResourceState; totalCost: number; transaction: ResourceTransaction }, AppError> {
  if (!isValidResourceState(state)) {
    return failure('RESOURCE_INVALID_STATE', 'The resource state is invalid.');
  }

  const definition = getResourceDefinition(input.resourceId);
  if (!definition) {
    return failure('RESOURCE_UNKNOWN', `Unknown resource "${input.resourceId}".`);
  }
  if (!isFiniteNumber(input.quantity) || input.quantity <= 0) {
    return failure('RESOURCE_INVALID_QUANTITY', 'The purchase quantity must be positive.');
  }
  if (!isFiniteNumber(input.unitPrice) || input.unitPrice < 0) {
    return failure('RESOURCE_INVALID_PRICE', 'The unit price is invalid.');
  }

  const balance = findResourceBalance(state, input.resourceId);
  if (!balance) {
    return failure('RESOURCE_MISSING_BALANCE', `No balance for "${input.resourceId}".`);
  }

  const quantity = roundTo(input.quantity, 4);
  if (balance.quantity + quantity > definition.maxStorage) {
    return failure(
      'RESOURCE_CAPACITY_EXCEEDED',
      `Storage for ${definition.name} is limited to ${definition.maxStorage} ${definition.unit}.`,
    );
  }

  const totalCost = roundTo(quantity * input.unitPrice, 2);
  if (totalCost > input.availableFunds) {
    return failure(
      'RESOURCE_INSUFFICIENT_FUNDS',
      `The purchase costs ${totalCost} but only ${input.availableFunds} is available.`,
    );
  }

  const updatedBalance = {
    ...balance,
    quantity: roundTo(balance.quantity + quantity, 4),
    lifetimeAcquired: roundTo(balance.lifetimeAcquired + quantity, 4),
  };

  const withBalance: ResourceState = {
    ...state,
    balances: state.balances.map((candidate) =>
      candidate.resourceId === input.resourceId ? updatedBalance : candidate,
    ),
  };

  const { state: next, transaction } = appendTransaction(withBalance, {
    resourceId: input.resourceId,
    type: 'purchase',
    quantity,
    unitPrice: input.unitPrice,
    totalCost,
    balanceAfter: updatedBalance.quantity,
    reservedAfter: updatedBalance.reserved,
    simTimeMs: input.simTimeMs,
  });

  return { ok: true, value: { state: next, totalCost, transaction } };
}

/**
 * Reserves resources for a production order.
 *
 * A reservation never changes the owned quantity — only the reserved part.
 */
export function reserveResources(
  state: ResourceState,
  requirement: ResourceRequirement,
  simTimeMs: number,
): Result<{ state: ResourceState; reserved: ResourceRequirement }, AppError> {
  if (!isValidResourceState(state)) {
    return failure('RESOURCE_INVALID_STATE', 'The resource state is invalid.');
  }

  const entries = normalizeRequirement(requirement);
  if (entries.length === 0) {
    return { ok: true, value: { state, reserved: {} } };
  }

  // Validate every resource before applying anything — atomic.
  for (const { resourceId, amount } of entries) {
    const balance = findResourceBalance(state, resourceId);
    if (!balance) {
      return failure('RESOURCE_UNKNOWN', `Unknown resource "${resourceId}".`);
    }
    if (getAvailableQuantity(state, resourceId) < amount) {
      return failure(
        'RESOURCE_INSUFFICIENT',
        `Not enough ${resourceId} available to reserve ${amount}.`,
      );
    }
  }

  let next = state;
  for (const { resourceId, amount } of entries) {
    const balance = findResourceBalance(next, resourceId)!;
    const updated = { ...balance, reserved: roundTo(balance.reserved + amount, 4) };
    next = {
      ...next,
      balances: next.balances.map((candidate) =>
        candidate.resourceId === resourceId ? updated : candidate,
      ),
    };
    const appended = appendTransaction(next, {
      resourceId,
      type: 'reserve',
      quantity: 0,
      unitPrice: 0,
      totalCost: 0,
      balanceAfter: updated.quantity,
      reservedAfter: updated.reserved,
      simTimeMs,
    });
    next = appended.state;
  }

  return { ok: true, value: { state: next, reserved: requirement } };
}

/**
 * Releases a reservation without consuming the resources.
 */
export function releaseResources(
  state: ResourceState,
  requirement: ResourceRequirement,
  simTimeMs: number,
): Result<{ state: ResourceState }, AppError> {
  if (!isValidResourceState(state)) {
    return failure('RESOURCE_INVALID_STATE', 'The resource state is invalid.');
  }

  const entries = normalizeRequirement(requirement);

  for (const { resourceId, amount } of entries) {
    const balance = findResourceBalance(state, resourceId);
    if (!balance) {
      return failure('RESOURCE_UNKNOWN', `Unknown resource "${resourceId}".`);
    }
    if (balance.reserved < amount) {
      return failure(
        'RESOURCE_NOT_RESERVED',
        `Only ${balance.reserved} of ${resourceId} are reserved.`,
      );
    }
  }

  let next = state;
  for (const { resourceId, amount } of entries) {
    const balance = findResourceBalance(next, resourceId)!;
    const updated = { ...balance, reserved: roundTo(balance.reserved - amount, 4) };
    next = {
      ...next,
      balances: next.balances.map((candidate) =>
        candidate.resourceId === resourceId ? updated : candidate,
      ),
    };
    const appended = appendTransaction(next, {
      resourceId,
      type: 'release',
      quantity: 0,
      unitPrice: 0,
      totalCost: 0,
      balanceAfter: updated.quantity,
      reservedAfter: updated.reserved,
      simTimeMs,
    });
    next = appended.state;
  }

  return { ok: true, value: { state: next } };
}

/**
 * Consumes reserved resources — the resources leave the inventory.
 */
export function consumeResources(
  state: ResourceState,
  requirement: ResourceRequirement,
  simTimeMs: number,
): Result<{ state: ResourceState; consumed: ResourceRequirement }, AppError> {
  if (!isValidResourceState(state)) {
    return failure('RESOURCE_INVALID_STATE', 'The resource state is invalid.');
  }

  const entries = normalizeRequirement(requirement);

  for (const { resourceId, amount } of entries) {
    const balance = findResourceBalance(state, resourceId);
    if (!balance) {
      return failure('RESOURCE_UNKNOWN', `Unknown resource "${resourceId}".`);
    }
    if (balance.reserved < amount || balance.quantity < amount) {
      return failure(
        'RESOURCE_NOT_RESERVED',
        `Cannot consume ${amount} of ${resourceId}.`,
      );
    }
  }

  let next = state;
  for (const { resourceId, amount } of entries) {
    const balance = findResourceBalance(next, resourceId)!;
    const updated = {
      ...balance,
      quantity: roundTo(balance.quantity - amount, 4),
      reserved: roundTo(balance.reserved - amount, 4),
      lifetimeConsumed: roundTo(balance.lifetimeConsumed + amount, 4),
    };
    next = {
      ...next,
      balances: next.balances.map((candidate) =>
        candidate.resourceId === resourceId ? updated : candidate,
      ),
    };
    const appended = appendTransaction(next, {
      resourceId,
      type: 'consume',
      quantity: -amount,
      unitPrice: 0,
      totalCost: 0,
      balanceAfter: updated.quantity,
      reservedAfter: updated.reserved,
      simTimeMs,
    });
    next = appended.state;
  }

  return { ok: true, value: { state: next, consumed: requirement } };
}

/**
 * Adds a resource quantity to the inventory without a financial effect.
 * Used when finished goods enter the inventory.
 */
export function addResource(
  state: ResourceState,
  resourceId: ResourceId,
  quantity: number,
): Result<{ state: ResourceState }, AppError> {
  if (!isFiniteNumber(quantity) || quantity <= 0) {
    return failure('RESOURCE_INVALID_QUANTITY', 'The quantity must be positive.');
  }
  const definition = getResourceDefinition(resourceId);
  const balance = findResourceBalance(state, resourceId);
  if (!definition || !balance) {
    return failure('RESOURCE_UNKNOWN', `Unknown resource "${resourceId}".`);
  }
  if (balance.quantity + quantity > definition.maxStorage) {
    return failure(
      'RESOURCE_CAPACITY_EXCEEDED',
      `Storage for ${definition.name} is limited to ${definition.maxStorage} ${definition.unit}.`,
    );
  }

  const updated = {
    ...balance,
    quantity: roundTo(balance.quantity + quantity, 4),
    lifetimeAcquired: roundTo(balance.lifetimeAcquired + quantity, 4),
  };

  return {
    ok: true,
    value: {
      state: {
        ...state,
        balances: state.balances.map((candidate) =>
          candidate.resourceId === resourceId ? updated : candidate,
        ),
      },
    },
  };
}

/**
 * Removes a resource quantity from the inventory without a financial effect.
 */
export function removeResource(
  state: ResourceState,
  resourceId: ResourceId,
  quantity: number,
): Result<{ state: ResourceState }, AppError> {
  if (!isFiniteNumber(quantity) || quantity <= 0) {
    return failure('RESOURCE_INVALID_QUANTITY', 'The quantity must be positive.');
  }
  const balance = findResourceBalance(state, resourceId);
  if (!balance) {
    return failure('RESOURCE_UNKNOWN', `Unknown resource "${resourceId}".`);
  }
  if (balance.quantity < quantity) {
    return failure('RESOURCE_INSUFFICIENT', `Only ${balance.quantity} of ${resourceId} are held.`);
  }

  const updated = { ...balance, quantity: roundTo(balance.quantity - quantity, 4) };

  return {
    ok: true,
    value: {
      state: {
        ...state,
        balances: state.balances.map((candidate) =>
          candidate.resourceId === resourceId ? updated : candidate,
        ),
      },
    },
  };
}

/**
 * Advances the resource state.
 *
 * Resources have no autonomous per-tick evolution — they change through
 * purchases, reservations and consumption. The tick only keeps the state
 * counter in sync and rejects an invalid state.
 */
export function advanceResources(
  state: ResourceState,
  context: { tick: number; deltaMs: number },
): ResourceState {
  if (!isValidResourceState(state)) {
    logger.error('Resource Engine rejected an invalid resource state — state left unchanged');
    return state;
  }
  if (!isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    logger.error('Resource Engine rejected an invalid tick context — state left unchanged');
    return state;
  }
  return { ...state, tick: state.tick + 1 };
}

export type { ResourceTransactionType };
