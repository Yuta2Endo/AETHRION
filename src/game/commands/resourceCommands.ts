/**
 * Resource commands.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import type { ResourceId } from '@/simulation/contracts';
import {
  getResourceDefinition,
  getResourceUnitPrice,
  purchaseResource,
} from '@/simulation/resources';
import {
  chargeCorporation,
  failure,
  logCommandRejection,
  requireCorporation,
  storeCorporation,
} from './shared';

export interface PurchaseResourceCommand {
  resourceId: ResourceId;
  quantity: number;
}

/**
 * Purchases a resource from the market and charges the corporation.
 *
 * The operation is atomic: either the quantity is delivered and the money is
 * deducted, or nothing changes at all.
 */
export function purchaseResourceCommand(
  input: PurchaseResourceCommand,
): Result<number, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const definition = getResourceDefinition(input.resourceId);
  if (!definition) {
    return failure('RESOURCE_UNKNOWN', `Unknown resource "${input.resourceId}".`);
  }

  const unitPrice = getResourceUnitPrice(definition, store.economy);

  const purchase = purchaseResource(store.resources, {
    resourceId: input.resourceId,
    quantity: input.quantity,
    unitPrice,
    availableFunds: corporation.finances.balance,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!purchase.ok) {
    logCommandRejection('purchaseResource', purchase.error);
    return purchase;
  }

  const charged = chargeCorporation(corporation, {
    type: 'resource',
    amount: -purchase.value.totalCost,
    description: `Purchase — ${definition.name} × ${input.quantity}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    logCommandRejection('purchaseResource', charged.error);
    return charged;
  }

  storeCorporation(charged.value);
  store.applyResourceState(purchase.value.state);

  logger.info('Resource purchased', {
    resourceId: input.resourceId,
    quantity: input.quantity,
    cost: purchase.value.totalCost,
  });

  return { ok: true, value: purchase.value.totalCost };
}
