/**
 * Product development commands.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import {
  assignDevelopmentEmployees,
  getProductDefinition,
  setProductPrice,
  setProductSalesActive,
  startDevelopment,
  type ProductInstance,
} from '@/simulation/products';
import { ensureListing } from '@/simulation/market';
import {
  chargeCorporation,
  failure,
  logCommandRejection,
  requireCorporation,
  storeCorporation,
  validateEmployeeAssignment,
} from './shared';

export interface StartProductDevelopmentCommand {
  definitionId: string;
  employeeIds: string[];
}

/**
 * Starts a product development project and charges the development cost.
 */
export function startProductDevelopmentCommand(
  input: StartProductDevelopmentCommand,
): Result<ProductInstance, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const definition = getProductDefinition(input.definitionId);
  if (!definition) {
    return failure('PRODUCT_UNKNOWN', `Unknown product "${input.definitionId}".`);
  }

  const assignment = validateEmployeeAssignment(input.employeeIds, store.employees.employees);
  if (!assignment.ok) {
    logCommandRejection('startProductDevelopment', assignment.error);
    return assignment;
  }

  const started = startDevelopment(store.products, store.technology, {
    definitionId: input.definitionId,
    assignedEmployeeIds: input.employeeIds,
    createdAtSimMs: store.simulation.simTimeMs,
  });

  if (!started.ok) {
    logCommandRejection('startProductDevelopment', started.error);
    return started;
  }

  const charged = chargeCorporation(corporation, {
    type: 'development',
    amount: -definition.developmentCost,
    description: `Development — ${definition.name}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    logCommandRejection('startProductDevelopment', charged.error);
    return charged;
  }

  storeCorporation(charged.value);
  store.applyProductState(started.value.state);

  logger.info('Product development started', {
    definitionId: definition.id,
    cost: definition.developmentCost,
  });

  return { ok: true, value: started.value.instance };
}

/**
 * Assigns additional employees to a running development project.
 */
export function assignProductEmployeesCommand(
  instanceId: string,
  employeeIds: string[],
): Result<ProductInstance, AppError> {
  const store = useGameStore.getState();

  const assignment = validateEmployeeAssignment(employeeIds, store.employees.employees);
  if (!assignment.ok) {
    logCommandRejection('assignProductEmployees', assignment.error);
    return assignment;
  }

  const assigned = assignDevelopmentEmployees(store.products, instanceId, employeeIds);
  if (!assigned.ok) {
    logCommandRejection('assignProductEmployees', assigned.error);
    return assigned;
  }

  store.applyProductState(assigned.value.state);
  return { ok: true, value: assigned.value.instance };
}

/**
 * Adjusts the market price of a product.
 */
export function setProductPriceCommand(
  instanceId: string,
  price: number,
): Result<ProductInstance, AppError> {
  const store = useGameStore.getState();

  const updated = setProductPrice(store.products, instanceId, price);
  if (!updated.ok) {
    logCommandRejection('setProductPrice', updated.error);
    return updated;
  }

  store.applyProductState(updated.value.state);
  store.applyMarketState({
    ...store.market,
    listings: store.market.listings.map((listing) =>
      listing.productInstanceId === instanceId
        ? { ...listing, price: updated.value.instance.price }
        : listing,
    ),
  });

  return { ok: true, value: updated.value.instance };
}

/**
 * Activates or deactivates the market sale of a finished product.
 */
export function setProductSalesActiveCommand(
  instanceId: string,
  active: boolean,
): Result<ProductInstance, AppError> {
  const store = useGameStore.getState();

  const updated = setProductSalesActive(store.products, instanceId, active);
  if (!updated.ok) {
    logCommandRejection('setProductSalesActive', updated.error);
    return updated;
  }

  store.applyProductState(updated.value.state);
  store.applyMarketState(
    ensureListing(
      store.market,
      instanceId,
      updated.value.instance.price,
      active,
    ),
  );

  return { ok: true, value: updated.value.instance };
}
