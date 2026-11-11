/**
 * Production Engine — deterministic rules.
 *
 * All production arithmetic is a pure function of the state, the workforce and
 * the elapsed simulated time. Resource reservation and consumption are handled
 * by the Resource Engine; this module computes what has to be reserved and
 * reports the outcome.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import type { ResourceRequirement } from '@/simulation/contracts';
import type { Employee } from '@/simulation/employees';
import { getProductDefinition, type ProductInstance } from '@/simulation/products';
import {
  FACILITY_DEFINITIONS,
  MAX_BATCH_MULTIPLE,
  MAX_PRODUCTION_ORDERS,
  MAX_WORKFORCE_EFFICIENCY_BONUS,
  WORKFORCE_EFFICIENCY_PER_PRODUCTIVITY,
  facilitySupports,
  findFacility,
  getFacilityDefinition,
  isValidProductionState,
  type Facility,
  type FacilityStatus,
  type FacilityType,
  type ProductionOrder,
  type ProductionOrderStatus,
  type ProductionState,
} from './productionState';

export interface ProductionContext {
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Simulated time the production is recorded at. */
  simTimeMs: number;
  /**
   * The production efficiency modifier of the active global events (Stage 06).
   *
   * Optional: when it is absent the production behaves exactly as in Stage 04.
   */
  eventEfficiency?: number;
}

function failure<T>(code: string, message: string): Result<T, AppError> {
  return {
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  };
}

/**
 * Effective efficiency of a facility, including the bonus of the assigned
 * workforce. The bonus is bounded so that staffing can never dominate the
 * facility design.
 */
export function getEffectiveEfficiency(
  facility: Facility,
  employees: readonly Employee[],
): number {
  let productivity = 0;
  for (const id of facility.assignedEmployeeIds) {
    const employee = employees.find((candidate) => candidate.id === id);
    if (!employee || employee.status === 'departed') continue;
    productivity += employee.productivity;
  }

  const bonus = Math.min(
    MAX_WORKFORCE_EFFICIENCY_BONUS,
    productivity * WORKFORCE_EFFICIENCY_PER_PRODUCTIVITY,
  );

  return roundTo(facility.efficiency * (1 + bonus), 4);
}

/**
 * Resources needed for a production quantity.
 */
export function getOrderResourceRequirement(
  definitionResourceCost: ResourceRequirement,
  quantity: number,
): ResourceRequirement {
  const requirement: ResourceRequirement = {};
  for (const [resourceId, amount] of Object.entries(definitionResourceCost)) {
    if (!isFiniteNumber(amount) || amount <= 0) continue;
    requirement[resourceId as keyof ResourceRequirement] = roundTo(amount * quantity, 4);
  }
  return requirement;
}

/**
 * Simulated duration of a production order.
 */
export function getProductionDurationMs(
  quantity: number,
  facility: Facility,
  productionTimeMs: number,
  efficiency: number,
): number {
  if (facility.capacity <= 0 || efficiency <= 0) return Number.POSITIVE_INFINITY;
  return roundTo((quantity / facility.capacity) * productionTimeMs / efficiency, 2);
}

export interface CreateFacilityInput {
  name: string;
  type: FacilityType;
}

/**
 * Creates a manufacturing facility.
 */
export function createFacility(
  state: ProductionState,
  input: CreateFacilityInput,
): Result<{ facility: Facility; state: ProductionState }, AppError> {
  const definition = getFacilityDefinition(input.type);
  if (!definition) {
    return failure('FACILITY_UNKNOWN_TYPE', `Unknown facility type "${input.type}".`);
  }
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    return failure('FACILITY_INVALID_NAME', 'The facility needs a name.');
  }

  const sequence = state.sequence + 1;
  const facility: Facility = {
    id: `fac_${String(sequence).padStart(3, '0')}`,
    name: input.name.trim(),
    type: input.type,
    capacity: definition.capacity,
    efficiency: 1,
    operatingCost: definition.operatingCost,
    assignedEmployeeIds: [],
    status: 'idle',
    queue: [],
  };

  return {
    ok: true,
    value: {
      facility,
      state: { ...state, facilities: [...state.facilities, facility], sequence },
    },
  };
}

/**
 * Assigns employees to a facility.
 */
export function assignFacilityEmployees(
  state: ProductionState,
  facilityId: string,
  employeeIds: string[],
): Result<{ facility: Facility; state: ProductionState }, AppError> {
  const facility = findFacility(state, facilityId);
  if (!facility) {
    return failure('FACILITY_NOT_FOUND', `No facility with id "${facilityId}".`);
  }

  const unique = new Set([...facility.assignedEmployeeIds, ...employeeIds]);
  if (unique.size !== facility.assignedEmployeeIds.length + employeeIds.length) {
    return failure('FACILITY_DUPLICATE_ASSIGNMENT', 'An employee is assigned twice.');
  }

  const updated: Facility = {
    ...facility,
    assignedEmployeeIds: [...facility.assignedEmployeeIds, ...employeeIds],
  };

  return {
    ok: true,
    value: {
      facility: updated,
      state: {
        ...state,
        facilities: state.facilities.map((candidate) =>
          candidate.id === facilityId ? updated : candidate,
        ),
      },
    },
  };
}

/**
 * Removes an employee from a facility.
 */
export function unassignFacilityEmployee(
  state: ProductionState,
  facilityId: string,
  employeeId: string,
): Result<{ facility: Facility; state: ProductionState }, AppError> {
  const facility = findFacility(state, facilityId);
  if (!facility) {
    return failure('FACILITY_NOT_FOUND', `No facility with id "${facilityId}".`);
  }
  if (!facility.assignedEmployeeIds.includes(employeeId)) {
    return failure('FACILITY_ASSIGNMENT_MISSING', 'The employee is not assigned to this facility.');
  }

  const updated: Facility = {
    ...facility,
    assignedEmployeeIds: facility.assignedEmployeeIds.filter((id) => id !== employeeId),
  };

  return {
    ok: true,
    value: {
      facility: updated,
      state: {
        ...state,
        facilities: state.facilities.map((candidate) =>
          candidate.id === facilityId ? updated : candidate,
        ),
      },
    },
  };
}

export interface StartProductionInput {
  product: ProductInstance;
  facilityId: string;
  quantity: number;
  startedAtSimMs: number;
}

/**
 * Creates a production order.
 *
 * The order reserves nothing here — the Resource Engine performs the
 * reservation, and the caller charges the operating cost.
 */
export function startProduction(
  state: ProductionState,
  input: StartProductionInput,
  employees: readonly Employee[],
): Result<
  {
    order: ProductionOrder;
    state: ProductionState;
    reservedResources: ResourceRequirement;
    operatingCost: number;
    durationMs: number;
  },
  AppError
> {
  const fail = (
    code: string,
    message: string,
  ): Result<
    {
      order: ProductionOrder;
      state: ProductionState;
      reservedResources: ResourceRequirement;
      operatingCost: number;
      durationMs: number;
    },
    AppError
  > => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  if (!isValidProductionState(state)) {
    return fail('PRODUCTION_INVALID_STATE', 'The production state is invalid.');
  }

  const facility = findFacility(state, input.facilityId);
  if (!facility) {
    return fail('FACILITY_NOT_FOUND', `No facility with id "${input.facilityId}".`);
  }
  if (facility.status === 'offline') {
    return fail('FACILITY_OFFLINE', 'The facility is offline.');
  }

  const definition = getProductDefinition(input.product.definitionId);
  if (!definition) {
    return fail('PRODUCT_UNKNOWN', 'Unknown product definition.');
  }
  if (input.product.status !== 'ready') {
    return fail('PRODUCT_NOT_READY', 'Only a finished product can be manufactured.');
  }
  if (!facilitySupports(facility.type, definition.category)) {
    return fail(
      'FACILITY_NOT_COMPATIBLE',
      `A ${facility.name} cannot manufacture ${definition.category} products.`,
    );
  }

  if (!isFiniteNumber(input.quantity) || input.quantity <= 0 || !Number.isInteger(input.quantity)) {
    return fail('PRODUCTION_INVALID_QUANTITY', 'The quantity must be a positive whole number.');
  }
  if (input.quantity > facility.capacity * MAX_BATCH_MULTIPLE) {
    return fail(
      'PRODUCTION_OVER_CAPACITY',
      `A ${facility.name} can manufacture at most ${facility.capacity * MAX_BATCH_MULTIPLE} units per order.`,
    );
  }

  const efficiency = getEffectiveEfficiency(facility, employees);
  const durationMs = getProductionDurationMs(
    input.quantity,
    facility,
    definition.productionTimeMs,
    efficiency,
  );
  if (!isFiniteNumber(durationMs) || durationMs <= 0) {
    return fail('PRODUCTION_INVALID_DURATION', 'The production duration is invalid.');
  }

  const operatingCost = roundTo(
    facility.operatingCost * (durationMs / 3_600_000),
    2,
  );

  const sequence = state.sequence + 1;
  const order: ProductionOrder = {
    id: `ord_${String(sequence).padStart(4, '0')}`,
    productInstanceId: input.product.id,
    productDefinitionId: definition.id,
    facilityId: facility.id,
    quantity: input.quantity,
    produced: 0,
    progress: 0,
    status: 'queued',
    reservedResources: getOrderResourceRequirement(definition.resourceCost, input.quantity),
    operatingCost,
    startedAtSimMs: input.startedAtSimMs,
    completedAtSimMs: null,
  };

  const updatedFacility: Facility = {
    ...facility,
    queue: [...facility.queue, order.id],
    status: 'producing',
  };

  const orders = [...state.orders, order].slice(-MAX_PRODUCTION_ORDERS);

  return {
    ok: true,
    value: {
      order,
      state: {
        ...state,
        facilities: state.facilities.map((candidate) =>
          candidate.id === facility.id ? updatedFacility : candidate,
        ),
        orders,
        sequence,
      },
      reservedResources: order.reservedResources,
      operatingCost,
      durationMs,
    },
  };
}

/**
 * Cancels a production order. The reserved resources are released by the
 * caller through the Resource Engine.
 */
export function cancelProduction(
  state: ProductionState,
  orderId: string,
  simTimeMs: number,
): Result<{ order: ProductionOrder; state: ProductionState }, AppError> {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) {
    return failure('PRODUCTION_ORDER_NOT_FOUND', `No production order with id "${orderId}".`);
  }
  if (order.status === 'completed' || order.status === 'cancelled') {
    return failure('PRODUCTION_ORDER_FINAL', 'The production order is already finished.');
  }

  const cancelled: ProductionOrder = {
    ...order,
    status: 'cancelled',
    completedAtSimMs: simTimeMs,
  };

  const facilities = state.facilities.map((candidate) => {
    if (candidate.id !== order.facilityId) return candidate;
    const queue = candidate.queue.filter((id) => id !== orderId);
    return {
      ...candidate,
      queue,
      status: (queue.length > 0 ? 'producing' : 'idle') as FacilityStatus,
    };
  });

  return {
    ok: true,
    value: {
      order: cancelled,
      state: {
        ...state,
        facilities,
        orders: state.orders.map((candidate) => (candidate.id === orderId ? cancelled : candidate)),
      },
    },
  };
}

/**
 * Advances the running production orders.
 */
export function advanceProduction(
  state: ProductionState,
  context: ProductionContext,
  employees: readonly Employee[],
): { state: ProductionState; completed: ProductionOrder[] } {
  if (!isValidProductionState(state)) {
    logger.error('Production Engine rejected an invalid production state — state left unchanged');
    return { state, completed: [] };
  }
  if (!isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    logger.error('Production Engine rejected an invalid tick context — state left unchanged');
    return { state, completed: [] };
  }

  const completed: ProductionOrder[] = [];

  const orders = state.orders.map((order) => {
    if (order.status !== 'queued' && order.status !== 'running') return order;

    const facility = findFacility(state, order.facilityId);
    if (!facility || facility.status === 'offline') return order;

    const definition = getProductDefinition(order.productDefinitionId);
    if (!definition) return order;

    const efficiency = getEffectiveEfficiency(facility, employees);
    const durationMs = getProductionDurationMs(
      order.quantity,
      facility,
      definition.productionTimeMs,
      efficiency,
    );
    if (!isFiniteNumber(durationMs) || durationMs <= 0) return order;

    // The active global events may slow the lines down or speed them up.
    const eventEfficiency = clamp(context.eventEfficiency ?? 1, 0.5, 2);
    const progress = clamp(
      roundTo(order.progress + (context.deltaMs / durationMs) * eventEfficiency, 6),
      0,
      1,
    );

    if (progress < 1) {
      return { ...order, progress, status: 'running' as ProductionOrderStatus };
    }

    const finished: ProductionOrder = {
      ...order,
      progress: 1,
      produced: order.quantity,
      status: 'completed',
      completedAtSimMs: context.simTimeMs,
    };
    completed.push(finished);
    return finished;
  });

  const facilities = state.facilities.map((facility) => {
    const queue = facility.queue.filter((orderId) => {
      const order = orders.find((candidate) => candidate.id === orderId);
      return order !== undefined && (order.status === 'queued' || order.status === 'running');
    });
    return {
      ...facility,
      queue,
      status: (queue.length > 0 ? 'producing' : 'idle') as FacilityStatus,
    };
  });

  return {
    state: { ...state, facilities, orders, tick: state.tick + 1 },
    completed,
  };
}

/**
 * Total manufacturing capacity of the corporation, in units per batch.
 */
export function getTotalCapacity(state: ProductionState): number {
  return state.facilities
    .filter((facility) => facility.status !== 'offline')
    .reduce((total, facility) => total + facility.capacity, 0);
}

export { FACILITY_DEFINITIONS };
