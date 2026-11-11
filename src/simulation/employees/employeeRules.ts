/**
 * Employee Engine — deterministic rules.
 *
 * All functions are pure: the same input always produces the same output.
 * No randomness is used anywhere — employee names, identifiers and development
 * are fully derived from the state and the tick context.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import { isDepartmentId, type DepartmentId } from '@/simulation/contracts';
import {
  getCorporationTier,
  type Corporation,
  type CorporationTier,
} from '@/simulation/corporation';
import {
  MAX_DEVELOPMENT_ENTRIES,
  MAX_EMPLOYEE_SALARY,
  MIN_EMPLOYEE_SALARY,
  generateEmployeeId,
  generateEmployeeName,
  getProfession,
  isProfessionId,
  type Employee,
  type EmployeeId,
  type EmployeeState,
  type ProfessionId,
} from './employeeState';

/** Skill gained per point of experience. */
export const SKILL_PER_EXPERIENCE = 0.35;
/** Fraction of the skill gap closed per simulated hour. */
export const SKILL_CONVERGENCE = 0.05;
/** Upper bound of the productivity value. */
export const PRODUCTIVITY_MAX = 100;
/** Fraction of the satisfaction gap closed per simulated hour. */
export const SATISFACTION_DRIFT = 0.04;
/** Fraction of the morale gap closed per simulated hour. */
export const MORALE_DRIFT = 0.03;
/** Base component of the morale target. */
export const MORALE_BASE = 30;
/** Satisfaction points gained or lost per 100 % of salary fairness. */
export const SALARY_FAIRNESS_WEIGHT = 20;
/** Satisfaction an employee starts with. */
export const INITIAL_SATISFACTION = 60;
/** Morale an employee starts with. */
export const INITIAL_MORALE = 60;
/** Flat hiring fee on top of the salary-proportional fee. */
export const HIRING_FLAT_FEE = 200;

/**
 * Context supplied to the employee rules on every tick.
 */
export interface EmployeeContext {
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Simulated milliseconds elapsed since the simulation started. */
  elapsedSimMs: number;
  /** Identifier of the current payroll period. */
  periodId: string;
}

export interface CreateEmployeeInput {
  id: EmployeeId;
  name: string;
  profession: ProfessionId;
  department: DepartmentId;
  salary: number;
  /** Simulated time the employee was hired. */
  hiredAtSimMs: number;
}

/**
 * Validates a salary.
 */
export function isValidSalary(salary: unknown): salary is number {
  return (
    isFiniteNumber(salary) && salary >= MIN_EMPLOYEE_SALARY && salary <= MAX_EMPLOYEE_SALARY
  );
}

/**
 * Computes the fee charged for hiring an employee.
 */
export function calculateHiringCost(salary: number, profession: ProfessionId): number {
  const definition = getProfession(profession);
  if (!definition) return HIRING_FLAT_FEE;
  return roundTo(HIRING_FLAT_FEE + salary * definition.hiringCostFactor, 2);
}

/**
 * Creates an employee record.
 */
export function createEmployee(
  input: CreateEmployeeInput,
): Result<Employee, AppError> {
  const fail = (code: string, message: string): Result<Employee, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  if (typeof input.id !== 'string' || input.id.length === 0) {
    return fail('EMPLOYEE_INVALID_ID', 'Employee id must be a non-empty string.');
  }
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    return fail('EMPLOYEE_INVALID_NAME', 'Employee name must be a non-empty string.');
  }
  if (!isProfessionId(input.profession)) {
    return fail('EMPLOYEE_INVALID_PROFESSION', `Unknown profession "${String(input.profession)}".`);
  }
  if (!isDepartmentId(input.department)) {
    return fail('EMPLOYEE_INVALID_DEPARTMENT', `Unknown department "${String(input.department)}".`);
  }
  if (!isValidSalary(input.salary)) {
    return fail(
      'EMPLOYEE_INVALID_SALARY',
      `Salary must be between ${MIN_EMPLOYEE_SALARY} and ${MAX_EMPLOYEE_SALARY}.`,
    );
  }
  if (!isFiniteNumber(input.hiredAtSimMs) || input.hiredAtSimMs < 0) {
    return fail('EMPLOYEE_INVALID_DATE', 'Hiring date must be a valid simulated time.');
  }

  const profession = getProfession(input.profession)!;
  const skill = roundTo(profession.baseSkill, 2);
  const productivity = roundTo(
    clamp(skill * profession.productivityWeight, 0, PRODUCTIVITY_MAX),
    2,
  );

  return {
    ok: true,
    value: {
      id: input.id,
      name: input.name.trim(),
      profession: input.profession,
      department: input.department,
      skill,
      experience: 0,
      salary: input.salary,
      productivity,
      satisfaction: INITIAL_SATISFACTION,
      morale: INITIAL_MORALE,
      status: 'active',
      hiredAtSimMs: input.hiredAtSimMs,
      lastDevelopmentPeriodId: null,
      development: [],
    },
  };
}

export interface HireEmployeeInput {
  profession: ProfessionId;
  department: DepartmentId;
  /** Optional salary override. Defaults to the profession's base salary. */
  salary?: number;
  /** Simulated time the employee is hired. */
  hiredAtSimMs?: number;
}

export interface HireEmployeeResult {
  employee: Employee;
  /** Fee charged for the hire. */
  cost: number;
  /** The employee state after the hire. */
  state: EmployeeState;
}

/**
 * Hires an employee into a corporation.
 *
 * Fails safely when the profession is unknown, the department is not
 * available at the corporation's tier, the employee capacity is exhausted,
 * the salary is invalid or the corporation cannot afford the hiring fee.
 */
export function hireEmployee(
  state: EmployeeState,
  corporation: Corporation,
  input: HireEmployeeInput,
): Result<HireEmployeeResult, AppError> {
  const fail = (code: string, message: string): Result<HireEmployeeResult, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  if (!isProfessionId(input.profession)) {
    return fail('EMPLOYEE_INVALID_PROFESSION', `Unknown profession "${String(input.profession)}".`);
  }
  if (!isDepartmentId(input.department)) {
    return fail('EMPLOYEE_INVALID_DEPARTMENT', `Unknown department "${String(input.department)}".`);
  }

  const tier: CorporationTier | undefined = getCorporationTier(corporation.tierId);
  if (!tier) {
    return fail('CORPORATION_INVALID_TIER', 'The corporation has an unknown tier.');
  }
  if (!tier.availableDepartments.includes(input.department)) {
    return fail(
      'CORPORATION_DEPARTMENT_UNAVAILABLE',
      `The ${tier.name} tier cannot staff the "${input.department}" department.`,
    );
  }

  const activeCount = state.employees.filter((employee) => employee.status !== 'departed').length;
  if (activeCount >= tier.employeeCapacity) {
    return fail(
      'CORPORATION_CAPACITY_REACHED',
      `Employee capacity reached (${activeCount}/${tier.employeeCapacity}).`,
    );
  }

  const profession = getProfession(input.profession)!;
  const salary = input.salary ?? profession.baseSalary;
  if (!isValidSalary(salary)) {
    return fail(
      'EMPLOYEE_INVALID_SALARY',
      `Salary must be between ${MIN_EMPLOYEE_SALARY} and ${MAX_EMPLOYEE_SALARY}.`,
    );
  }

  const cost = calculateHiringCost(salary, input.profession);
  if (corporation.finances.balance < cost) {
    return fail(
      'CORPORATION_INSUFFICIENT_FUNDS',
      `Hiring requires ${cost} but only ${corporation.finances.balance} is available.`,
    );
  }

  const sequence = state.sequence + 1;
  const hiredAtSimMs = isFiniteNumber(input.hiredAtSimMs) && (input.hiredAtSimMs as number) >= 0
    ? (input.hiredAtSimMs as number)
    : 0;

  const created = createEmployee({
    id: generateEmployeeId(sequence),
    name: generateEmployeeName(sequence),
    profession: input.profession,
    department: input.department,
    salary,
    hiredAtSimMs,
  });

  if (!created.ok) {
    logger.error('Employee Engine failed to create an employee', { code: created.error.code });
    return fail(created.error.code, created.error.message);
  }

  const employee: Employee = { ...created.value, hiredAtSimMs };

  return {
    ok: true,
    value: {
      employee,
      cost,
      state: {
        ...state,
        employees: [...state.employees, employee],
        sequence,
      },
    },
  };
}

export interface DismissEmployeeResult {
  employee: Employee;
  /** The employee state after the dismissal. */
  state: EmployeeState;
}

/**
 * Marks an employee as departed.
 */
export function dismissEmployee(
  state: EmployeeState,
  employeeId: EmployeeId,
): Result<DismissEmployeeResult, AppError> {
  const fail = (code: string, message: string): Result<DismissEmployeeResult, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  const employee = state.employees.find((candidate) => candidate.id === employeeId);
  if (!employee) {
    return fail('EMPLOYEE_NOT_FOUND', `No employee with id "${employeeId}".`);
  }
  if (employee.status === 'departed') {
    return fail('EMPLOYEE_ALREADY_DEPARTED', `${employee.name} has already left the corporation.`);
  }

  const departed: Employee = { ...employee, status: 'departed' };

  return {
    ok: true,
    value: {
      employee: departed,
      state: {
        ...state,
        employees: state.employees.map((candidate) =>
          candidate.id === employeeId ? departed : candidate,
        ),
      },
    },
  };
}

/**
 * Moves a value towards a target without ever overshooting it.
 *
 * The convergence factor is clamped to 0..1, so a long simulated step can
 * never push the value past its target.
 */
function converge(current: number, target: number, rate: number, hours: number): number {
  const factor = clamp(rate * hours, 0, 1);
  return current + (target - current) * factor;
}

/**
 * Develops the workforce: experience, skill, satisfaction, morale and
 * productivity all evolve deterministically from the elapsed simulated time.
 */
export function developEmployees(
  state: EmployeeState,
  context: EmployeeContext,
): EmployeeState {
  const hours = context.deltaMs / 3_600_000;

  if (!isFiniteNumber(hours) || hours <= 0) {
    return { ...state, tick: state.tick + 1 };
  }

  const employees = state.employees.map((employee) => {
    if (employee.status === 'departed') return employee;

    const profession = getProfession(employee.profession);
    if (!profession) return employee;

    const experience = roundTo(employee.experience + profession.experienceRate * hours, 2);

    const skillTarget = clamp(
      profession.baseSkill + experience * SKILL_PER_EXPERIENCE,
      0,
      100,
    );
    const skill = roundTo(
      converge(employee.skill, skillTarget, SKILL_CONVERGENCE, hours),
      2,
    );

    const salaryRatio = profession.baseSalary > 0 ? employee.salary / profession.baseSalary : 1;
    const fairnessBonus = clamp(
      (salaryRatio - 1) * SALARY_FAIRNESS_WEIGHT,
      -20,
      20,
    );
    const satisfactionTarget = clamp(profession.satisfactionTarget + fairnessBonus, 0, 100);
    const satisfaction = roundTo(
      converge(employee.satisfaction, satisfactionTarget, SATISFACTION_DRIFT, hours),
      2,
    );

    const moraleTarget = clamp(MORALE_BASE + satisfaction * 0.7, 0, 100);
    const morale = roundTo(
      converge(employee.morale, moraleTarget, MORALE_DRIFT, hours),
      2,
    );

    const productivity = roundTo(
      clamp(
        skill * profession.productivityWeight + (satisfaction - 50) * 0.2,
        0,
        PRODUCTIVITY_MAX,
      ),
      2,
    );

    const developed: Employee = {
      ...employee,
      experience,
      skill,
      satisfaction,
      morale,
      productivity,
    };

    if (employee.lastDevelopmentPeriodId !== context.periodId) {
      const entry = {
        periodId: context.periodId,
        skill: developed.skill,
        experience: developed.experience,
        productivity: developed.productivity,
        satisfaction: developed.satisfaction,
        morale: developed.morale,
      };
      developed.development = [...employee.development, entry].slice(-MAX_DEVELOPMENT_ENTRIES);
      developed.lastDevelopmentPeriodId = context.periodId;
    }

    return developed;
  });

  return { ...state, employees, tick: state.tick + 1 };
}
