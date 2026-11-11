/**
 * Shared helpers of the command layer.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import {
  getPlayerCorporation,
  recordFinancialEvent,
  type Corporation,
  type TransactionType,
} from '@/simulation/corporation';
import type { Employee } from '@/simulation/employees';

export function failure<T>(code: string, message: string): Result<T, AppError> {
  return {
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  };
}

/**
 * The player corporation, or a typed failure when none exists.
 */
export function requireCorporation(): Result<Corporation, AppError> {
  const corporation = getPlayerCorporation(useGameStore.getState().corporation);
  if (!corporation) {
    return failure('CORPORATION_NOT_FOUND', 'Establish a corporation before managing the empire.');
  }
  return { ok: true, value: corporation };
}

/**
 * Charges the corporation. The balance is never allowed to go below zero —
 * an unaffordable transaction is rejected and nothing changes.
 */
export function chargeCorporation(
  corporation: Corporation,
  event: {
    type: TransactionType;
    amount: number;
    description: string;
    simTimeMs: number;
  },
): Result<Corporation, AppError> {
  if (event.amount < 0 && corporation.finances.balance + event.amount < 0) {
    return failure(
      'CORPORATION_INSUFFICIENT_FUNDS',
      `The transaction costs ${Math.abs(event.amount)} but only ${corporation.finances.balance} is available.`,
    );
  }

  const next = recordFinancialEvent(corporation, event);
  if (next === corporation) {
    return failure('CORPORATION_TRANSACTION_REJECTED', 'The transaction was rejected.');
  }
  return { ok: true, value: next };
}

/**
 * Writes an updated corporation back into the game state.
 */
export function storeCorporation(next: Corporation): void {
  const store = useGameStore.getState();
  store.applyCorporationState({
    ...store.corporation,
    corporations: store.corporation.corporations.map((candidate) =>
      candidate.id === next.id ? next : candidate,
    ),
  });
}

/**
 * Validates that the given employee ids exist and are still employed.
 */
export function validateEmployeeAssignment(
  employeeIds: string[],
  employees: readonly Employee[],
): Result<void, AppError> {
  if (new Set(employeeIds).size !== employeeIds.length) {
    return failure('COMMAND_DUPLICATE_ASSIGNMENT', 'An employee is assigned twice.');
  }

  for (const id of employeeIds) {
    const employee = employees.find((candidate) => candidate.id === id);
    if (!employee) {
      return failure('EMPLOYEE_NOT_FOUND', `No employee with id "${id}".`);
    }
    if (employee.status === 'departed') {
      return failure('EMPLOYEE_DEPARTED', `${employee.name} has left the corporation.`);
    }
  }

  return { ok: true, value: undefined };
}

export function logCommandRejection(command: string, error: AppError): void {
  logger.warn(`Command ${command} rejected`, { code: error.code, message: error.message });
}
