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
 * Category of a traded commodity.
 *
 * The vocabulary lives here because the Economy, Events and Competitor
 * engines all have to speak about commodity categories without importing each
 * other.
 */
export type CommodityCategory = 'compute' | 'energy' | 'materials' | 'logistics';

/**
 * Typed integration boundary between the Competitor AI Engine and the
 * Economy Engine (Stage 06).
 *
 * The competitors never touch the market directly — they report their
 * competitive pressure per commodity category and the Economy Engine applies
 * it. Every field is bounded and the influence is applied exactly once per
 * economy update.
 */
export interface CompetitorMarketSignal {
  /** Competitor supply pressure per commodity category, 0..100. */
  supplyPressure: Record<CommodityCategory, number>;
  /** Competitor demand pressure per commodity category, 0..100. */
  demandPressure: Record<CommodityCategory, number>;
  /**
   * Competitive price pressure per commodity category, -1..1.
   * Negative means the competitors undercut the market, positive means they
   * push the prices up.
   */
  pricePressure: Record<CommodityCategory, number>;
}

/**
 * The aggregated effect of the currently active global events.
 *
 * The Events Engine produces this snapshot and the engines that are affected
 * consume the single modifier they care about. Every multiplier is bounded to
 * 0.5 .. 2 and every pressure to 0 .. 1, so overlapping events can never
 * produce an unbounded effect.
 */
export interface EventEnvironmentModifiers {
  /** Multiplier on the commodity demand, per category. */
  commodityDemand: Record<CommodityCategory, number>;
  /** Multiplier on the commodity supply, per category. */
  commoditySupply: Record<CommodityCategory, number>;
  /** Multiplier on the corporate operating costs. */
  operatingCost: number;
  /** Multiplier on the research speed. */
  researchSpeed: number;
  /** Multiplier on the production efficiency. */
  productionEfficiency: number;
  /** Multiplier on the market demand of the products. */
  marketDemand: number;
  /** Additional infrastructure pressure on the city, 0..1. */
  cityInfrastructurePressure: number;
  /** Additional environmental pressure on the city, 0..1. */
  cityEnvironmentPressure: number;
  /** Multiplier on the commercial activity of the city. */
  cityCommercialActivity: number;
  /** Multiplier on the activity of the competitors. */
  competitorActivity: number;
}

/**
 * The categories of the news items.
 */
export type NewsCategory = 'event' | 'competitor' | 'technology' | 'market' | 'player';

/**
 * The severity of a news item.
 */
export type NewsSeverity = 'info' | 'low' | 'medium' | 'high';

/**
 * A news item that an engine wants to publish.
 *
 * The Global Events Engine owns the news feed; the other engines produce
 * candidates and let it create the item — that keeps the identifier sequence
 * in one place.
 */
export interface NewsCandidate {
  category: NewsCategory;
  headline: string;
  description: string;
  /** The identifier of the related entity, when there is one. */
  relatedId: string | null;
  severity: NewsSeverity;
}

/**
 * Identifier of a tradeable resource.
 *
 * Resources are consumed by products and by manufacturing. The identifier
 * lives here so that the Product, Resource and Production engines can share
 * it without importing each other.
 */export type ResourceId =
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
