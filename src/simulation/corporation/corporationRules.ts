/**
 * Corporation Engine — deterministic rules.
 *
 * All functions are pure: the same input always produces the same output.
 * Nothing here depends on React, the rendering engine or the system clock.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import type { DepartmentId } from '@/simulation/contracts';
import {
  CORPORATION_TIERS,
  INITIAL_CORPORATION_BALANCE,
  INITIAL_CORPORATION_REPUTATION,
  MAX_FINANCIAL_HISTORY,
  MAX_TRANSACTIONS,
  getCorporationTier,
  type Corporation,
  type CorporationFinances,
  type CorporationId,
  type CorporationState,
  type CorporationStatus,
  type CorporationTier,
  type CorporationTransaction,
  type TransactionType,
} from './corporationState';

/** Minimum length of a valid corporation name. */
export const MIN_CORPORATION_NAME_LENGTH = 2;
/** Maximum length of a valid corporation name. */
export const MAX_CORPORATION_NAME_LENGTH = 48;

/** Revenue generated per productivity point and simulated hour. */
export const REVENUE_PER_PRODUCTIVITY_POINT = 1.2;
/** Fixed operating cost per simulated hour, independent of the workforce. */
export const BASE_OPERATING_COST_PER_HOUR = 20;
/** Operating cost per employee and simulated hour. */
export const OPERATING_COST_PER_EMPLOYEE_PER_HOUR = 6;
/** Flat fee charged on top of the salary when an employee is hired. */
export const HIRING_FLAT_FEE = 200;
/** Lifetime revenue that corresponds to one reputation point. */
export const REPUTATION_REVENUE_UNIT = 50_000;
/** Lifetime net profit that corresponds to one reputation point. */
export const REPUTATION_PROFIT_UNIT = 25_000;
/** How quickly the reputation converges toward its target. */
export const REPUTATION_DRIFT = 0.05;

/**
 * Context supplied to the corporation rules on every tick.
 */
export interface CorporationContext {
  /** Current tick number. */
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Simulated milliseconds elapsed since the simulation started. */
  elapsedSimMs: number;
  /** Identifier of the current payroll period. */
  periodId: string;
  /** Sum of the productivity of all active employees. */
  workforceProductivity: number;
  /** Number of active employees. */
  employeeCount: number;
}

/**
 * Minimal structural view of an employee, used to derive workforce statistics.
 * The Employee Engine's `Employee` satisfies it without the Corporation
 * Engine having to import the Employee Engine.
 */
export interface WorkforceMember {
  department: DepartmentId;
  productivity: number;
  satisfaction: number;
  morale: number;
  skill: number;
  status: string;
}

export interface CorporationStatistics {
  employeeCount: number;
  /** Sum of the productivity of the active workforce. */
  workforceProductivity: number;
  averageProductivity: number;
  averageSatisfaction: number;
  averageMorale: number;
  averageSkill: number;
  departmentHeadcount: Record<DepartmentId, number>;
  netProfit: number;
  netProfitPerHour: number;
}

export interface CreateCorporationInput {
  id: CorporationId;
  name: string;
  /** Simulated time the corporation is founded. */
  foundedAtSimMs: number;
}

/**
 * Validates a corporation name.
 */
export function isValidCorporationName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return (
    trimmed.length >= MIN_CORPORATION_NAME_LENGTH &&
    trimmed.length <= MAX_CORPORATION_NAME_LENGTH
  );
}

/**
 * Creates a new corporation.
 *
 * Rejects invalid names, duplicate identifiers and a second player
 * corporation.
 */
export function createCorporation(
  state: CorporationState,
  input: CreateCorporationInput,
): Result<Corporation, AppError> {
  const fail = (code: string, message: string): Result<Corporation, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  if (!isValidCorporationName(input.name)) {
    return fail(
      'CORPORATION_INVALID_NAME',
      `Corporation name must be ${MIN_CORPORATION_NAME_LENGTH}-${MAX_CORPORATION_NAME_LENGTH} characters.`,
    );
  }
  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    return fail('CORPORATION_INVALID_ID', 'Corporation id must be a non-empty string.');
  }
  if (!isFiniteNumber(input.foundedAtSimMs) || input.foundedAtSimMs < 0) {
    return fail('CORPORATION_INVALID_DATE', 'Founding date must be a valid simulated time.');
  }
  if (state.corporations.some((corporation) => corporation.id === input.id)) {
    return fail('CORPORATION_DUPLICATE_ID', `Corporation "${input.id}" already exists.`);
  }
  if (state.playerCorporationId !== null) {
    return fail(
      'CORPORATION_ALREADY_EXISTS',
      'A player corporation has already been established.',
    );
  }

  const tier = CORPORATION_TIERS[0];
  const corporation: Corporation = {
    id: input.id,
    name: input.name.trim(),
    foundedAtSimMs: input.foundedAtSimMs,
    tierId: tier.id,
    level: tier.level,
    status: 'active',
    reputation: INITIAL_CORPORATION_REPUTATION,
    finances: createInitialFinances(INITIAL_CORPORATION_BALANCE),
    transactions: [],
    financialHistory: [],
    lastPayrollPeriodId: null,
    missedPayrollCount: 0,
    transactionSequence: 0,
  };

  return { ok: true, value: corporation };
}

/**
 * Creates the initial financial record.
 */
export function createInitialFinances(balance = INITIAL_CORPORATION_BALANCE): CorporationFinances {
  return {
    balance: roundTo(balance, 2),
    lifetimeRevenue: 0,
    lifetimeWorkforceRevenue: 0,
    lifetimeSalesRevenue: 0,
    lifetimeOperatingExpenses: 0,
    lifetimePayrollExpenses: 0,
    lifetimeHiringCosts: 0,
    lifetimeResearchExpenses: 0,
    lifetimeDevelopmentExpenses: 0,
    lifetimeResourceExpenses: 0,
    lifetimeProductionExpenses: 0,
    periodRevenue: 0,
    periodOperatingExpenses: 0,
    periodPayrollExpenses: 0,
  };
}

/**
 * Records a financial event: applies the transaction to the ledger and
 * updates the matching lifetime counter in one atomic step.
 *
 * A rejected transaction (non-finite amount or an overdraft) leaves the
 * corporation completely unchanged.
 */
export function recordFinancialEvent(
  corporation: Corporation,
  event: {
    type: TransactionType;
    /** Signed amount: a negative value is an expense, a positive value revenue. */
    amount: number;
    description: string;
    simTimeMs: number;
  },
): Corporation {
  const withTransaction = applyTransaction(corporation, {
    type: event.type,
    amount: event.amount,
    description: event.description,
    simTimeMs: event.simTimeMs,
  });

  if (withTransaction === corporation) {
    // The transaction was rejected — nothing changed.
    return corporation;
  }

  const finances = { ...withTransaction.finances };
  const amount = roundTo(Math.abs(event.amount), 2);

  switch (event.type) {
    case 'sales':
      finances.lifetimeSalesRevenue = roundTo(finances.lifetimeSalesRevenue + amount, 2);
      finances.lifetimeRevenue = roundTo(finances.lifetimeRevenue + amount, 2);
      break;
    case 'research':
      finances.lifetimeResearchExpenses = roundTo(finances.lifetimeResearchExpenses + amount, 2);
      break;
    case 'development':
      finances.lifetimeDevelopmentExpenses = roundTo(finances.lifetimeDevelopmentExpenses + amount, 2);
      break;
    case 'resource':
      finances.lifetimeResourceExpenses = roundTo(finances.lifetimeResourceExpenses + amount, 2);
      break;
    case 'production':
      finances.lifetimeProductionExpenses = roundTo(finances.lifetimeProductionExpenses + amount, 2);
      break;
    case 'hiring':
      finances.lifetimeHiringCosts = roundTo(finances.lifetimeHiringCosts + amount, 2);
      break;
    case 'payroll':
      finances.lifetimePayrollExpenses = roundTo(finances.lifetimePayrollExpenses + amount, 2);
      break;
    case 'operating':
      finances.lifetimeOperatingExpenses = roundTo(finances.lifetimeOperatingExpenses + amount, 2);
      break;
    default:
      break;
  }

  return { ...withTransaction, finances };
}

export interface TransactionInput {
  type: TransactionType;
  /** Signed amount: positive is income, negative is an expense. */
  amount: number;
  description: string;
  simTimeMs: number;
  shortfall?: number;
}

/**
 * Applies a transaction to the ledger.
 *
 * A transaction is rejected — leaving the corporation untouched — when the
 * amount is not a finite number or when it would drive the balance below
 * zero. No money is ever created and no invalid financial state is produced.
 */
export function applyTransaction(
  corporation: Corporation,
  input: TransactionInput,
): Corporation {
  if (!isFiniteNumber(input.amount)) {
    logger.error('Corporation Engine rejected a transaction with a non-finite amount', {
      type: input.type,
    });
    return corporation;
  }

  const nextBalance = roundTo(corporation.finances.balance + input.amount, 2);
  if (nextBalance < 0) {
    logger.warn('Corporation Engine rejected a transaction that would overdraw the balance', {
      type: input.type,
      amount: input.amount,
      balance: corporation.finances.balance,
    });
    return corporation;
  }

  const sequence = corporation.transactionSequence + 1;
  const transaction: CorporationTransaction = {
    id: `txn_${corporation.id}_${sequence}`,
    type: input.type,
    amount: roundTo(input.amount, 2),
    description: input.description,
    balanceAfter: nextBalance,
    simTimeMs: input.simTimeMs,
    ...(input.shortfall !== undefined ? { shortfall: roundTo(input.shortfall, 2) } : {}),
  };

  const transactions = [...corporation.transactions, transaction].slice(-MAX_TRANSACTIONS);

  return {
    ...corporation,
    finances: { ...corporation.finances, balance: nextBalance },
    transactions,
    transactionSequence: sequence,
  };
}

/**
 * Net profit of the corporation across its whole lifetime.
 */
export function getNetProfit(finances: CorporationFinances): number {
  return roundTo(
    finances.lifetimeRevenue -
      finances.lifetimeOperatingExpenses -
      finances.lifetimePayrollExpenses,
    2,
  );
}

/**
 * Net profit accrued during the current payroll period.
 */
export function getPeriodNetProfit(finances: CorporationFinances): number {
  return roundTo(
    finances.periodRevenue - finances.periodOperatingExpenses - finances.periodPayrollExpenses,
    2,
  );
}

/**
 * Accrues revenue and operating costs for the elapsed simulated time.
 */
export function accrueFinances(
  corporation: Corporation,
  context: CorporationContext,
): Corporation {
  const hours = context.deltaMs / 3_600_000;
  if (hours <= 0) return corporation;

  const tier = getCorporationTier(corporation.tierId) ?? CORPORATION_TIERS[0];

  const revenue = roundTo(
    Math.max(0, context.workforceProductivity) *
      REVENUE_PER_PRODUCTIVITY_POINT *
      hours *
      tier.revenueFactor,
    2,
  );

  const operatingExpenses = roundTo(
    (BASE_OPERATING_COST_PER_HOUR + Math.max(0, context.employeeCount) * OPERATING_COST_PER_EMPLOYEE_PER_HOUR) *
      hours *
      tier.operatingCostFactor,
    2,
  );

  return {
    ...corporation,
    finances: {
      ...corporation.finances,
      lifetimeRevenue: roundTo(corporation.finances.lifetimeRevenue + revenue, 2),
      lifetimeWorkforceRevenue: roundTo(
        corporation.finances.lifetimeWorkforceRevenue + revenue,
        2,
      ),
      lifetimeOperatingExpenses: roundTo(
        corporation.finances.lifetimeOperatingExpenses + operatingExpenses,
        2,
      ),
      periodRevenue: roundTo(corporation.finances.periodRevenue + revenue, 2),
      periodOperatingExpenses: roundTo(
        corporation.finances.periodOperatingExpenses + operatingExpenses,
        2,
      ),
    },
  };
}

/**
 * Resolves the highest tier whose requirements the corporation currently meets.
 */
export function resolveTier(corporation: Corporation, employeeCount: number): CorporationTier {
  const lifetimeRevenue = corporation.finances.lifetimeRevenue;
  const ordered = [...CORPORATION_TIERS].sort((a, b) => b.level - a.level);

  for (const tier of ordered) {
    if (
      lifetimeRevenue >= tier.requiredLifetimeRevenue &&
      corporation.reputation >= tier.requiredReputation &&
      employeeCount >= tier.requiredEmployeeCount
    ) {
      return tier;
    }
  }

  return CORPORATION_TIERS[0];
}

/**
 * Derives the operational status of the corporation.
 */
export function resolveStatus(
  corporation: Corporation,
  netProfitPerHour: number,
): CorporationStatus {
  if (corporation.finances.balance <= 0) return 'insolvent';
  if (corporation.missedPayrollCount > 0 || netProfitPerHour < 0) return 'strained';
  if (netProfitPerHour > 0 && corporation.reputation >= 40) return 'thriving';
  return 'active';
}

/**
 * Updates reputation, tier and status.
 */
export function updateProgression(
  corporation: Corporation,
  context: CorporationContext,
): Corporation {
  const { finances } = corporation;
  const netProfit = getNetProfit(finances);

  const revenueScore = finances.lifetimeRevenue / REPUTATION_REVENUE_UNIT;
  const profitScore = netProfit / REPUTATION_PROFIT_UNIT;
  const reputationTarget = clamp(
    INITIAL_CORPORATION_REPUTATION + revenueScore * 0.5 + profitScore * 0.5,
    0,
    100,
  );
  const reputation = roundTo(
    corporation.reputation + (reputationTarget - corporation.reputation) * REPUTATION_DRIFT,
    4,
  );

  const tier = resolveTier({ ...corporation, reputation }, context.employeeCount);
  const hours = context.deltaMs / 3_600_000;
  const netProfitPerHour =
    hours > 0
      ? roundTo(
          (finances.periodRevenue - finances.periodOperatingExpenses - finances.periodPayrollExpenses) /
            hours,
          4,
        )
      : 0;

  return {
    ...corporation,
    reputation,
    tierId: tier.id,
    level: tier.level,
    status: resolveStatus(corporation, netProfitPerHour),
  };
}

/**
 * Closes the current payroll period and records the financial snapshot.
 */
export function closeFinancialPeriod(
  corporation: Corporation,
  periodId: string,
  employeeCount: number,
): Corporation {
  const { finances } = corporation;
  const snapshot = {
    periodId,
    revenue: finances.periodRevenue,
    operatingExpenses: finances.periodOperatingExpenses,
    payrollExpenses: finances.periodPayrollExpenses,
    netProfit: getPeriodNetProfit(finances),
    balance: finances.balance,
    employeeCount,
  };

  return {
    ...corporation,
    finances: {
      ...finances,
      periodRevenue: 0,
      periodOperatingExpenses: 0,
      periodPayrollExpenses: 0,
    },
    financialHistory: [...corporation.financialHistory, snapshot].slice(-MAX_FINANCIAL_HISTORY),
  };
}

/**
 * Derives the workforce statistics of a corporation.
 */
export function getCorporationStatistics(
  corporation: Corporation,
  workforce: readonly WorkforceMember[],
): CorporationStatistics {
  const departmentHeadcount = {
    management: 0,
    research: 0,
    engineering: 0,
    production: 0,
    marketing: 0,
    finance: 0,
  } as Record<DepartmentId, number>;

  let workforceProductivity = 0;
  let satisfaction = 0;
  let morale = 0;
  let skill = 0;

  for (const member of workforce) {
    departmentHeadcount[member.department] += 1;
    workforceProductivity += member.productivity;
    satisfaction += member.satisfaction;
    morale += member.morale;
    skill += member.skill;
  }

  const count = workforce.length;
  const average = (total: number): number =>
    count > 0 ? roundTo(total / count, 2) : 0;

  const netProfit = getNetProfit(corporation.finances);
  const periodNet = getPeriodNetProfit(corporation.finances);

  return {
    employeeCount: count,
    workforceProductivity: roundTo(workforceProductivity, 2),
    averageProductivity: average(workforceProductivity),
    averageSatisfaction: average(satisfaction),
    averageMorale: average(morale),
    averageSkill: average(skill),
    departmentHeadcount,
    netProfit,
    netProfitPerHour: periodNet,
  };
}
