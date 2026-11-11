/**
 * Product Development Engine — deterministic rules.
 *
 * Development progress is driven by the assigned workforce, exactly like the
 * research projects of the Technology Engine. Quality is computed from
 * transparent, testable factors — never randomly.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import type { Employee } from '@/simulation/employees';
import {
  getTechnologyDefinition,
  getUnlockedEffects,
  type TechnologyState,
} from '@/simulation/technology';
import {
  getProductDefinition,
  isValidProductState,
  type ProductDefinition,
  type ProductInstance,
  type ProductState,
} from './productState';

export interface ProductContext {
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Simulated time the development is recorded at. */
  simTimeMs: number;
}

/** Base quality of a completed product. */
export const BASE_PRODUCT_QUALITY = 35;
/** Quality contribution of the average skill of the assigned workforce. */
export const QUALITY_SKILL_WEIGHT = 0.35;
/** Quality bonus granted by finishing the development. */
export const QUALITY_EFFORT_BONUS = 8;
/** Quality penalty per complexity point. */
export const QUALITY_COMPLEXITY_PENALTY = 4;

/**
 * Contribution of a single employee to a development project.
 * Engineers contribute fully, researchers at 70 %, every other profession at 30 %.
 */
export function getEmployeeContribution(employee: Employee): number {
  if (employee.status === 'departed') return 0;
  const professionFactor =
    employee.profession === 'engineer' ? 1 : employee.profession === 'researcher' ? 0.7 : 0.3;
  const skillFactor = clamp(employee.skill / 100, 0, 1);
  const productivityFactor = clamp(employee.productivity / 100, 0, 1);
  return professionFactor * skillFactor * productivityFactor;
}

/**
 * Total contribution of the assigned workforce.
 */
export function getDevelopmentContribution(
  employees: readonly Employee[],
  assignedEmployeeIds: readonly string[],
): number {
  let contribution = 0;
  for (const id of assignedEmployeeIds) {
    const employee = employees.find((candidate) => candidate.id === id);
    if (!employee) continue;
    contribution += getEmployeeContribution(employee);
  }
  return contribution;
}

/**
 * Number of technologies in the ancestry chain of a technology, including
 * itself. Used as a proxy for "technology level".
 */
export function getTechnologyDepth(technologyId: string): number {
  const definition = getTechnologyDefinition(technologyId);
  if (!definition) return 0;
  if (definition.requires.length === 0) return 1;

  let depth = 1;
  for (const requirement of definition.requires) {
    depth += getTechnologyDepth(requirement);
  }
  return depth;
}

/**
 * Quality of a product, from transparent factors only:
 *
 * ```
 * quality = clamp(
 *   35                                  // base
 *   + averageSkill × 0.35               // the assigned workforce
 *   + (technologyDepth − 1) × 2         // relevant technology level
 *   + unlockedQualityBonus × 100        // research breakthroughs
 *   + 8                                 // completed development effort
 *   − complexity × 4,                   // manufacturing difficulty
 *   0, 100
 * )
 * ```
 */
export function calculateQuality(
  definition: ProductDefinition,
  averageSkill: number,
  technologyState: TechnologyState,
): number {
  const depth = getTechnologyDepth(definition.requiresTechnology);
  const unlockedBonus = getUnlockedEffects(technologyState).qualityBonus ?? 0;

  return clamp(
    roundTo(
      BASE_PRODUCT_QUALITY +
        averageSkill * QUALITY_SKILL_WEIGHT +
        (depth - 1) * 2 +
        unlockedBonus * 100 +
        QUALITY_EFFORT_BONUS -
        definition.complexity * QUALITY_COMPLEXITY_PENALTY,
      2,
    ),
    0,
    100,
  );
}

/**
 * Innovation rating of a finished product.
 */
export function calculateInnovation(
  definition: ProductDefinition,
  quality: number,
): number {
  const depth = getTechnologyDepth(definition.requiresTechnology);
  return clamp(roundTo(quality * 0.5 + depth * 8 + definition.complexity * 2, 2), 0, 100);
}

/**
 * Market readiness of a product — grows with the units sold.
 */
export function calculateMarketReadiness(quality: number, unitsSold: number): number {
  return clamp(roundTo(quality * 0.4 + unitsSold * 0.1, 2), 0, 100);
}

/**
 * Validates that a development project may be started.
 */
export function canStartDevelopment(
  state: ProductState,
  definition: ProductDefinition,
  technologyState: TechnologyState,
): Result<void, AppError> {
  const fail = (code: string, message: string): Result<void, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  if (!isValidProductState(state)) {
    return fail('PRODUCT_INVALID_STATE', 'The product state is invalid.');
  }
  if (!technologyState.unlocked.includes(definition.requiresTechnology)) {
    const required = getTechnologyDefinition(definition.requiresTechnology);
    return fail(
      'PRODUCT_TECHNOLOGY_REQUIRED',
      `${definition.name} requires ${required?.name ?? definition.requiresTechnology}.`,
    );
  }
  if (
    state.instances.some(
      (instance) => instance.definitionId === definition.id && instance.status === 'developing',
    )
  ) {
    return fail('PRODUCT_ALREADY_IN_DEVELOPMENT', `${definition.name} is already in development.`);
  }
  if (!isFiniteNumber(definition.developmentCost) || definition.developmentCost <= 0) {
    return fail('PRODUCT_INVALID_COST', 'The development cost is invalid.');
  }
  if (!isFiniteNumber(definition.developmentDurationMs) || definition.developmentDurationMs <= 0) {
    return fail('PRODUCT_INVALID_DURATION', 'The development duration is invalid.');
  }

  return { ok: true, value: undefined };
}

export interface StartDevelopmentInput {
  definitionId: string;
  assignedEmployeeIds: string[];
  createdAtSimMs: number;
}

/**
 * Starts a product development project.
 */
export function startDevelopment(
  state: ProductState,
  technologyState: TechnologyState,
  input: StartDevelopmentInput,
): Result<{ instance: ProductInstance; state: ProductState }, AppError> {
  const fail = (
    code: string,
    message: string,
  ): Result<{ instance: ProductInstance; state: ProductState }, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  const definition = getProductDefinition(input.definitionId);
  if (!definition) {
    return fail('PRODUCT_UNKNOWN', `Unknown product "${input.definitionId}".`);
  }

  const allowed = canStartDevelopment(state, definition, technologyState);
  if (!allowed.ok) return allowed;

  const unique = new Set(input.assignedEmployeeIds);
  if (unique.size !== input.assignedEmployeeIds.length) {
    return fail('PRODUCT_DUPLICATE_ASSIGNMENT', 'An employee is assigned twice.');
  }

  const sequence = state.sequence + 1;
  const instance: ProductInstance = {
    id: `prd_${String(sequence).padStart(4, '0')}`,
    definitionId: definition.id,
    name: definition.name,
    status: 'developing',
    progress: 0,
    quality: 0,
    innovation: 0,
    marketReadiness: 0,
    assignedEmployeeIds: [...input.assignedEmployeeIds],
    costPaid: definition.developmentCost,
    createdAtSimMs: input.createdAtSimMs,
    completedAtSimMs: null,
    price: definition.basePrice,
    salesActive: false,
    inventory: 0,
    unitsSold: 0,
    revenue: 0,
  };

  return {
    ok: true,
    value: {
      instance,
      state: { ...state, instances: [...state.instances, instance], sequence },
    },
  };
}

/**
 * Assigns employees to a development project.
 */
export function assignDevelopmentEmployees(
  state: ProductState,
  instanceId: string,
  employeeIds: string[],
): Result<{ instance: ProductInstance; state: ProductState }, AppError> {
  const fail = (
    code: string,
    message: string,
  ): Result<{ instance: ProductInstance; state: ProductState }, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  const instance = state.instances.find((candidate) => candidate.id === instanceId);
  if (!instance) {
    return fail('PRODUCT_NOT_FOUND', `No product project with id "${instanceId}".`);
  }
  if (instance.status !== 'developing') {
    return fail('PRODUCT_NOT_DEVELOPING', 'Only a project in development can be staffed.');
  }

  const unique = new Set([...instance.assignedEmployeeIds, ...employeeIds]);
  if (unique.size !== instance.assignedEmployeeIds.length + employeeIds.length) {
    return fail('PRODUCT_DUPLICATE_ASSIGNMENT', 'An employee is assigned twice.');
  }

  const updated: ProductInstance = {
    ...instance,
    assignedEmployeeIds: [...instance.assignedEmployeeIds, ...employeeIds],
  };

  return {
    ok: true,
    value: {
      instance: updated,
      state: {
        ...state,
        instances: state.instances.map((candidate) =>
          candidate.id === instanceId ? updated : candidate,
        ),
      },
    },
  };
}

/**
 * Advances every development project by the elapsed simulated time.
 */
export function advanceDevelopment(
  state: ProductState,
  technologyState: TechnologyState,
  context: ProductContext,
  employees: readonly Employee[],
): ProductState {
  if (!isValidProductState(state)) {
    logger.error('Product Engine rejected an invalid product state — state left unchanged');
    return state;
  }
  if (!isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    logger.error('Product Engine rejected an invalid tick context — state left unchanged');
    return state;
  }

  const speedMultiplier = getUnlockedEffects(technologyState).researchSpeed ?? 1;

  const instances = state.instances.map((instance) => {
    if (instance.status !== 'developing') return instance;

    const definition = getProductDefinition(instance.definitionId);
    if (!definition) return instance;

    const contribution = getDevelopmentContribution(employees, instance.assignedEmployeeIds);
    if (contribution <= 0) return instance;

    const progressDelta =
      (contribution * context.deltaMs * speedMultiplier) / definition.developmentDurationMs;
    const progress = clamp(roundTo(instance.progress + progressDelta, 6), 0, 1);

    if (progress < 1) {
      return { ...instance, progress };
    }

    const assigned = instance.assignedEmployeeIds
      .map((id) => employees.find((candidate) => candidate.id === id))
      .filter((employee): employee is Employee => employee !== undefined);
    const averageSkill =
      assigned.length > 0
        ? assigned.reduce((sum, employee) => sum + employee.skill, 0) / assigned.length
        : 0;

    const quality = calculateQuality(definition, averageSkill, technologyState);
    const innovation = calculateInnovation(definition, quality);

    return {
      ...instance,
      progress: 1,
      status: 'ready' as const,
      quality,
      innovation,
      marketReadiness: calculateMarketReadiness(quality, instance.unitsSold),
      completedAtSimMs: context.simTimeMs,
    };
  });

  return { ...state, instances, tick: state.tick + 1 };
}

/**
 * Sets the market price of a product.
 */
export function setProductPrice(
  state: ProductState,
  instanceId: string,
  price: number,
): Result<{ instance: ProductInstance; state: ProductState }, AppError> {
  const fail = (
    code: string,
    message: string,
  ): Result<{ instance: ProductInstance; state: ProductState }, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  const instance = state.instances.find((candidate) => candidate.id === instanceId);
  if (!instance) {
    return fail('PRODUCT_NOT_FOUND', `No product project with id "${instanceId}".`);
  }
  if (!isFiniteNumber(price) || price <= 0) {
    return fail('PRODUCT_INVALID_PRICE', 'The price must be a positive number.');
  }

  const updated: ProductInstance = { ...instance, price: roundTo(price, 2) };

  return {
    ok: true,
    value: {
      instance: updated,
      state: {
        ...state,
        instances: state.instances.map((candidate) =>
          candidate.id === instanceId ? updated : candidate,
        ),
      },
    },
  };
}

/**
 * Activates or deactivates the market sale of a product.
 */
export function setProductSalesActive(
  state: ProductState,
  instanceId: string,
  active: boolean,
): Result<{ instance: ProductInstance; state: ProductState }, AppError> {
  const fail = (
    code: string,
    message: string,
  ): Result<{ instance: ProductInstance; state: ProductState }, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  const instance = state.instances.find((candidate) => candidate.id === instanceId);
  if (!instance) {
    return fail('PRODUCT_NOT_FOUND', `No product project with id "${instanceId}".`);
  }
  if (active && instance.status !== 'ready') {
    return fail('PRODUCT_NOT_READY', 'Only a finished product can be offered on the market.');
  }

  const updated: ProductInstance = { ...instance, salesActive: active };

  return {
    ok: true,
    value: {
      instance: updated,
      state: {
        ...state,
        instances: state.instances.map((candidate) =>
          candidate.id === instanceId ? updated : candidate,
        ),
      },
    },
  };
}
