/**
 * Employee Engine — data model.
 *
 * Owns the employee records. The Corporation Engine never stores employee
 * data — headcount and workforce statistics are derived from this state.
 */

import { isFiniteNumber } from '@/core/utils';
import type { DepartmentId } from '@/simulation/contracts';

export type EmployeeId = string;
export type ProfessionId =
  | 'manager'
  | 'researcher'
  | 'engineer'
  | 'production-worker'
  | 'marketer';

/**
 * Employment status of an employee.
 * - active  : employed and contributing
 * - at-risk : employed, but the workforce is under strain (e.g. missed payroll)
 * - departed : no longer employed by the corporation
 */
export type EmploymentStatus = 'active' | 'at-risk' | 'departed';

/**
 * Baseline attributes of a profession.
 *
 * The table is data driven: a new profession is added by extending this list
 * and the `ProfessionId` union — the Employee Engine does not hardcode the
 * individual professions.
 */
export interface Profession {
  id: ProfessionId;
  name: string;
  /** Salary paid per payroll period. */
  baseSalary: number;
  /** Starting skill level, 0..100. */
  baseSkill: number;
  /** Experience gained per simulated hour. */
  experienceRate: number;
  /** How strongly skill converts into productivity. */
  productivityWeight: number;
  /** Hiring fee as a fraction of the salary. */
  hiringCostFactor: number;
  /** Target satisfaction for employees of this profession, 0..100. */
  satisfactionTarget: number;
}

export const PROFESSIONS: readonly Profession[] = [
  {
    id: 'manager',
    name: 'Manager',
    baseSalary: 2400,
    baseSkill: 55,
    experienceRate: 0.9,
    productivityWeight: 0.9,
    hiringCostFactor: 0.4,
    satisfactionTarget: 65,
  },
  {
    id: 'researcher',
    name: 'Researcher',
    baseSalary: 1800,
    baseSkill: 50,
    experienceRate: 1.2,
    productivityWeight: 1.05,
    hiringCostFactor: 0.35,
    satisfactionTarget: 70,
  },
  {
    id: 'engineer',
    name: 'Engineer',
    baseSalary: 2000,
    baseSkill: 52,
    experienceRate: 1.1,
    productivityWeight: 1.0,
    hiringCostFactor: 0.35,
    satisfactionTarget: 68,
  },
  {
    id: 'production-worker',
    name: 'Production Worker',
    baseSalary: 1300,
    baseSkill: 45,
    experienceRate: 0.8,
    productivityWeight: 1.1,
    hiringCostFactor: 0.3,
    satisfactionTarget: 62,
  },
  {
    id: 'marketer',
    name: 'Marketer',
    baseSalary: 1600,
    baseSkill: 40,
    experienceRate: 0.95,
    productivityWeight: 0.85,
    hiringCostFactor: 0.3,
    satisfactionTarget: 66,
  },
];

export const MIN_EMPLOYEE_SALARY = 300;
export const MAX_EMPLOYEE_SALARY = 10_000;
/** Maximum number of development snapshots kept per employee. */
export const MAX_DEVELOPMENT_ENTRIES = 12;

export interface EmployeeDevelopment {
  periodId: string;
  skill: number;
  experience: number;
  productivity: number;
  satisfaction: number;
  morale: number;
}

export interface Employee {
  id: EmployeeId;
  name: string;
  profession: ProfessionId;
  department: DepartmentId;
  /** Current skill level, 0..100. */
  skill: number;
  /** Accumulated experience, in simulated hours. */
  experience: number;
  /** Salary paid per payroll period. */
  salary: number;
  /** Current productivity, 0..100. */
  productivity: number;
  /** Job satisfaction, 0..100. */
  satisfaction: number;
  /** Morale, 0..100. */
  morale: number;
  status: EmploymentStatus;
  /** Simulated time the employee was hired (epoch milliseconds). */
  hiredAtSimMs: number;
  /** Last payroll period a development snapshot was recorded for. */
  lastDevelopmentPeriodId: string | null;
  /** Bounded development history. */
  development: EmployeeDevelopment[];
}

export interface EmployeeState {
  employees: Employee[];
  /** Sequence used to generate unique, deterministic identifiers. */
  sequence: number;
  /** Number of employee ticks processed. */
  tick: number;
}

/**
 * Deterministic name pools. An employee name is derived from the sequence
 * number, so the same sequence always produces the same name — no random
 * outcomes enter the simulation.
 */
const FIRST_NAMES = [
  'Aria',
  'Kael',
  'Mira',
  'Doran',
  'Sable',
  'Iven',
  'Nyx',
  'Tarin',
  'Vela',
  'Rhen',
  'Oryn',
  'Calis',
] as const;

const LAST_NAMES = [
  'Voss',
  'Nadir',
  'Quell',
  'Brenn',
  'Halcyon',
  'Seris',
  'Dovan',
  'Ilsa',
  'Kern',
  'Marlow',
] as const;

/**
 * Builds a deterministic employee name from a sequence number.
 */
export function generateEmployeeName(index: number): string {
  const safeIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  const first = FIRST_NAMES[safeIndex % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(safeIndex / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

/**
 * Builds a deterministic employee identifier from a sequence number.
 */
export function generateEmployeeId(index: number): EmployeeId {
  return `emp_${String(index).padStart(4, '0')}`;
}

/**
 * Creates the empty employee state.
 */
export function createInitialEmployeeState(): EmployeeState {
  return {
    employees: [],
    sequence: 0,
    tick: 0,
  };
}

/**
 * Looks up a profession by its identifier.
 */
export function getProfession(id: ProfessionId): Profession | undefined {
  return PROFESSIONS.find((profession) => profession.id === id);
}

export function isProfessionId(value: unknown): value is ProfessionId {
  return typeof value === 'string' && PROFESSIONS.some((profession) => profession.id === value);
}

/**
 * Validates an employee record.
 */
export function isValidEmployee(employee: Employee): boolean {
  if (!employee || typeof employee.id !== 'string' || employee.id.length === 0) return false;
  if (typeof employee.name !== 'string' || employee.name.length === 0) return false;
  if (!isProfessionId(employee.profession)) return false;
  if (typeof employee.department !== 'string') return false;
  if (!isFiniteNumber(employee.skill) || employee.skill < 0 || employee.skill > 100) return false;
  if (!isFiniteNumber(employee.experience) || employee.experience < 0) return false;
  if (!isFiniteNumber(employee.salary) || employee.salary < 0) return false;
  if (!isFiniteNumber(employee.productivity) || employee.productivity < 0) return false;
  if (!isFiniteNumber(employee.satisfaction) || employee.satisfaction < 0 || employee.satisfaction > 100) {
    return false;
  }
  if (!isFiniteNumber(employee.morale) || employee.morale < 0 || employee.morale > 100) return false;
  if (!['active', 'at-risk', 'departed'].includes(employee.status)) return false;
  if (!isFiniteNumber(employee.hiredAtSimMs) || employee.hiredAtSimMs < 0) return false;
  if (!Array.isArray(employee.development)) return false;
  if (employee.development.length > MAX_DEVELOPMENT_ENTRIES) return false;
  for (const entry of employee.development) {
    if (!entry || typeof entry.periodId !== 'string') return false;
    if (!isFiniteNumber(entry.skill) || !isFiniteNumber(entry.productivity)) return false;
  }
  return true;
}

/**
 * Validates the whole employee state, including identifier uniqueness.
 */
export function isValidEmployeeState(state: EmployeeState): boolean {
  if (!state || !Array.isArray(state.employees)) return false;
  if (!isFiniteNumber(state.sequence) || state.sequence < 0) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;

  const ids = new Set<EmployeeId>();
  for (const employee of state.employees) {
    if (!isValidEmployee(employee)) return false;
    if (ids.has(employee.id)) return false;
    ids.add(employee.id);
  }

  return true;
}

/**
 * Finds an employee by its stable identifier.
 */
export function findEmployee(state: EmployeeState, id: EmployeeId): Employee | undefined {
  return state.employees.find((employee) => employee.id === id);
}

/**
 * Returns the employees that are currently employed.
 */
export function getActiveEmployees(state: EmployeeState): Employee[] {
  return state.employees.filter((employee) => employee.status !== 'departed');
}

/**
 * Sum of the productivity of every employed employee.
 */
export function getWorkforceProductivity(state: EmployeeState): number {
  return getActiveEmployees(state).reduce(
    (total, employee) => total + employee.productivity,
    0,
  );
}
