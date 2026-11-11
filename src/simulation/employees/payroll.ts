/**
 * Payroll model.
 *
 * Payroll is bound to the simulated game clock through the elapsed simulated
 * time, never to the system clock. A payroll period is a fixed slice of
 * simulated time; the period identifier is derived from it, which makes a
 * period impossible to pay twice.
 */

import { clamp, roundTo } from '@/core/utils';
import {
  applyTransaction,
  closeFinancialPeriod,
  recordFinancialEvent,
  type Corporation,
} from '@/simulation/corporation';
import type { Employee } from './employeeState';

/** Length of one payroll period — seven in-game days. */
export const PAYROLL_PERIOD_MS = 7 * 24 * 3_600_000;

/** Satisfaction lost when a payroll period cannot be paid. */
export const MISSED_PAYROLL_SATISFACTION_PENALTY = 15;
/** Morale lost when a payroll period cannot be paid. */
export const MISSED_PAYROLL_MORALE_PENALTY = 20;

export interface PayrollPeriod {
  /** Stable identifier of the period, e.g. `period_0003`. */
  id: string;
  /** Numeric index of the period since the simulation started. */
  index: number;
  /** Simulated milliseconds elapsed inside the current period. */
  elapsedInPeriodMs: number;
  /** Simulated milliseconds remaining until the next payroll. */
  remainingInPeriodMs: number;
  /** Progress through the period, 0..1. */
  progress: number;
}

/**
 * Resolves the payroll period for a given elapsed simulated time.
 */
export function getPayrollPeriod(elapsedSimMs: number): PayrollPeriod {
  const safe = Number.isFinite(elapsedSimMs) && elapsedSimMs > 0 ? elapsedSimMs : 0;
  const index = Math.floor(safe / PAYROLL_PERIOD_MS);
  const periodStart = index * PAYROLL_PERIOD_MS;
  const elapsedInPeriodMs = safe - periodStart;

  return {
    id: `period_${String(index).padStart(4, '0')}`,
    index,
    elapsedInPeriodMs,
    remainingInPeriodMs: PAYROLL_PERIOD_MS - elapsedInPeriodMs,
    progress: clamp(elapsedInPeriodMs / PAYROLL_PERIOD_MS, 0, 1),
  };
}

/**
 * Calculates the payroll owed for a set of employees.
 */
export function calculatePayroll(employees: readonly Employee[]): {
  total: number;
  employeeCount: number;
} {
  const active = employees.filter((employee) => employee.status !== 'departed');
  const total = active.reduce((sum, employee) => sum + employee.salary, 0);
  return { total: roundTo(total, 2), employeeCount: active.length };
}

export interface PayrollSummary {
  periodId: string;
  /** Total payroll owed for the period. */
  total: number;
  employeeCount: number;
  /** True when the period was paid in full. */
  paid: boolean;
  /** Amount that could not be paid. */
  shortfall: number;
  /** True when the period had already been processed and was skipped. */
  alreadyProcessed: boolean;
}

export interface ApplyPayrollContext {
  /** Simulated milliseconds elapsed since the simulation started. */
  elapsedSimMs: number;
  /** Simulated time the payroll is recorded at. */
  simTimeMs: number;
}

export interface ApplyPayrollResult {
  corporation: Corporation;
  employees: Employee[];
  summary: PayrollSummary;
}

/**
 * Processes the payroll for the current period.
 *
 * The period is paid at most once: the last processed period identifier is
 * stored on the corporation and a repeated period is skipped. When the
 * balance cannot cover the payroll, **no money is created** — the shortfall
 * is recorded, the payroll is marked as missed and the workforce is put on
 * alert.
 */
export function applyPayroll(
  corporation: Corporation,
  employees: readonly Employee[],
  context: ApplyPayrollContext,
): ApplyPayrollResult {
  const period = getPayrollPeriod(context.elapsedSimMs);
  const payroll = calculatePayroll(employees);

  if (corporation.lastPayrollPeriodId === period.id) {
    return {
      corporation,
      employees: [...employees],
      summary: {
        periodId: period.id,
        total: payroll.total,
        employeeCount: payroll.employeeCount,
        paid: true,
        shortfall: 0,
        alreadyProcessed: true,
      },
    };
  }

  const markProcessed = (next: Corporation): Corporation => ({
    ...next,
    lastPayrollPeriodId: period.id,
  });

  if (payroll.total <= 0) {
    const closed = closeFinancialPeriod(markProcessed(corporation), period.id, 0);
    return {
      corporation: closed,
      employees: [...employees],
      summary: {
        periodId: period.id,
        total: 0,
        employeeCount: payroll.employeeCount,
        paid: true,
        shortfall: 0,
        alreadyProcessed: false,
      },
    };
  }

  if (corporation.finances.balance >= payroll.total) {
    let next = recordFinancialEvent(corporation, {
      type: 'payroll',
      amount: -payroll.total,
      description: `Payroll for ${payroll.employeeCount} employees (${period.id})`,
      simTimeMs: context.simTimeMs,
    });

    next = {
      ...next,
      finances: {
        ...next.finances,
        periodPayrollExpenses: roundTo(
          next.finances.periodPayrollExpenses + payroll.total,
          2,
        ),
      },
    };

    next = closeFinancialPeriod(markProcessed(next), period.id, payroll.employeeCount);

    const updatedEmployees = employees.map((employee) =>
      employee.status === 'at-risk' ? { ...employee, status: 'active' as const } : employee,
    );

    return {
      corporation: next,
      employees: updatedEmployees,
      summary: {
        periodId: period.id,
        total: payroll.total,
        employeeCount: payroll.employeeCount,
        paid: true,
        shortfall: 0,
        alreadyProcessed: false,
      },
    };
  }

  // Insufficient funds — the payroll is missed, no money is created.
  const shortfall = roundTo(payroll.total - corporation.finances.balance, 2);

  let next = applyTransaction(corporation, {
    type: 'payroll-missed',
    amount: 0,
    description: `Payroll missed — ${shortfall} short (${period.id})`,
    simTimeMs: context.simTimeMs,
    shortfall,
  });

  next = {
    ...next,
    missedPayrollCount: next.missedPayrollCount + 1,
  };

  next = closeFinancialPeriod(markProcessed(next), period.id, payroll.employeeCount);

  const updatedEmployees = employees.map((employee) =>
    employee.status === 'departed'
      ? employee
      : {
          ...employee,
          status: 'at-risk' as const,
          satisfaction: Math.max(
            0,
            roundTo(employee.satisfaction - MISSED_PAYROLL_SATISFACTION_PENALTY, 2),
          ),
          morale: Math.max(0, roundTo(employee.morale - MISSED_PAYROLL_MORALE_PENALTY, 2)),
        },
  );

  return {
    corporation: next,
    employees: updatedEmployees,
    summary: {
      periodId: period.id,
      total: payroll.total,
      employeeCount: payroll.employeeCount,
      paid: false,
      shortfall,
      alreadyProcessed: false,
    },
  };
}
