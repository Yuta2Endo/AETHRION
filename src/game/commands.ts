/**
 * Command layer — the only entry point for player actions.
 *
 * The interface calls commands; commands apply domain rules and write the
 * result to the game state. No simulation rule is ever executed inside a
 * React component.
 *
 * Commands are pure with respect to the store: they read the current state,
 * validate, compute and write back exactly once.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import type { DepartmentId } from '@/simulation/contracts';
import {
  applyTransaction,
  createCorporation,
  getPlayerCorporation,
  type Corporation,
} from '@/simulation/corporation';
import {
  dismissEmployee,
  hireEmployee,
  type Employee,
  type ProfessionId,
} from '@/simulation/employees';

function failure(code: string, message: string): { ok: false; error: AppError } {
  return {
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  };
}

export interface CreateCorporationCommand {
  name: string;
}

export interface HireEmployeeCommand {
  profession: ProfessionId;
  department: DepartmentId;
  /** Optional salary override. Defaults to the profession's base salary. */
  salary?: number;
}

/**
 * Establishes the player corporation.
 */
export function createPlayerCorporation(
  input: CreateCorporationCommand,
): Result<Corporation, AppError> {
  const store = useGameStore.getState();

  const id = `corp_${String(store.corporation.corporations.length + 1).padStart(3, '0')}`;
  const result = createCorporation(store.corporation, {
    id,
    name: input.name,
    foundedAtSimMs: store.simulation.simTimeMs,
  });

  if (!result.ok) {
    logger.warn('Command createPlayerCorporation rejected', { code: result.error.code });
    return result;
  }

  store.applyCorporationState({
    ...store.corporation,
    corporations: [...store.corporation.corporations, result.value],
    playerCorporationId: result.value.id,
  });

  logger.info('Player corporation established', { id: result.value.id, name: result.value.name });
  return result;
}

/**
 * Hires an employee into the player corporation.
 */
export function hireEmployeeCommand(
  input: HireEmployeeCommand,
): Result<Employee, AppError> {
  const store = useGameStore.getState();
  const corporation = getPlayerCorporation(store.corporation);

  if (!corporation) {
    return failure('CORPORATION_NOT_FOUND', 'Establish a corporation before hiring staff.');
  }

  const hired = hireEmployee(store.employees, corporation, {
    profession: input.profession,
    department: input.department,
    salary: input.salary,
    hiredAtSimMs: store.simulation.simTimeMs,
  });

  if (!hired.ok) {
    logger.warn('Command hireEmployee rejected', { code: hired.error.code });
    return hired;
  }

  const withCost = applyTransaction(corporation, {
    type: 'hiring',
    amount: -hired.value.cost,
    description: `Hiring fee — ${hired.value.employee.name}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  const withAccounting: Corporation = {
    ...withCost,
    finances: {
      ...withCost.finances,
      lifetimeHiringCosts: Math.round(
        (withCost.finances.lifetimeHiringCosts + hired.value.cost) * 100,
      ) / 100,
    },
  };

  store.applyCorporationState({
    ...store.corporation,
    corporations: store.corporation.corporations.map((candidate) =>
      candidate.id === withAccounting.id ? withAccounting : candidate,
    ),
  });
  store.applyEmployeeState(hired.value.state);

  logger.info('Employee hired', {
    id: hired.value.employee.id,
    profession: hired.value.employee.profession,
    cost: hired.value.cost,
  });

  return { ok: true, value: hired.value.employee };
}

/**
 * Dismisses an employee from the player corporation.
 */
export function dismissEmployeeCommand(
  employeeId: string,
): Result<Employee, AppError> {
  const store = useGameStore.getState();

  const result = dismissEmployee(store.employees, employeeId);
  if (!result.ok) {
    logger.warn('Command dismissEmployee rejected', { code: result.error.code });
    return result;
  }

  store.applyEmployeeState(result.value.state);
  logger.info('Employee dismissed', { id: employeeId });
  return { ok: true, value: result.value.employee };
}

/**
 * All player commands, grouped for convenient access from the interface.
 */
export const commands = {
  createCorporation: createPlayerCorporation,
  hireEmployee: hireEmployeeCommand,
  dismissEmployee: dismissEmployeeCommand,
};
