/**
 * Cross-engine contracts.
 *
 * Plain, dependency-free types shared by two or more domain engines. This
 * module contains **no engine logic** — it only defines the vocabulary that
 * lets the engines talk to each other without importing each other.
 *
 * Keeping the contracts here avoids a dependency between the Corporation
 * Engine and the Employee Engine, and between the Corporation Engine and the
 * Economy Engine.
 */

/**
 * Identifier of the currency used for every monetary value in the simulation.
 * Matches the base currency of the Economy Engine (`aeth` — Aether Credits).
 */
export const BASE_CURRENCY_ID = 'aeth';
export const BASE_CURRENCY_SYMBOL = 'AΞ';

/**
 * Corporate department structure.
 *
 * The set is intentionally small and flat. A complex organisational hierarchy
 * is out of scope for Stage 03 and can be layered on later by extending this
 * union — the engines read the identifiers, they do not hardcode them.
 */
export type DepartmentId =
  | 'management'
  | 'research'
  | 'engineering'
  | 'production'
  | 'marketing'
  | 'finance';

export interface Department {
  id: DepartmentId;
  name: string;
  /** Short description of the department's purpose. */
  focus: string;
}

export const DEPARTMENTS: readonly Department[] = [
  { id: 'management', name: 'Management', focus: 'Strategy, planning and corporate direction' },
  { id: 'research', name: 'Research', focus: 'Scientific exploration and prototyping' },
  { id: 'engineering', name: 'Engineering', focus: 'Product design and technical execution' },
  { id: 'production', name: 'Production', focus: 'Manufacturing and operational throughput' },
  { id: 'marketing', name: 'Marketing', focus: 'Market reach, sales and brand growth' },
  { id: 'finance', name: 'Finance', focus: 'Capital, budgets and investment' },
];

export function isDepartmentId(value: unknown): value is DepartmentId {
  return typeof value === 'string' && DEPARTMENTS.some((department) => department.id === value);
}

export function getDepartment(id: DepartmentId): Department | undefined {
  return DEPARTMENTS.find((department) => department.id === id);
}

/**
 * Typed integration boundary between the Corporation Engine and the
 * Economy Engine.
 *
 * The corporation can produce this signal, but the Economy Engine does **not**
 * consume it yet: the market model has no notion of goods that could be
 * offered (products and production arrive in Stage 04). Wiring it now would
 * be an artificial economic effect, so the contract is defined and the
 * connection is deferred and documented.
 */
export interface CorporateMarketSignal {
  /** Aggregate corporate demand pressure, 0..100. */
  demandPressure: number;
  /** Aggregate corporate supply pressure, 0..100. */
  supplyPressure: number;
  /** Workforce productivity driving the signal, 0..100. */
  productivity: number;
}
