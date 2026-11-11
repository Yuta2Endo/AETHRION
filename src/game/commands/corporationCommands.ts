/**
 * Corporation commands — establish the corporation and manage the workforce.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import type { DepartmentId } from '@/simulation/contracts';
import { createCorporation, type Corporation } from '@/simulation/corporation';
import {
  dismissEmployee,
  hireEmployee,
  type Employee,
  type ProfessionId,
} from '@/simulation/employees';
import { chargeCorporation, failure, storeCorporation } from './shared';

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
  const corporation = store.corporation.corporations.find(
    (candidate) => candidate.id === store.corporation.playerCorporationId,
  );

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

  const charged = chargeCorporation(corporation, {
    type: 'hiring',
    amount: -hired.value.cost,
    description: `Hiring fee — ${hired.value.employee.name}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    logger.warn('Command hireEmployee rejected', { code: charged.error.code });
    return charged;
  }

  storeCorporation(charged.value);
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
export function dismissEmployeeCommand(employeeId: string): Result<Employee, AppError> {
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
