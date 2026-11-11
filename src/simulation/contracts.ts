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
 * The corporation produces this signal and the Economy Engine consumes it to
 * modulate commodity supply and demand (Stage 04). The signal is a plain
 * structure so that neither engine has to import the other.
 */
export interface CorporateMarketSignal {
  /** Aggregate corporate demand pressure, 0..100. */
  demandPressure: number;
  /** Aggregate corporate supply pressure, 0..100. */
  supplyPressure: number;
  /** Workforce productivity driving the signal, 0..100. */
  productivity: number;
}

/**
 * Typed integration boundary between the City Engine and the Economy Engine.
 *
 * The city produces this signal and the Economy Engine consumes it to
 * modulate the commodity demand (Stage 05). Like the corporate signal it is a
 * plain structure, so neither engine has to import the other.
 *
 * The signal is only produced while the city actually runs something — an
 * untouched city leaves the economy exactly as it was.
 */
export interface CityMarketSignal {
  /** Aggregate urban commercial activity, 0..100. */
  commercialActivity: number;
  /** Aggregate urban research capacity, 0..100. */
  researchCapacity: number;
  /** Aggregate urban industrial capacity, in units per batch. */
  industrialCapacity: number;
  /** Urban energy demand, in MWh per simulated hour. */
  energyDemand: number;
  /** Residents of the city. */
  population: number;
  /** Utilisation of the weakest infrastructure network, 0..100. */
  infrastructureUtilization: number;
}

/**
 * Identifier of a tradeable resource.
 *
 * Resources are consumed by products and by manufacturing. The identifier
 * lives here so that the Product, Resource and Production engines can share
 * it without importing each other.
 */
export type ResourceId =
  | 'raw-materials'
  | 'metals'
  | 'electronics'
  | 'energy'
  | 'components'
  | 'advanced-materials'
  | 'research-data'
  | 'industrial-chemicals';

/**
 * A resource requirement: how many units of a resource are needed.
 */
export type ResourceRequirement = Partial<Record<ResourceId, number>>;
