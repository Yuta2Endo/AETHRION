/**
 * City Engine — data model.
 *
 * Owns the city record, its districts, its finite land map, the building
 * catalogue and the urban building instances.
 *
 * Design rules (Stage 05):
 * - Everything is **data driven**: the districts, the land map and the building
 *   catalogue are tables. Adding a district or a building never requires an
 *   engine code change.
 * - Identifiers are **deterministic** — no `Date.now()` and no `Math.random()`
 *   ever enters the simulation state.
 * - The state is plain and serialisable.
 * - Values that can be derived safely from the authoritative state are **not**
 *   stored: the housing capacity, the employment capacity, the infrastructure
 *   balance and the building counts are computed by the pure functions of
 *   `cityRules.ts` instead of being duplicated in the record.
 */

import { isFiniteNumber } from '@/core/utils';

export type CityId = string;
export type DistrictId = string;
export type PlotId = string;
export type BuildingId = string;
export type BuildingTypeId = string;

/**
 * The five district types of the initial city.
 *
 * The type drives the building compatibility, the plot prices and the urban
 * development of the district.
 */
export type DistrictType = 'commercial' | 'industrial' | 'research' | 'residential' | 'energy';

/**
 * Zoning category of a land plot.
 *
 * `mixed-use` accepts every building category; the remaining categories accept
 * the building definitions that list them in `compatibleZoning`.
 */
export type ZoningCategory =
  | 'commercial'
  | 'industrial'
  | 'research'
  | 'residential'
  | 'energy'
  | 'mixed-use';

/**
 * Category of a building definition.
 */
export type BuildingCategory =
  | 'corporate'
  | 'industrial'
  | 'research'
  | 'residential'
  | 'infrastructure';

/**
 * Lifecycle state of a city building.
 *
 * - planned      — the record exists and the cost is paid, the work has not begun
 * - constructing — the work progresses with the simulated time
 * - completed    — the building is finished but its infrastructure is short
 * - operational  — the building is finished and running
 * - suspended    — the player suspended the building, it contributes nothing
 * - demolished   — the building was removed, the plot was released
 */
export type BuildingStatus =
  | 'planned'
  | 'constructing'
  | 'completed'
  | 'operational'
  | 'suspended'
  | 'demolished';

/**
 * Ownership state of a land plot.
 *
 * - available — free, not owned, not sold
 * - owned     — owned by a corporation, no building on it
 * - occupied  — a building stands on the plot
 * - sold      — the plot was sold and can never be used again
 */
export type PlotStatus = 'available' | 'owned' | 'occupied' | 'sold';

/**
 * The four urban infrastructure networks.
 *
 * The same shape describes the capacity a provider contributes and the
 * demand a consumer creates.
 */
export interface InfrastructureCapacity {
  /** Electric power, in MWh per simulated hour. */
  electricity: number;
  /** Fresh water, in megalitres per simulated hour. */
  water: number;
  /** Logistics throughput, in shipments per simulated hour. */
  logistics: number;
  /** Civic and commercial services, in service units per simulated hour. */
  publicServices: number;
}

export type InfrastructureDemand = InfrastructureCapacity;

/** The infrastructure categories, in their canonical order. */
export const INFRASTRUCTURE_KEYS = [
  'electricity',
  'water',
  'logistics',
  'publicServices',
] as const;

export type InfrastructureKey = (typeof INFRASTRUCTURE_KEYS)[number];

/** A shortage of one infrastructure category. */
export interface InfrastructureShortage {
  electricity: number;
  water: number;
  logistics: number;
  publicServices: number;
}

/**
 * The infrastructure balance of the city.
 */
export interface InfrastructureBalance {
  /** Total available capacity, municipal baseline included. */
  capacity: InfrastructureCapacity;
  /** Total demand of the active buildings. */
  demand: InfrastructureDemand;
  /** Unmet demand per category (never negative). */
  shortages: InfrastructureShortage;
  /** Utilisation per category, 0..100. */
  utilization: Record<InfrastructureKey, number>;
  /** Lowest utilisation across the four categories, 0..100. */
  lowestUtilization: number;
  /** Share of the demand that is met, 0..1. */
  coverage: number;
}

/**
 * The effects a building produces while it is operational.
 *
 * Every field is a plain number (or a plain capacity record) — there is no
 * special-case behaviour for individual buildings.
 */
export interface BuildingEffects {
  /** Residents the building can house. */
  populationCapacity: number;
  /** Units produced per batch (city industrial capacity). */
  productionCapacity: number;
  /** Research capacity points. */
  researchCapacity: number;
  /** Commercial activity points. */
  commercialActivity: number;
  /** Prosperity points. */
  prosperity: number;
  /** Signed contribution to the environment target (negative is pollution). */
  environmentImpact: number;
  /** Infrastructure capacity the building provides to the city. */
  infrastructureProvided: InfrastructureCapacity;
}

/**
 * Requirements that have to be met before a building may be started.
 */
export interface BuildingUnlockRequirements {
  /** Technologies that must be unlocked (Stage 04 technology tree). */
  technologies?: string[];
  /** Minimum corporation tier id. */
  corporationTier?: string;
}

/**
 * A building blueprint.
 *
 * The blueprint is data; a `CityBuilding` is the corporation's instance of it.
 */
export interface BuildingDefinition {
  id: BuildingTypeId;
  name: string;
  description: string;
  category: BuildingCategory;
  /** District types the building may be built in. */
  compatibleDistricts: DistrictType[];
  /** Zoning categories the plot may carry. */
  compatibleZoning: ZoningCategory[];
  /** Construction cost charged when the building is started. */
  constructionCost: number;
  /** Simulated milliseconds the construction takes. */
  constructionDurationMs: number;
  /** Positions the building can offer once it is operational. */
  workforceCapacity: number;
  /** Operating cost charged per simulated hour while operational. */
  operatingCostPerHour: number;
  /** Infrastructure the building consumes. */
  infrastructureDemand: InfrastructureDemand;
  /** Effects the building produces while operational. */
  effects: BuildingEffects;
  /** Optional unlock requirements. */
  unlockRequirements?: BuildingUnlockRequirements;
}

/**
 * The definition of a district.
 */
export interface DistrictDefinition {
  id: DistrictId;
  name: string;
  type: DistrictType;
  description: string;
  /** Number of land plots the district contains. */
  plotCount: number;
  /** Development level the district starts at, 0..100. */
  baseDevelopment: number;
  /** Multiplier applied to the base price of the plots. */
  priceFactor: number;
}

/**
 * A district of the city.
 */
export interface District {
  id: DistrictId;
  name: string;
  type: DistrictType;
  description: string;
  /** Identifiers of the land plots that belong to the district. */
  plotIds: PlotId[];
  /** Current development level, 0..100. */
  development: number;
  /** Development level the district was founded at, 0..100. */
  baseDevelopment: number;
}

/**
 * A finite land plot.
 */
export interface LandPlot {
  id: PlotId;
  districtId: DistrictId;
  zoning: ZoningCategory;
  /** Purchase price in Aether Credits. */
  price: number;
  /** Owner of the plot, or null when it is free. */
  ownerId: string | null;
  /** Building standing on the plot, or null. */
  buildingId: BuildingId | null;
  /** Whether the plot is connected to the municipal infrastructure network. */
  infrastructureAvailable: boolean;
  /** Ownership state of the plot. */
  status: PlotStatus;
  /** Simulated time the plot was sold, or null. */
  soldAtSimMs: number | null;
}

/**
 * A building instance owned by the corporation.
 */
export interface CityBuilding {
  id: BuildingId;
  typeId: BuildingTypeId;
  name: string;
  category: BuildingCategory;
  plotId: PlotId;
  districtId: DistrictId;
  status: BuildingStatus;
  /** Construction progress, 0..1. */
  progress: number;
  /** Positions the building can offer once it is operational. */
  workforceCapacity: number;
  /** Operating cost charged per simulated hour while operational. */
  operatingCostPerHour: number;
  /** Corporate employees assigned to the building. */
  assignedEmployeeIds: string[];
  /** Effects the building produces while operational. */
  effects: BuildingEffects;
  /** Infrastructure the building consumes. */
  infrastructureDemand: InfrastructureDemand;
  /** Simulated time the construction started. */
  startedAtSimMs: number;
  /** Simulated time the construction completed, or null. */
  completedAtSimMs: number | null;
  /** Whether the infrastructure needs of the building are currently met. */
  infrastructureSatisfied: boolean;
}

/**
 * Aggregated urban figures.
 *
 * The record is recomputed from the authoritative state by
 * `computeCityStatistics()` — it is a snapshot, never a second source of truth.
 */
export interface CityStatistics {
  /** Number of land plots. */
  plotCount: number;
  /** Number of plots owned by the corporation. */
  ownedPlotCount: number;
  /** Number of plots that are still free. */
  availablePlotCount: number;
  /** Number of plots that carry a building. */
  occupiedPlotCount: number;
  /** Number of buildings (demolished ones excluded). */
  buildingCount: number;
  /** Number of buildings that are currently running. */
  operationalBuildingCount: number;
  /** Residents the city can house. */
  housingCapacity: number;
  /** Positions the city can offer. */
  employmentCapacity: number;
  /** Positions that are currently filled. */
  employment: number;
  /** Residents that are not employed. */
  availableWorkforce: number;
  /** Infrastructure balance of the city. */
  infrastructure: InfrastructureBalance;
  /** Aggregate commercial activity, 0..100. */
  commercialActivity: number;
  /** Aggregate research capacity, 0..100. */
  researchCapacity: number;
  /** Aggregate industrial capacity, in units per batch. */
  industrialCapacity: number;
  /** Aggregate energy demand, in MWh per simulated hour. */
  energyDemand: number;
  /** Total operating cost of the city, per simulated hour. */
  operatingCostPerHour: number;
}

/**
 * The city record.
 */
export interface City {
  id: CityId;
  name: string;
  /** Simulated time the city was founded (epoch milliseconds). */
  foundedAtSimMs: number;
  /** Development level, 1..5. */
  level: number;
  /** Overall development, 0..100. */
  development: number;
  /** Residents of the city. */
  population: number;
  /** Filled positions. */
  employment: number;
  /** Unemployed residents, 0..100 (percent of the population). */
  unemployment: number;
  /** Prosperity, 0..100. */
  prosperity: number;
  /** Infrastructure quality, 0..100. */
  infrastructure: number;
  /** Environmental quality, 0..100. */
  environment: number;
  /** Public services quality, 0..100. */
  publicServices: number;
  districts: District[];
  plots: LandPlot[];
  buildings: CityBuilding[];
  /** Municipal infrastructure that exists before any player building. */
  baselineInfrastructure: InfrastructureCapacity;
  /** Residents the municipal housing stock can house. */
  baselineHousingCapacity: number;
  /** Positions the municipal institutions offer. */
  baselineEmploymentCapacity: number;
  /** Aggregated urban figures. */
  statistics: CityStatistics;
  /** Deterministic identifier sequence. */
  sequence: number;
  /** Number of city ticks processed. */
  tick: number;
}

/**
 * The city state — a single city in the Stage 05 MVP.
 */
export interface CityState {
  city: City | null;
  /** Number of city ticks processed. */
  tick: number;
}

/**
 * The five districts of the initial city.
 */
export const CITY_DISTRICT_DEFINITIONS: readonly DistrictDefinition[] = [
  {
    id: 'district_downtown',
    name: 'Downtown',
    type: 'commercial',
    description: 'Corporate offices and the commercial heart of the city.',
    plotCount: 6,
    baseDevelopment: 55,
    priceFactor: 1.35,
  },
  {
    id: 'district_industrial',
    name: 'Industrial Zone',
    type: 'industrial',
    description: 'Manufacturing plants and the logistics network.',
    plotCount: 6,
    baseDevelopment: 40,
    priceFactor: 1,
  },
  {
    id: 'district_research',
    name: 'Research Park',
    type: 'research',
    description: 'Research facilities and technology development.',
    plotCount: 6,
    baseDevelopment: 45,
    priceFactor: 1.15,
  },
  {
    id: 'district_residential',
    name: 'Residential District',
    type: 'residential',
    description: 'Housing and the residential workforce of the city.',
    plotCount: 6,
    baseDevelopment: 35,
    priceFactor: 0.85,
  },
  {
    id: 'district_energy',
    name: 'Energy District',
    type: 'energy',
    description: 'Power generation and the water network.',
    plotCount: 6,
    baseDevelopment: 30,
    priceFactor: 0.95,
  },
];

/**
 * Base price of a plot, by zoning category.
 */
export const PLOT_BASE_PRICES: Record<ZoningCategory, number> = {
  commercial: 6_000,
  industrial: 5_000,
  research: 5_500,
  residential: 4_000,
  energy: 4_500,
  'mixed-use': 4_800,
};

/**
 * The zoning mix of every district.
 *
 * The mix is deliberately varied: a district may contain plots that do not
 * carry its dominant zoning, so that the zoning and the district are two
 * independent restrictions. A `mixed-use` plot accepts every building that is
 * allowed in the district anyway.
 */
export const DISTRICT_ZONING_MIX: Record<DistrictType, readonly ZoningCategory[]> = {
  commercial: ['commercial', 'commercial', 'commercial', 'mixed-use', 'mixed-use', 'industrial'],
  industrial: ['industrial', 'industrial', 'industrial', 'industrial', 'industrial', 'energy'],
  research: ['research', 'research', 'research', 'research', 'mixed-use', 'mixed-use'],
  residential: [
    'residential',
    'residential',
    'residential',
    'residential',
    'mixed-use',
    'mixed-use',
  ],
  energy: ['energy', 'energy', 'energy', 'energy', 'mixed-use', 'mixed-use'],
};

/**
 * Municipal infrastructure that exists before the player builds anything.
 */
export const BASELINE_INFRASTRUCTURE: InfrastructureCapacity = {
  electricity: 60,
  water: 50,
  logistics: 40,
  publicServices: 30,
};

/** Residents the municipal housing stock can house. */
export const BASELINE_HOUSING_CAPACITY = 300;
/** Positions the municipal institutions offer. */
export const BASELINE_EMPLOYMENT_CAPACITY = 180;

/** Share of the purchase price refunded when a plot is sold again. */
export const PLOT_RESALE_RATE = 0.6;

/** Minimum length of a valid city name. */
export const MIN_CITY_NAME_LENGTH = 2;
/** Maximum length of a valid city name. */
export const MAX_CITY_NAME_LENGTH = 40;

const HOUR = 3_600_000;

function emptyCapacity(): InfrastructureCapacity {
  return { electricity: 0, water: 0, logistics: 0, publicServices: 0 };
}

/**
 * The building catalogue — thirteen data-driven blueprints.
 */
export const BUILDING_DEFINITIONS: readonly BuildingDefinition[] = [
  // ------------------------------------------------------------- Corporate
  {
    id: 'corporate-headquarters',
    name: 'Corporate Headquarters',
    description: 'The flagship seat of the corporation, anchoring the downtown skyline.',
    category: 'corporate',
    compatibleDistricts: ['commercial'],
    compatibleZoning: ['commercial', 'mixed-use'],
    constructionCost: 24_000,
    constructionDurationMs: 96 * HOUR,
    workforceCapacity: 120,
    operatingCostPerHour: 180,
    infrastructureDemand: { electricity: 60, water: 40, logistics: 50, publicServices: 60 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 0,
      researchCapacity: 4,
      commercialActivity: 22,
      prosperity: 18,
      environmentImpact: 5,
      infrastructureProvided: emptyCapacity(),
    },
    unlockRequirements: { corporationTier: 'growth' },
  },
  {
    id: 'regional-office',
    name: 'Regional Office',
    description: 'A local branch office handling administration and client relations.',
    category: 'corporate',
    compatibleDistricts: ['commercial'],
    compatibleZoning: ['commercial', 'mixed-use'],
    constructionCost: 9_500,
    constructionDurationMs: 48 * HOUR,
    workforceCapacity: 40,
    operatingCostPerHour: 60,
    infrastructureDemand: { electricity: 20, water: 14, logistics: 18, publicServices: 18 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 0,
      researchCapacity: 2,
      commercialActivity: 11,
      prosperity: 9,
      environmentImpact: 2,
      infrastructureProvided: emptyCapacity(),
    },
  },

  // ------------------------------------------------------------- Industrial
  {
    id: 'electronics-factory',
    name: 'Electronics Factory',
    description: 'A plant producing computing and automation hardware.',
    category: 'industrial',
    compatibleDistricts: ['industrial'],
    compatibleZoning: ['industrial', 'mixed-use'],
    constructionCost: 12_000,
    constructionDurationMs: 60 * HOUR,
    workforceCapacity: 70,
    operatingCostPerHour: 95,
    infrastructureDemand: { electricity: 45, water: 25, logistics: 35, publicServices: 15 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 40,
      researchCapacity: 0,
      commercialActivity: 0,
      prosperity: 0,
      environmentImpact: -10,
      infrastructureProvided: emptyCapacity(),
    },
  },
  {
    id: 'materials-plant',
    name: 'Materials Processing Plant',
    description: 'Heavy industry refining metals and advanced materials.',
    category: 'industrial',
    compatibleDistricts: ['industrial'],
    compatibleZoning: ['industrial', 'mixed-use'],
    constructionCost: 10_500,
    constructionDurationMs: 54 * HOUR,
    workforceCapacity: 60,
    operatingCostPerHour: 80,
    infrastructureDemand: { electricity: 40, water: 30, logistics: 40, publicServices: 14 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 60,
      researchCapacity: 0,
      commercialActivity: 0,
      prosperity: 0,
      environmentImpact: -16,
      infrastructureProvided: emptyCapacity(),
    },
  },
  {
    id: 'assembly-facility',
    name: 'Assembly Facility',
    description: 'A flexible plant assembling finished goods of every category.',
    category: 'industrial',
    compatibleDistricts: ['industrial'],
    compatibleZoning: ['industrial', 'mixed-use'],
    constructionCost: 15_500,
    constructionDurationMs: 72 * HOUR,
    workforceCapacity: 85,
    operatingCostPerHour: 110,
    infrastructureDemand: { electricity: 55, water: 30, logistics: 45, publicServices: 18 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 50,
      researchCapacity: 0,
      commercialActivity: 0,
      prosperity: 0,
      environmentImpact: -12,
      infrastructureProvided: emptyCapacity(),
    },
    unlockRequirements: { technologies: ['robotic-assembly'] },
  },

  // --------------------------------------------------------------- Research
  {
    id: 'research-laboratory',
    name: 'Research Laboratory',
    description: 'A laboratory hosting the applied research teams of the corporation.',
    category: 'research',
    compatibleDistricts: ['research'],
    compatibleZoning: ['research', 'mixed-use'],
    constructionCost: 11_000,
    constructionDurationMs: 60 * HOUR,
    workforceCapacity: 45,
    operatingCostPerHour: 95,
    infrastructureDemand: { electricity: 30, water: 18, logistics: 15, publicServices: 16 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 0,
      researchCapacity: 18,
      commercialActivity: 0,
      prosperity: 4,
      environmentImpact: 2,
      infrastructureProvided: emptyCapacity(),
    },
  },
  {
    id: 'advanced-technology-center',
    name: 'Advanced Technology Center',
    description: 'A high-security campus for frontier development programmes.',
    category: 'research',
    compatibleDistricts: ['research'],
    compatibleZoning: ['research', 'mixed-use'],
    constructionCost: 19_000,
    constructionDurationMs: 90 * HOUR,
    workforceCapacity: 80,
    operatingCostPerHour: 160,
    infrastructureDemand: { electricity: 55, water: 30, logistics: 22, publicServices: 24 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 0,
      researchCapacity: 32,
      commercialActivity: 0,
      prosperity: 6,
      environmentImpact: 4,
      infrastructureProvided: emptyCapacity(),
    },
    unlockRequirements: { technologies: ['neural-array'], corporationTier: 'established' },
  },

  // ------------------------------------------------------------ Residential
  {
    id: 'residential-complex',
    name: 'Residential Complex',
    description: 'Moderate density housing for the working population.',
    category: 'residential',
    compatibleDistricts: ['residential'],
    compatibleZoning: ['residential', 'mixed-use'],
    constructionCost: 8_500,
    constructionDurationMs: 48 * HOUR,
    workforceCapacity: 12,
    operatingCostPerHour: 35,
    infrastructureDemand: { electricity: 10, water: 8, logistics: 5, publicServices: 5 },
    effects: {
      populationCapacity: 420,
      productionCapacity: 0,
      researchCapacity: 0,
      commercialActivity: 0,
      prosperity: 0,
      environmentImpact: 3,
      infrastructureProvided: {
        electricity: 0,
        water: 0,
        logistics: 0,
        publicServices: 20,
      },
    },
  },
  {
    id: 'high-density-housing',
    name: 'High-Density Housing',
    description: 'Vertical housing blocks that absorb a rapidly growing population.',
    category: 'residential',
    compatibleDistricts: ['residential'],
    compatibleZoning: ['residential', 'mixed-use'],
    constructionCost: 14_000,
    constructionDurationMs: 66 * HOUR,
    workforceCapacity: 18,
    operatingCostPerHour: 50,
    infrastructureDemand: { electricity: 18, water: 14, logistics: 8, publicServices: 9 },
    effects: {
      populationCapacity: 950,
      productionCapacity: 0,
      researchCapacity: 0,
      commercialActivity: 0,
      prosperity: 0,
      environmentImpact: -2,
      infrastructureProvided: {
        electricity: 0,
        water: 0,
        logistics: 0,
        publicServices: 38,
      },
    },
    unlockRequirements: { corporationTier: 'growth' },
  },

  // ---------------------------------------------------------- Infrastructure
  {
    id: 'power-station',
    name: 'Power Station',
    description: 'A fusion plant feeding the electricity network of the city.',
    category: 'infrastructure',
    compatibleDistricts: ['energy', 'industrial'],
    compatibleZoning: ['energy', 'industrial', 'mixed-use'],
    constructionCost: 13_500,
    constructionDurationMs: 72 * HOUR,
    workforceCapacity: 35,
    operatingCostPerHour: 120,
    infrastructureDemand: { electricity: 0, water: 18, logistics: 12, publicServices: 6 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 0,
      researchCapacity: 0,
      commercialActivity: 0,
      prosperity: 0,
      environmentImpact: -14,
      infrastructureProvided: { electricity: 130, water: 0, logistics: 0, publicServices: 0 },
    },
    unlockRequirements: { technologies: ['helion-fusion'] },
  },
  {
    id: 'logistics-center',
    name: 'Logistics Center',
    description: 'Freight sorting and distribution for the whole metropolitan area.',
    category: 'infrastructure',
    compatibleDistricts: ['industrial', 'commercial'],
    compatibleZoning: ['industrial', 'commercial', 'mixed-use'],
    constructionCost: 9_000,
    constructionDurationMs: 48 * HOUR,
    workforceCapacity: 45,
    operatingCostPerHour: 85,
    infrastructureDemand: { electricity: 26, water: 6, logistics: 8, publicServices: 8 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 0,
      researchCapacity: 0,
      commercialActivity: 6,
      prosperity: 0,
      environmentImpact: -8,
      infrastructureProvided: { electricity: 0, water: 0, logistics: 95, publicServices: 0 },
    },
  },
  {
    id: 'commercial-center',
    name: 'Commercial Center',
    description: 'Retail and civic services at the centre of the commercial district.',
    category: 'infrastructure',
    compatibleDistricts: ['commercial'],
    compatibleZoning: ['commercial', 'mixed-use'],
    constructionCost: 11_500,
    constructionDurationMs: 60 * HOUR,
    workforceCapacity: 55,
    operatingCostPerHour: 95,
    infrastructureDemand: { electricity: 22, water: 16, logistics: 20, publicServices: 10 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 0,
      researchCapacity: 0,
      commercialActivity: 20,
      prosperity: 14,
      environmentImpact: -3,
      infrastructureProvided: {
        electricity: 0,
        water: 0,
        logistics: 0,
        publicServices: 26,
      },
    },
    unlockRequirements: { technologies: ['photonic-cores'] },
  },
  {
    id: 'water-treatment-facility',
    name: 'Water Treatment Facility',
    description: 'Purifies and distributes the water supply of the city.',
    category: 'infrastructure',
    compatibleDistricts: ['energy', 'industrial', 'commercial'],
    compatibleZoning: ['energy', 'industrial', 'commercial', 'mixed-use'],
    constructionCost: 10_500,
    constructionDurationMs: 54 * HOUR,
    workforceCapacity: 28,
    operatingCostPerHour: 70,
    infrastructureDemand: { electricity: 32, water: 4, logistics: 10, publicServices: 8 },
    effects: {
      populationCapacity: 0,
      productionCapacity: 0,
      researchCapacity: 0,
      commercialActivity: 0,
      prosperity: 2,
      environmentImpact: 8,
      infrastructureProvided: { electricity: 0, water: 110, logistics: 0, publicServices: 0 },
    },
  },
];

/**
 * Looks up a building definition by its identifier.
 */
export function getBuildingDefinition(id: BuildingTypeId): BuildingDefinition | undefined {
  return BUILDING_DEFINITIONS.find((definition) => definition.id === id);
}

/**
 * Looks up a district definition by its identifier.
 */
export function getDistrictDefinition(id: DistrictId): DistrictDefinition | undefined {
  return CITY_DISTRICT_DEFINITIONS.find((definition) => definition.id === id);
}

/**
 * Whether a building definition may be built in a district type.
 */
export function isDistrictCompatible(
  definition: BuildingDefinition,
  districtType: DistrictType,
): boolean {
  return definition.compatibleDistricts.includes(districtType);
}

/**
 * Whether a building definition may be built on a zoning category.
 */
export function isZoningCompatible(
  definition: BuildingDefinition,
  zoning: ZoningCategory,
): boolean {
  return definition.compatibleZoning.includes(zoning);
}

/**
 * Creates an empty infrastructure capacity record.
 */
export function createEmptyCapacity(): InfrastructureCapacity {
  return emptyCapacity();
}

/**
 * Adds two infrastructure capacity records.
 */
export function addCapacity(
  a: InfrastructureCapacity,
  b: InfrastructureCapacity,
): InfrastructureCapacity {
  return {
    electricity: a.electricity + b.electricity,
    water: a.water + b.water,
    logistics: a.logistics + b.logistics,
    publicServices: a.publicServices + b.publicServices,
  };
}

/**
 * Validates a building definition.
 */
export function isValidBuildingDefinition(definition: BuildingDefinition): boolean {
  if (!definition) return false;
  if (typeof definition.id !== 'string' || definition.id.length === 0) return false;
  if (typeof definition.name !== 'string' || definition.name.length === 0) return false;
  if (typeof definition.description !== 'string') return false;
  if (!['corporate', 'industrial', 'research', 'residential', 'infrastructure'].includes(definition.category)) {
    return false;
  }
  if (!Array.isArray(definition.compatibleDistricts) || definition.compatibleDistricts.length === 0) {
    return false;
  }
  if (!Array.isArray(definition.compatibleZoning) || definition.compatibleZoning.length === 0) {
    return false;
  }
  if (!isFiniteNumber(definition.constructionCost) || definition.constructionCost <= 0) return false;
  if (!isFiniteNumber(definition.constructionDurationMs) || definition.constructionDurationMs <= 0) {
    return false;
  }
  if (!isFiniteNumber(definition.workforceCapacity) || definition.workforceCapacity < 0) return false;
  if (!isFiniteNumber(definition.operatingCostPerHour) || definition.operatingCostPerHour < 0) {
    return false;
  }
  return (
    isValidCapacity(definition.infrastructureDemand) && isValidCapacity(definition.effects.infrastructureProvided)
  );
}

/**
 * Validates an infrastructure capacity or demand record.
 */
export function isValidCapacity(capacity: InfrastructureCapacity): boolean {
  if (!capacity) return false;
  return INFRASTRUCTURE_KEYS.every((key) => {
    const value = capacity[key];
    return isFiniteNumber(value) && value >= 0;
  });
}

/**
 * Validates a land plot.
 */
export function isValidLandPlot(plot: LandPlot): boolean {
  if (!plot || typeof plot.id !== 'string' || plot.id.length === 0) return false;
  if (typeof plot.districtId !== 'string' || plot.districtId.length === 0) return false;
  if (!isFiniteNumber(plot.price) || plot.price < 0) return false;
  if (plot.ownerId !== null && typeof plot.ownerId !== 'string') return false;
  if (plot.buildingId !== null && typeof plot.buildingId !== 'string') return false;
  if (typeof plot.infrastructureAvailable !== 'boolean') return false;
  if (!['available', 'owned', 'occupied', 'sold'].includes(plot.status)) return false;

  // The status must agree with the ownership and the building reference.
  if (plot.status === 'available' && (plot.ownerId !== null || plot.buildingId !== null)) return false;
  if (plot.status === 'owned' && (plot.ownerId === null || plot.buildingId !== null)) return false;
  if (plot.status === 'occupied' && plot.buildingId === null) return false;
  if (plot.status === 'sold' && (plot.buildingId !== null || plot.soldAtSimMs === null)) return false;
  if (plot.soldAtSimMs !== null && !isFiniteNumber(plot.soldAtSimMs)) return false;

  return true;
}

/**
 * Validates a city building record.
 */
export function isValidCityBuilding(building: CityBuilding): boolean {
  if (!building || typeof building.id !== 'string' || building.id.length === 0) return false;
  if (!getBuildingDefinition(building.typeId)) return false;
  if (typeof building.name !== 'string' || building.name.length === 0) return false;
  if (typeof building.plotId !== 'string' || building.plotId.length === 0) return false;
  if (typeof building.districtId !== 'string' || building.districtId.length === 0) return false;
  if (
    !['planned', 'constructing', 'completed', 'operational', 'suspended', 'demolished'].includes(
      building.status,
    )
  ) {
    return false;
  }
  if (!isFiniteNumber(building.progress) || building.progress < 0 || building.progress > 1) return false;
  if (!isFiniteNumber(building.workforceCapacity) || building.workforceCapacity < 0) return false;
  if (!isFiniteNumber(building.operatingCostPerHour) || building.operatingCostPerHour < 0) return false;
  if (!Array.isArray(building.assignedEmployeeIds)) return false;
  if (new Set(building.assignedEmployeeIds).size !== building.assignedEmployeeIds.length) return false;
  if (!isValidCapacity(building.infrastructureDemand)) return false;
  if (!isValidCapacity(building.effects.infrastructureProvided)) return false;
  if (!isFiniteNumber(building.effects.populationCapacity) || building.effects.populationCapacity < 0) {
    return false;
  }
  if (!isFiniteNumber(building.effects.productionCapacity) || building.effects.productionCapacity < 0) {
    return false;
  }
  if (!isFiniteNumber(building.effects.researchCapacity) || building.effects.researchCapacity < 0) {
    return false;
  }
  if (!isFiniteNumber(building.effects.commercialActivity) || building.effects.commercialActivity < 0) {
    return false;
  }
  if (!isFiniteNumber(building.effects.prosperity) || building.effects.prosperity < 0) return false;
  if (!isFiniteNumber(building.effects.environmentImpact)) return false;
  if (!isFiniteNumber(building.startedAtSimMs) || building.startedAtSimMs < 0) return false;
  if (building.completedAtSimMs !== null && !isFiniteNumber(building.completedAtSimMs)) return false;
  if (typeof building.infrastructureSatisfied !== 'boolean') return false;
  return true;
}

/**
 * Validates a district record.
 */
export function isValidDistrict(district: District): boolean {
  if (!district || typeof district.id !== 'string' || district.id.length === 0) return false;
  if (typeof district.name !== 'string' || district.name.length === 0) return false;
  if (!['commercial', 'industrial', 'research', 'residential', 'energy'].includes(district.type)) {
    return false;
  }
  if (!Array.isArray(district.plotIds)) return false;
  if (!isFiniteNumber(district.development) || district.development < 0 || district.development > 100) {
    return false;
  }
  if (!isFiniteNumber(district.baseDevelopment) || district.baseDevelopment < 0) return false;
  return true;
}

/**
 * Validates the whole city record.
 */
export function isValidCity(city: City): boolean {
  if (!city) return false;
  if (typeof city.id !== 'string' || city.id.length === 0) return false;
  if (typeof city.name !== 'string' || city.name.length === 0) return false;
  if (!isFiniteNumber(city.foundedAtSimMs) || city.foundedAtSimMs < 0) return false;
  if (!isFiniteNumber(city.level) || city.level < 1) return false;
  if (!isFiniteNumber(city.development) || city.development < 0 || city.development > 100) return false;
  if (!isFiniteNumber(city.population) || city.population < 0) return false;
  if (!isFiniteNumber(city.employment) || city.employment < 0) return false;
  if (!isFiniteNumber(city.unemployment) || city.unemployment < 0 || city.unemployment > 100) {
    return false;
  }
  if (!isFiniteNumber(city.prosperity) || city.prosperity < 0 || city.prosperity > 100) return false;
  if (!isFiniteNumber(city.infrastructure) || city.infrastructure < 0 || city.infrastructure > 100) {
    return false;
  }
  if (!isFiniteNumber(city.environment) || city.environment < 0 || city.environment > 100) return false;
  if (!isFiniteNumber(city.publicServices) || city.publicServices < 0 || city.publicServices > 100) {
    return false;
  }
  if (!isValidCapacity(city.baselineInfrastructure)) return false;
  if (!isFiniteNumber(city.baselineHousingCapacity) || city.baselineHousingCapacity < 0) return false;
  if (!isFiniteNumber(city.baselineEmploymentCapacity) || city.baselineEmploymentCapacity < 0) {
    return false;
  }
  if (!isFiniteNumber(city.sequence) || city.sequence < 0) return false;
  if (!isFiniteNumber(city.tick) || city.tick < 0) return false;

  if (!Array.isArray(city.districts) || city.districts.length === 0) return false;
  if (!Array.isArray(city.plots) || city.plots.length === 0) return false;
  if (!Array.isArray(city.buildings)) return false;
  if (!city.statistics) return false;

  const districtIds = new Set<string>();
  for (const district of city.districts) {
    if (!isValidDistrict(district)) return false;
    if (districtIds.has(district.id)) return false;
    districtIds.add(district.id);
  }

  const plotIds = new Set<string>();
  for (const plot of city.plots) {
    if (!isValidLandPlot(plot)) return false;
    if (plotIds.has(plot.id)) return false;
    plotIds.add(plot.id);
    if (!districtIds.has(plot.districtId)) return false;
  }

  const buildingIds = new Set<string>();
  for (const building of city.buildings) {
    if (!isValidCityBuilding(building)) return false;
    if (buildingIds.has(building.id)) return false;
    buildingIds.add(building.id);
    if (!plotIds.has(building.plotId)) return false;
    if (!districtIds.has(building.districtId)) return false;
  }

  // A plot may never carry more than one building.
  const occupiedPlots = new Set<string>();
  for (const building of city.buildings) {
    if (building.status === 'demolished') continue;
    if (occupiedPlots.has(building.plotId)) return false;
    occupiedPlots.add(building.plotId);
  }

  return true;
}

/**
 * Validates the whole city state, including identifier uniqueness.
 */
export function isValidCityState(state: CityState): boolean {
  if (!state) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;
  if (state.city === null) return true;
  return isValidCity(state.city);
}
