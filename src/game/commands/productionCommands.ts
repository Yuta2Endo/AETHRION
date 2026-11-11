/**
 * Production commands — manufacturing facilities and production orders.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import type { FacilityType, Facility, ProductionOrder } from '@/simulation/production';
import {
  assignFacilityEmployees,
  cancelProduction,
  createFacility,
  getFacilityDefinition,
  startProduction,
} from '@/simulation/production';
import { findProductInstance } from '@/simulation/products';
import { releaseResources, reserveResources } from '@/simulation/resources';
import {
  chargeCorporation,
  failure,
  logCommandRejection,
  requireCorporation,
  storeCorporation,
  validateEmployeeAssignment,
} from './shared';

export interface CreateFacilityCommand {
  name: string;
  type: FacilityType;
}

/**
 * Builds a manufacturing facility and charges the construction cost.
 */
export function createFacilityCommand(
  input: CreateFacilityCommand,
): Result<Facility, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const definition = getFacilityDefinition(input.type);
  if (!definition) {
    return failure('FACILITY_UNKNOWN_TYPE', `Unknown facility type "${input.type}".`);
  }

  const created = createFacility(store.production, { name: input.name, type: input.type });
  if (!created.ok) {
    logCommandRejection('createFacility', created.error);
    return created;
  }

  const charged = chargeCorporation(corporation, {
    type: 'production',
    amount: -definition.constructionCost,
    description: `Construction — ${definition.name}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    logCommandRejection('createFacility', charged.error);
    return charged;
  }

  storeCorporation(charged.value);
  store.applyProductionState(created.value.state);

  logger.info('Facility created', { id: created.value.facility.id, type: input.type });
  return { ok: true, value: created.value.facility };
}

/**
 * Assigns employees to a facility.
 */
export function assignFacilityEmployeesCommand(
  facilityId: string,
  employeeIds: string[],
): Result<Facility, AppError> {
  const store = useGameStore.getState();

  const assignment = validateEmployeeAssignment(employeeIds, store.employees.employees);
  if (!assignment.ok) {
    logCommandRejection('assignFacilityEmployees', assignment.error);
    return assignment;
  }

  const assigned = assignFacilityEmployees(store.production, facilityId, employeeIds);
  if (!assigned.ok) {
    logCommandRejection('assignFacilityEmployees', assigned.error);
    return assigned;
  }

  store.applyProductionState(assigned.value.state);
  return { ok: true, value: assigned.value.facility };
}

export interface StartProductionCommand {
  productInstanceId: string;
  facilityId: string;
  quantity: number;
}

/**
 * Starts a production order.
 *
 * The resources are reserved and the operating cost is charged in one
 * atomic step. If anything fails, nothing changes.
 */
export function startProductionCommand(
  input: StartProductionCommand,
): Result<ProductionOrder, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const product = findProductInstance(store.products, input.productInstanceId);
  if (!product) {
    return failure('PRODUCT_NOT_FOUND', `No product with id "${input.productInstanceId}".`);
  }

  const started = startProduction(
    store.production,
    { product, facilityId: input.facilityId, quantity: input.quantity, startedAtSimMs: store.simulation.simTimeMs },
    store.employees.employees,
  );

  if (!started.ok) {
    logCommandRejection('startProduction', started.error);
    return started;
  }

  // Reserve the resources first — the reservation is atomic on its own.
  const reserved = reserveResources(
    store.resources,
    started.value.reservedResources,
    store.simulation.simTimeMs,
  );

  if (!reserved.ok) {
    logCommandRejection('startProduction', reserved.error);
    return reserved;
  }

  const charged = chargeCorporation(corporation, {
    type: 'production',
    amount: -started.value.operatingCost,
    description: `Manufacturing — ${product.name} × ${input.quantity}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    // Roll the reservation back so nothing is left dangling.
    const released = releaseResources(
      reserved.value.state,
      started.value.reservedResources,
      store.simulation.simTimeMs,
    );
    if (released.ok) {
      store.applyResourceState(released.value.state);
    }
    logCommandRejection('startProduction', charged.error);
    return charged;
  }

  storeCorporation(charged.value);
  store.applyResourceState(reserved.value.state);
  store.applyProductionState(started.value.state);

  logger.info('Production started', {
    orderId: started.value.order.id,
    quantity: input.quantity,
    operatingCost: started.value.operatingCost,
  });

  return { ok: true, value: started.value.order };
}

/**
 * Cancels a production order and releases the reserved resources.
 */
export function cancelProductionCommand(orderId: string): Result<ProductionOrder, AppError> {
  const store = useGameStore.getState();

  const cancelled = cancelProduction(store.production, orderId, store.simulation.simTimeMs);
  if (!cancelled.ok) {
    logCommandRejection('cancelProduction', cancelled.error);
    return cancelled;
  }

  const released = releaseResources(
    store.resources,
    cancelled.value.order.reservedResources,
    store.simulation.simTimeMs,
  );

  if (!released.ok) {
    logCommandRejection('cancelProduction', released.error);
    return released;
  }

  store.applyResourceState(released.value.state);
  store.applyProductionState(cancelled.value.state);

  logger.info('Production cancelled', { orderId });
  return { ok: true, value: cancelled.value.order };
}
