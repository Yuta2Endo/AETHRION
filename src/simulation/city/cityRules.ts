/**
 * City Engine — deterministic rules.
 *
 * All functions are pure: the same state and context always produce the same
 * result. Nothing here depends on React, the rendering engine or the system
 * clock — the simulated time arrives through the context.
 *
 * Rules (all rates expressed per simulated hour):
 *
 * 1. **Construction** progresses with the simulated time and completes exactly
 *    once — the building changes its status, so it can never complete twice.
 * 2. **Infrastructure** is aggregated city wide: the municipal baseline plus
 *    the capacity of the finished buildings, against the demand of the
 *    finished buildings.
 * 3. **Operational status** follows the infrastructure service level. A
 *    building that cannot be served stays `completed` and contributes nothing.
 * 4. **Population** grows towards the housing capacity and decays towards it
 *    when the housing is lost.
 * 5. **Employment** is the number of positions filled by the residents.
 * 6. **Indicators** converge towards targets derived from the actual city
 *    conditions — there is no randomness anywhere.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import type { CityMarketSignal } from '@/simulation/contracts';
import {
  BASELINE_EMPLOYMENT_CAPACITY,
  BASELINE_HOUSING_CAPACITY,
  BASELINE_INFRASTRUCTURE,
  BUILDING_DEFINITIONS,
  CITY_DISTRICT_DEFINITIONS,
  DISTRICT_ZONING_MIX,
  INFRASTRUCTURE_KEYS,
  MAX_CITY_NAME_LENGTH,
  MIN_CITY_NAME_LENGTH,
  PLOT_BASE_PRICES,
  PLOT_RESALE_RATE,
  addCapacity,
  createEmptyCapacity,
  getBuildingDefinition,
  getDistrictDefinition,
  isDistrictCompatible,
  isValidCityState,
  isZoningCompatible,
  type BuildingDefinition,
  type BuildingId,
  type City,
  type CityBuilding,
  type CityState,
  type District,
  type DistrictId,
  type DistrictType,
  type InfrastructureBalance,
  type InfrastructureCapacity,
  type LandPlot,
  type PlotId,
  type ZoningCategory,
} from './cityState';

/** Simulation hours contained in one millisecond. */
export const SIM_HOUR_MS = 3_600_000;

/**
 * The tunable constants of the city simulation.
 */
export const CITY_RULES = {
  /** Fraction of the housing gap closed per simulated hour. */
  populationGrowthRate: 0.05,
  /** Fraction of the surplus population released per simulated hour. */
  populationDecayRate: 0.1,
  /** Fraction of the gap to an indicator target closed per simulated hour. */
  indicatorConvergence: 0.08,
  /** Fraction of the gap to a district target closed per simulated hour. */
  districtConvergence: 0.06,
  /**
   * The lowest infrastructure service level at which a building still runs.
   * Below this level the building is shut down and contributes nothing.
   */
  minOperationalShare: 0.25,
  /** Environment of a city without any industry. */
  baseEnvironment: 80,
  /** Services per resident that correspond to a perfect public services score. */
  publicServicesPerResident: 200,
  /** Residents that correspond to the maximum population bonus. */
  populationDevelopmentTarget: 2_000,
  /** Development points granted per operational building in a district. */
  districtBuildingBonus: 7,
} as const;

/** Weight of the employment rate inside the prosperity target. */
const PROSPERITY_EMPLOYMENT_WEIGHT = 25;
/** Weight of the commercial activity inside the prosperity target. */
const PROSPERITY_COMMERCIAL_WEIGHT = 0.3;
/** Weight of the environment inside the prosperity target. */
const PROSPERITY_ENVIRONMENT_WEIGHT = 0.15;
/** Weight of the public services inside the prosperity target. */
const PROSPERITY_SERVICES_WEIGHT = 0.15;
/** Weight of the infrastructure inside the prosperity target. */
const PROSPERITY_INFRASTRUCTURE_WEIGHT = 0.05;
/** Base prosperity of an empty city. */
const PROSPERITY_BASE = 10;

/** Weights of the city development target. */
const DEVELOPMENT_WEIGHTS = {
  prosperity: 0.3,
  infrastructure: 0.25,
  environment: 0.15,
  publicServices: 0.1,
  population: 10,
  base: 10,
} as const;

function failure<T>(code: string, message: string): Result<T, AppError> {
  return {
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  };
}

/**
 * The fraction of a gap that is closed after `hours` simulated hours.
 *
 * The rate is expressed per simulated hour; the exponential form guarantees
 * that a single long step can never overshoot the target, whatever the length
 * of the tick is.
 */
export function convergenceFactor(rate: number, hours: number): number {
  if (!isFiniteNumber(rate) || rate <= 0 || !isFiniteNumber(hours) || hours <= 0) return 0;
  if (rate >= 1) return 1;
  return 1 - (1 - rate) ** hours;
}

/**
 * Context supplied to the city rules on every tick.
 */
export interface CityContext {
  /** Current tick number. */
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Simulated time the tick is recorded at. */
  simTimeMs: number;
  /**
   * The city pressures of the active global events (Stage 06).
   *
   * Optional: when it is absent the city behaves exactly as in Stage 05.
   */
  eventCityPressure?: {
    /** Additional infrastructure pressure, 0..1. */
    infrastructure: number;
    /** Additional environmental pressure, 0..1. */
    environment: number;
    /** Multiplier on the commercial activity, 0.5..2. */
    commercialActivity: number;
  };
}

/**
 * The derived figures of a single district.
 */
export interface DistrictMetrics {
  districtId: DistrictId;
  /** Number of plots of the district. */
  plotCount: number;
  /** Number of plots owned by the corporation. */
  ownedPlots: number;
  /** Number of plots that are still free. */
  availablePlots: number;
  /** Number of plots that carry a building. */
  occupiedPlots: number;
  /** Number of buildings in the district (demolished ones excluded). */
  buildingCount: number;
  /** Number of buildings that are currently running. */
  operationalBuildingCount: number;
  /** Residents the district can house. */
  housingCapacity: number;
  /** Positions the district can offer. */
  employmentCapacity: number;
  /** Infrastructure capacity the district provides. */
  infrastructureCapacity: InfrastructureCapacity;
  /** Development level of the district, 0..100. */
  development: number;
}

// ---------------------------------------------------------------- creation

/**
 * Builds the deterministic land map of the initial city.
 *
 * The map is finite and documented — thirty plots spread over five districts.
 */
function createInitialPlots(): { plots: LandPlot[]; districts: District[] } {
  const plots: LandPlot[] = [];
  const districts: District[] = [];
  let plotSequence = 0;

  for (const definition of CITY_DISTRICT_DEFINITIONS) {
    const mix = DISTRICT_ZONING_MIX[definition.type];
    const plotIds: PlotId[] = [];

    for (let index = 0; index < definition.plotCount; index += 1) {
      plotSequence += 1;
      const id = `plot_${String(plotSequence).padStart(3, '0')}`;
      const zoning: ZoningCategory = mix[index % mix.length] ?? 'mixed-use';
      const price = Math.round(PLOT_BASE_PRICES[zoning] * definition.priceFactor);

      plots.push({
        id,
        districtId: definition.id,
        zoning,
        price,
        ownerId: null,
        buildingId: null,
        infrastructureAvailable: true,
        status: 'available',
        soldAtSimMs: null,
      });
      plotIds.push(id);
    }

    districts.push({
      id: definition.id,
      name: definition.name,
      type: definition.type,
      description: definition.description,
      plotIds,
      development: definition.baseDevelopment,
      baseDevelopment: definition.baseDevelopment,
    });
  }

  return { plots, districts };
}

/**
 * Creates the initial city state.
 *
 * The initialization is fully deterministic: the same call always produces the
 * same city, the same districts and the same land map.
 */
export function createInitialCityState(foundedAtSimMs = 0): CityState {
  const { plots, districts } = createInitialPlots();

  const city: City = {
    id: 'city_aethrion',
    name: 'Aethrion Prime',
    foundedAtSimMs,
    level: 1,
    development: 20,
    population: 250,
    employment: 0,
    unemployment: 0,
    prosperity: 30,
    infrastructure: 40,
    environment: 85,
    publicServices: 30,
    districts,
    plots,
    buildings: [],
    baselineInfrastructure: { ...BASELINE_INFRASTRUCTURE },
    baselineHousingCapacity: BASELINE_HOUSING_CAPACITY,
    baselineEmploymentCapacity: BASELINE_EMPLOYMENT_CAPACITY,
    statistics: {
      plotCount: plots.length,
      ownedPlotCount: 0,
      availablePlotCount: plots.length,
      occupiedPlotCount: 0,
      buildingCount: 0,
      operationalBuildingCount: 0,
      housingCapacity: BASELINE_HOUSING_CAPACITY,
      employmentCapacity: BASELINE_EMPLOYMENT_CAPACITY,
      employment: 0,
      availableWorkforce: 250,
      infrastructure: {
        capacity: { ...BASELINE_INFRASTRUCTURE },
        demand: createEmptyCapacity(),
        shortages: createEmptyCapacity(),
        utilization: { electricity: 100, water: 100, logistics: 100, publicServices: 100 },
        lowestUtilization: 100,
        coverage: 1,
      },
      commercialActivity: 0,
      researchCapacity: 0,
      industrialCapacity: 0,
      energyDemand: 0,
      operatingCostPerHour: 0,
    },
    sequence: 0,
    tick: 0,
  };

  return { city, tick: 0 };
}

/**
 * Validates a city name.
 */
export function isValidCityName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= MIN_CITY_NAME_LENGTH && trimmed.length <= MAX_CITY_NAME_LENGTH;
}

// --------------------------------------------------------------- accessors

/**
 * Returns the city of the state, or null when no city exists.
 */
export function getCity(state: CityState): City | null {
  return state.city;
}

/**
 * Finds a district by its identifier.
 */
export function findDistrict(city: City, id: DistrictId): District | undefined {
  return city.districts.find((district) => district.id === id);
}

/**
 * Finds a land plot by its identifier.
 */
export function findPlot(city: City, id: PlotId): LandPlot | undefined {
  return city.plots.find((plot) => plot.id === id);
}

/**
 * Finds a city building by its identifier.
 */
export function findBuilding(city: City, id: BuildingId): CityBuilding | undefined {
  return city.buildings.find((building) => building.id === id);
}

/**
 * Whether a building is finished and still connected to the city.
 * Finished buildings create infrastructure demand and provide capacity.
 */
function isFinished(building: CityBuilding): boolean {
  return building.status === 'completed' || building.status === 'operational';
}

// ------------------------------------------------------------- derivation

/**
 * Computes the infrastructure balance of the city.
 *
 * The capacity is the municipal baseline plus the capacity of the finished
 * buildings; the demand is the demand of the finished buildings.
 */
export function computeInfrastructureBalance(
  city: City,
  infrastructurePressure = 0,
): InfrastructureBalance {
  const capacity: InfrastructureCapacity = { ...city.baselineInfrastructure };
  const demand: InfrastructureCapacity = createEmptyCapacity();

  for (const building of city.buildings) {
    if (!isFinished(building)) continue;
    const provided = building.effects.infrastructureProvided;
    const required = building.infrastructureDemand;
    capacity.electricity += provided.electricity;
    capacity.water += provided.water;
    capacity.logistics += provided.logistics;
    capacity.publicServices += provided.publicServices;
    demand.electricity += required.electricity;
    demand.water += required.water;
    demand.logistics += required.logistics;
    demand.publicServices += required.publicServices;
  }

  // The active global events may press on the infrastructure of the city:
  // the same networks have to serve a larger load.
  const pressure = clamp(infrastructurePressure, 0, 1);
  if (pressure > 0) {
    demand.electricity *= 1 + pressure;
    demand.water *= 1 + pressure;
    demand.logistics *= 1 + pressure;
    demand.publicServices *= 1 + pressure;
  }

  const shortages = createEmptyCapacity();
  const utilization: Record<(typeof INFRASTRUCTURE_KEYS)[number], number> = {
    electricity: 100,
    water: 100,
    logistics: 100,
    publicServices: 100,
  };

  let totalDemand = 0;
  let totalShortage = 0;

  for (const key of INFRASTRUCTURE_KEYS) {
    const needed = demand[key];
    const available = capacity[key];
    totalDemand += needed;
    if (needed > available) {
      shortages[key] = roundTo(needed - available, 4);
      totalShortage += needed - available;
    }
    utilization[key] = needed > 0 ? roundTo(Math.min(100, (available / needed) * 100), 4) : 100;
  }

  const lowestUtilization = roundTo(
    Math.min(...INFRASTRUCTURE_KEYS.map((key) => utilization[key])),
    4,
  );
  const coverage = totalDemand > 0 ? roundTo(clamp(1 - totalShortage / totalDemand, 0, 1), 6) : 1;

  return {
    capacity: {
      electricity: roundTo(capacity.electricity, 4),
      water: roundTo(capacity.water, 4),
      logistics: roundTo(capacity.logistics, 4),
      publicServices: roundTo(capacity.publicServices, 4),
    },
    demand: {
      electricity: roundTo(demand.electricity, 4),
      water: roundTo(demand.water, 4),
      logistics: roundTo(demand.logistics, 4),
      publicServices: roundTo(demand.publicServices, 4),
    },
    shortages,
    utilization,
    lowestUtilization,
    coverage,
  };
}

/**
 * The service level of the infrastructure networks, 0..1.
 *
 * It is the lowest ratio between the available capacity and the demand of the
 * four networks. A city without any demand has a service level of 1.
 */
export function getInfrastructureShare(balance: InfrastructureBalance): number {
  let share = 1;

  for (const key of INFRASTRUCTURE_KEYS) {
    const needed = balance.demand[key];
    if (needed <= 0) continue;
    const ratio = clamp(balance.capacity[key] / needed, 0, 1);
    if (ratio < share) share = ratio;
  }

  return roundTo(share, 6);
}

/**
 * The factor every operational effect of the city is scaled with.
 *
 * A fully served city operates at 100 %, a city at the minimum service level
 * at 25 %. The factor is never negative and never above 1.
 */
export function getOperationalFactor(balance: InfrastructureBalance): number {
  const share = getInfrastructureShare(balance);
  return roundTo(clamp(share, CITY_RULES.minOperationalShare, 1), 6);
}

/**
 * Computes the aggregated urban figures of the city.
 *
 * The result is a snapshot of the authoritative state — it is recomputed
 * whenever the state changes and never becomes a second source of truth.
 */
export function computeCityStatistics(city: City, balance?: InfrastructureBalance): City['statistics'] {
  const infrastructure = balance ?? computeInfrastructureBalance(city);
  const factor = getOperationalFactor(infrastructure);

  let housingCapacity = city.baselineHousingCapacity;
  let employmentCapacity = city.baselineEmploymentCapacity;
  let commercialActivity = 0;
  let researchCapacity = 0;
  let industrialCapacity = 0;
  let energyDemand = 0;
  let operatingCostPerHour = 0;
  let buildingCount = 0;
  let operationalBuildingCount = 0;

  for (const building of city.buildings) {
    if (building.status === 'demolished') continue;
    buildingCount += 1;

    if (building.status !== 'operational') continue;

    operationalBuildingCount += 1;
    housingCapacity += building.effects.populationCapacity * factor;
    employmentCapacity += building.workforceCapacity * factor;
    commercialActivity += building.effects.commercialActivity * factor;
    researchCapacity += building.effects.researchCapacity * factor;
    industrialCapacity += building.effects.productionCapacity * factor;
    energyDemand += building.infrastructureDemand.electricity;
    operatingCostPerHour += building.operatingCostPerHour;
  }

  const population = city.population;
  const employment = roundTo(Math.min(employmentCapacity, population), 4);
  const availableWorkforce = roundTo(Math.max(0, population - employment), 4);

  let ownedPlotCount = 0;
  let availablePlotCount = 0;
  let occupiedPlotCount = 0;

  for (const plot of city.plots) {
    if (plot.status === 'owned' || plot.status === 'occupied') ownedPlotCount += 1;
    if (plot.status === 'available') availablePlotCount += 1;
    if (plot.status === 'occupied') occupiedPlotCount += 1;
  }

  return {
    plotCount: city.plots.length,
    ownedPlotCount,
    availablePlotCount,
    occupiedPlotCount,
    buildingCount,
    operationalBuildingCount,
    housingCapacity: roundTo(housingCapacity, 4),
    employmentCapacity: roundTo(employmentCapacity, 4),
    employment,
    availableWorkforce,
    infrastructure,
    commercialActivity: roundTo(clamp(commercialActivity, 0, 100), 4),
    researchCapacity: roundTo(clamp(researchCapacity, 0, 100), 4),
    industrialCapacity: roundTo(industrialCapacity, 4),
    energyDemand: roundTo(energyDemand, 4),
    operatingCostPerHour: roundTo(operatingCostPerHour, 2),
  };
}

/**
 * Computes the figures of a single district.
 */
export function getDistrictMetrics(
  city: City,
  district: District,
  balance?: InfrastructureBalance,
): DistrictMetrics {
  let ownedPlots = 0;
  let availablePlots = 0;
  let occupiedPlots = 0;

  for (const plotId of district.plotIds) {
    const plot = findPlot(city, plotId);
    if (!plot) continue;
    if (plot.status === 'owned' || plot.status === 'occupied') ownedPlots += 1;
    if (plot.status === 'available') availablePlots += 1;
    if (plot.status === 'occupied') occupiedPlots += 1;
  }

  const infrastructureBalance = balance ?? computeInfrastructureBalance(city);
  const factor = getOperationalFactor(infrastructureBalance);

  let buildingCount = 0;
  let operationalBuildingCount = 0;
  let housingCapacity = 0;
  let employmentCapacity = 0;
  const infrastructureCapacity = createEmptyCapacity();

  for (const building of city.buildings) {
    if (building.districtId !== district.id || building.status === 'demolished') continue;
    buildingCount += 1;
    if (building.status !== 'operational') continue;

    operationalBuildingCount += 1;
    housingCapacity += building.effects.populationCapacity * factor;
    employmentCapacity += building.workforceCapacity * factor;
    const provided = building.effects.infrastructureProvided;
    infrastructureCapacity.electricity += provided.electricity;
    infrastructureCapacity.water += provided.water;
    infrastructureCapacity.logistics += provided.logistics;
    infrastructureCapacity.publicServices += provided.publicServices;
  }

  return {
    districtId: district.id,
    plotCount: district.plotIds.length,
    ownedPlots,
    availablePlots,
    occupiedPlots,
    buildingCount,
    operationalBuildingCount,
    housingCapacity: roundTo(housingCapacity, 4),
    employmentCapacity: roundTo(employmentCapacity, 4),
    infrastructureCapacity: {
      electricity: roundTo(infrastructureCapacity.electricity, 4),
      water: roundTo(infrastructureCapacity.water, 4),
      logistics: roundTo(infrastructureCapacity.logistics, 4),
      publicServices: roundTo(infrastructureCapacity.publicServices, 4),
    },
    development: district.development,
  };
}

/**
 * Total operating cost of the city per simulated hour.
 *
 * Only operational buildings cost money — a suspended or unfinished building
 * does not.
 */
export function getCityOperatingCostPerHour(city: City): number {
  return roundTo(
    city.buildings
      .filter((building) => building.status === 'operational')
      .reduce((total, building) => total + building.operatingCostPerHour, 0),
    2,
  );
}

/**
 * Builds the signal the Economy Engine consumes.
 *
 * The signal is only produced when the city actually runs something — an
 * untouched city leaves the economy exactly as it was.
 */
export function buildCityMarketSignal(city: City): CityMarketSignal | null {
  const operational = city.buildings.filter((building) => building.status === 'operational');
  if (operational.length === 0) return null;

  const balance = computeInfrastructureBalance(city);
  const factor = getOperationalFactor(balance);

  let commercialActivity = 0;
  let researchCapacity = 0;
  let industrialCapacity = 0;
  let energyDemand = 0;

  for (const building of operational) {
    commercialActivity += building.effects.commercialActivity * factor;
    researchCapacity += building.effects.researchCapacity * factor;
    industrialCapacity += building.effects.productionCapacity * factor;
    energyDemand += building.infrastructureDemand.electricity;
  }

  return {
    commercialActivity: roundTo(clamp(commercialActivity, 0, 100), 4),
    researchCapacity: roundTo(clamp(researchCapacity, 0, 100), 4),
    industrialCapacity: roundTo(industrialCapacity, 4),
    energyDemand: roundTo(energyDemand, 4),
    population: city.population,
    infrastructureUtilization: balance.lowestUtilization,
  };
}

// ----------------------------------------------------------------- commands

/**
 * Renames the city.
 */
export function renameCity(state: CityState, name: string): Result<{ city: City; state: CityState }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  if (!isValidCityName(name)) {
    return failure(
      'CITY_INVALID_NAME',
      `The city name must be ${MIN_CITY_NAME_LENGTH}-${MAX_CITY_NAME_LENGTH} characters.`,
    );
  }

  const city = { ...state.city, name: name.trim() };
  return { ok: true, value: { city, state: { ...state, city } } };
}

/**
 * Buys a land plot for the corporation.
 *
 * The financial charge happens in the command layer — this function only
 * validates the plot and updates the city.
 */
export function purchasePlot(
  state: CityState,
  plotId: PlotId,
  corporationId: string,
  simTimeMs: number,
): Result<{ plot: LandPlot; state: CityState }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  if (typeof corporationId !== 'string' || corporationId.length === 0) {
    return failure('CITY_INVALID_OWNER', 'A plot needs a valid owner.');
  }
  if (!isFiniteNumber(simTimeMs) || simTimeMs < 0) {
    return failure('CITY_INVALID_TIME', 'The purchase time must be a valid simulated time.');
  }

  const plot = findPlot(state.city, plotId);
  if (!plot) {
    return failure('CITY_PLOT_NOT_FOUND', `No land plot with id "${plotId}".`);
  }
  if (plot.status === 'sold') {
    return failure('CITY_PLOT_SOLD', 'This plot was sold and can never be used again.');
  }
  if (plot.status !== 'available') {
    return failure('CITY_PLOT_NOT_AVAILABLE', 'This plot is not available for purchase.');
  }
  if (!isFiniteNumber(plot.price) || plot.price < 0) {
    return failure('CITY_PLOT_INVALID_PRICE', 'The plot price is invalid.');
  }

  const updated: LandPlot = {
    ...plot,
    ownerId: corporationId,
    status: 'owned',
    soldAtSimMs: null,
  };

  const city = {
    ...state.city,
    plots: state.city.plots.map((candidate) => (candidate.id === plotId ? updated : candidate)),
  };

  return {
    ok: true,
    value: {
      plot: updated,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
    },
  };
}

/**
 * Sells a land plot back to the city.
 *
 * Only an unoccupied plot can be sold — a plot that carries a building is
 * protected. The plot is retired afterwards and can never be used again.
 *
 * The refund is the documented resale value: `PLOT_RESALE_RATE` of the
 * purchase price. The financial transaction happens in the command layer.
 */
export function sellPlot(
  state: CityState,
  plotId: PlotId,
  simTimeMs: number,
): Result<{ plot: LandPlot; state: CityState; refund: number }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  if (!isFiniteNumber(simTimeMs) || simTimeMs < 0) {
    return failure('CITY_INVALID_TIME', 'The sale time must be a valid simulated time.');
  }

  const plot = findPlot(state.city, plotId);
  if (!plot) {
    return failure('CITY_PLOT_NOT_FOUND', `No land plot with id "${plotId}".`);
  }
  if (plot.status === 'occupied') {
    return failure('CITY_PLOT_OCCUPIED', 'An occupied plot cannot be sold.');
  }
  if (plot.status === 'sold') {
    return failure('CITY_PLOT_SOLD', 'This plot was sold and can never be used again.');
  }
  if (plot.status !== 'owned' || plot.ownerId === null) {
    return failure('CITY_PLOT_NOT_OWNED', 'This plot is not owned by the corporation.');
  }

  const refund = roundTo(plot.price * PLOT_RESALE_RATE, 2);

  const updated: LandPlot = {
    ...plot,
    ownerId: null,
    status: 'sold',
    soldAtSimMs: simTimeMs,
  };

  const city = {
    ...state.city,
    plots: state.city.plots.map((candidate) => (candidate.id === plotId ? updated : candidate)),
  };

  return {
    ok: true,
    value: {
      plot: updated,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
      refund,
    },
  };
}

/**
 * Starts the construction of a building on an owned plot.
 *
 * The construction cost is charged by the command layer — this function only
 * validates the request and creates the construction record.
 */
export function startConstruction(
  state: CityState,
  input: {
    buildingTypeId: string;
    plotId: PlotId;
    corporationId: string;
    startedAtSimMs: number;
  },
): Result<{ building: CityBuilding; state: CityState; definition: BuildingDefinition }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  if (!isFiniteNumber(input.startedAtSimMs) || input.startedAtSimMs < 0) {
    return failure('CITY_INVALID_TIME', 'The construction time must be a valid simulated time.');
  }

  const definition = getBuildingDefinition(input.buildingTypeId);
  if (!definition) {
    return failure('CITY_UNKNOWN_BUILDING', `Unknown building type "${input.buildingTypeId}".`);
  }

  const plot = findPlot(state.city, input.plotId);
  if (!plot) {
    return failure('CITY_PLOT_NOT_FOUND', `No land plot with id "${input.plotId}".`);
  }
  if (plot.status === 'sold') {
    return failure('CITY_PLOT_SOLD', 'This plot was sold and can never be used again.');
  }
  if (plot.status === 'occupied') {
    return failure('CITY_PLOT_OCCUPIED', 'This plot already carries a building.');
  }
  if (plot.status !== 'owned' || plot.ownerId === null) {
    return failure('CITY_PLOT_NOT_OWNED', 'This plot is not owned by the corporation.');
  }
  if (plot.ownerId !== input.corporationId) {
    return failure('CITY_PLOT_NOT_OWNED', 'This plot belongs to another corporation.');
  }

  const district = findDistrict(state.city, plot.districtId);
  if (!district) {
    return failure('CITY_DISTRICT_NOT_FOUND', `No district with id "${plot.districtId}".`);
  }
  if (!isDistrictCompatible(definition, district.type)) {
    return failure(
      'CITY_DISTRICT_INCOMPATIBLE',
      `A ${definition.name} cannot be built in the ${district.name}.`,
    );
  }
  if (!isZoningCompatible(definition, plot.zoning)) {
    return failure(
      'CITY_ZONING_INCOMPATIBLE',
      `A ${definition.name} cannot be built on a ${plot.zoning} plot.`,
    );
  }
  if (!isFiniteNumber(definition.constructionCost) || definition.constructionCost <= 0) {
    return failure('CITY_INVALID_COST', 'The construction cost is invalid.');
  }
  if (!isFiniteNumber(definition.constructionDurationMs) || definition.constructionDurationMs <= 0) {
    return failure('CITY_INVALID_DURATION', 'The construction duration is invalid.');
  }

  const sequence = state.city.sequence + 1;
  const building: CityBuilding = {
    id: `bld_${String(sequence).padStart(3, '0')}`,
    typeId: definition.id,
    name: definition.name,
    category: definition.category,
    plotId: plot.id,
    districtId: district.id,
    status: 'constructing',
    progress: 0,
    workforceCapacity: definition.workforceCapacity,
    operatingCostPerHour: definition.operatingCostPerHour,
    assignedEmployeeIds: [],
    effects: {
      ...definition.effects,
      infrastructureProvided: { ...definition.effects.infrastructureProvided },
    },
    infrastructureDemand: { ...definition.infrastructureDemand },
    startedAtSimMs: input.startedAtSimMs,
    completedAtSimMs: null,
    infrastructureSatisfied: false,
  };

  const updatedPlot: LandPlot = { ...plot, buildingId: building.id, status: 'occupied' };

  const city = {
    ...state.city,
    sequence,
    buildings: [...state.city.buildings, building],
    plots: state.city.plots.map((candidate) =>
      candidate.id === plot.id ? updatedPlot : candidate,
    ),
  };

  return {
    ok: true,
    value: {
      building,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
      definition,
    },
  };
}

/**
 * Cancels a construction that has not finished yet.
 *
 * The construction cost is **not** refunded — it is a sunk cost, exactly like
 * the cancellation of a research project. The plot is released and stays owned
 * by the corporation. The building record is kept with the status
 * `demolished` so that the history of the city stays complete.
 */
export function cancelConstruction(
  state: CityState,
  buildingId: BuildingId,
  simTimeMs: number,
): Result<{ building: CityBuilding; state: CityState }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  const building = findBuilding(state.city, buildingId);
  if (!building) {
    return failure('CITY_BUILDING_NOT_FOUND', `No building with id "${buildingId}".`);
  }
  if (building.status !== 'planned' && building.status !== 'constructing') {
    return failure('CITY_NOT_CONSTRUCTING', 'Only an unfinished construction can be cancelled.');
  }

  const cancelled: CityBuilding = {
    ...building,
    status: 'demolished',
    completedAtSimMs: simTimeMs,
    infrastructureSatisfied: false,
  };

  const city = {
    ...state.city,
    buildings: state.city.buildings.map((candidate) =>
      candidate.id === buildingId ? cancelled : candidate,
    ),
    plots: state.city.plots.map((plot) =>
      plot.id === building.plotId
        ? {
            ...plot,
            buildingId: null,
            status: plot.ownerId ? ('owned' as const) : ('available' as const),
          }
        : plot,
    ),
  };

  return {
    ok: true,
    value: {
      building: cancelled,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
    },
  };
}

/**
 * Suspends a running building. A suspended building contributes nothing.
 */
export function suspendBuilding(
  state: CityState,
  buildingId: BuildingId,
): Result<{ building: CityBuilding; state: CityState }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  const building = findBuilding(state.city, buildingId);
  if (!building) {
    return failure('CITY_BUILDING_NOT_FOUND', `No building with id "${buildingId}".`);
  }
  if (building.status !== 'operational' && building.status !== 'completed') {
    return failure('CITY_BUILDING_NOT_SUSPENDABLE', 'This building cannot be suspended.');
  }

  const suspended: CityBuilding = {
    ...building,
    status: 'suspended',
    infrastructureSatisfied: false,
  };

  const city = {
    ...state.city,
    buildings: state.city.buildings.map((candidate) =>
      candidate.id === buildingId ? suspended : candidate,
    ),
  };

  return {
    ok: true,
    value: {
      building: suspended,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
    },
  };
}

/**
 * Resumes a suspended building.
 *
 * The operational status is evaluated immediately: the building runs again as
 * soon as the infrastructure networks can serve it.
 */
export function resumeBuilding(
  state: CityState,
  buildingId: BuildingId,
): Result<{ building: CityBuilding; state: CityState }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  const building = findBuilding(state.city, buildingId);
  if (!building) {
    return failure('CITY_BUILDING_NOT_FOUND', `No building with id "${buildingId}".`);
  }
  if (building.status !== 'suspended') {
    return failure('CITY_BUILDING_NOT_SUSPENDED', 'This building is not suspended.');
  }

  const resumed: CityBuilding = { ...building, status: 'completed' };
  const balance = computeInfrastructureBalance(state.city);
  const reconciled = reconcileBuildingStatus(resumed, balance);

  const city = {
    ...state.city,
    buildings: state.city.buildings.map((candidate) =>
      candidate.id === buildingId ? reconciled : candidate,
    ),
  };

  return {
    ok: true,
    value: {
      building: reconciled,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
    },
  };
}

/**
 * Demolishes a finished building and releases its plot.
 *
 * The construction and the operating cost of the building are sunk — nothing
 * is refunded. The plot stays owned by the corporation.
 */
export function demolishBuilding(
  state: CityState,
  buildingId: BuildingId,
  simTimeMs: number,
): Result<{ building: CityBuilding; state: CityState }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  if (!isFiniteNumber(simTimeMs) || simTimeMs < 0) {
    return failure('CITY_INVALID_TIME', 'The demolition time must be a valid simulated time.');
  }
  const building = findBuilding(state.city, buildingId);
  if (!building) {
    return failure('CITY_BUILDING_NOT_FOUND', `No building with id "${buildingId}".`);
  }
  if (building.status !== 'operational' && building.status !== 'completed' && building.status !== 'suspended') {
    return failure('CITY_BUILDING_NOT_DEMOLISHABLE', 'This building cannot be demolished.');
  }

  const demolished: CityBuilding = {
    ...building,
    status: 'demolished',
    completedAtSimMs: building.completedAtSimMs ?? simTimeMs,
    infrastructureSatisfied: false,
  };

  const city = {
    ...state.city,
    buildings: state.city.buildings.map((candidate) =>
      candidate.id === buildingId ? demolished : candidate,
    ),
    plots: state.city.plots.map((plot) =>
      plot.id === building.plotId
        ? {
            ...plot,
            buildingId: null,
            status: plot.ownerId ? ('owned' as const) : ('available' as const),
          }
        : plot,
    ),
  };

  return {
    ok: true,
    value: {
      building: demolished,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
    },
  };
}

/**
 * Assigns corporate employees to a city building.
 *
 * The Employee Engine stays the only authority for the employee records — the
 * city only stores references, exactly like the Production Engine does for its
 * facilities.
 */
export function assignBuildingEmployees(
  state: CityState,
  buildingId: BuildingId,
  employeeIds: string[],
): Result<{ building: CityBuilding; state: CityState }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  if (!Array.isArray(employeeIds)) {
    return failure('CITY_INVALID_ASSIGNMENT', 'The employee assignment is invalid.');
  }
  const building = findBuilding(state.city, buildingId);
  if (!building) {
    return failure('CITY_BUILDING_NOT_FOUND', `No building with id "${buildingId}".`);
  }
  if (building.status === 'planned' || building.status === 'constructing') {
    return failure('CITY_BUILDING_NOT_READY', 'The building is not finished yet.');
  }
  if (building.status === 'demolished') {
    return failure('CITY_BUILDING_DEMOLISHED', 'The building was demolished.');
  }
  if (new Set(employeeIds).size !== employeeIds.length) {
    return failure('COMMAND_DUPLICATE_ASSIGNMENT', 'An employee is assigned twice.');
  }
  const unique = new Set([...building.assignedEmployeeIds, ...employeeIds]);
  if (unique.size !== building.assignedEmployeeIds.length + employeeIds.length) {
    return failure('COMMAND_DUPLICATE_ASSIGNMENT', 'An employee is assigned twice.');
  }
  if (unique.size > building.workforceCapacity) {
    return failure(
      'CITY_WORKFORCE_EXCEEDED',
      `A ${building.name} can employ ${building.workforceCapacity} people.`,
    );
  }

  const updated: CityBuilding = {
    ...building,
    assignedEmployeeIds: [...unique],
  };

  const city = {
    ...state.city,
    buildings: state.city.buildings.map((candidate) =>
      candidate.id === buildingId ? updated : candidate,
    ),
  };

  return {
    ok: true,
    value: {
      building: updated,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
    },
  };
}

/**
 * Removes corporate employees from a city building.
 */
export function unassignBuildingEmployees(
  state: CityState,
  buildingId: BuildingId,
  employeeIds: string[],
): Result<{ building: CityBuilding; state: CityState }, AppError> {
  if (!state.city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  const building = findBuilding(state.city, buildingId);
  if (!building) {
    return failure('CITY_BUILDING_NOT_FOUND', `No building with id "${buildingId}".`);
  }
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return failure('CITY_INVALID_ASSIGNMENT', 'The employee assignment is invalid.');
  }
  for (const id of employeeIds) {
    if (!building.assignedEmployeeIds.includes(id)) {
      return failure('CITY_ASSIGNMENT_MISSING', `The employee "${id}" is not assigned to this building.`);
    }
  }

  const updated: CityBuilding = {
    ...building,
    assignedEmployeeIds: building.assignedEmployeeIds.filter((id) => !employeeIds.includes(id)),
  };

  const city = {
    ...state.city,
    buildings: state.city.buildings.map((candidate) =>
      candidate.id === buildingId ? updated : candidate,
    ),
  };

  return {
    ok: true,
    value: {
      building: updated,
      state: { ...state, city: { ...city, statistics: computeCityStatistics(city) } },
    },
  };
}

// ---------------------------------------------------------------- evolution

/**
 * Evaluates the operational status of a finished building.
 *
 * A building runs while the weakest infrastructure network can serve the
 * whole city at the minimum service level.
 */
function reconcileBuildingStatus(
  building: CityBuilding,
  balance: InfrastructureBalance,
): CityBuilding {
  if (!isFinished(building)) return building;

  const share = getInfrastructureShare(balance);
  const operational = share >= CITY_RULES.minOperationalShare;

  return {
    ...building,
    status: operational ? 'operational' : 'completed',
    infrastructureSatisfied: operational,
  };
}

/**
 * Advances the city by one tick.
 *
 * Invalid input is rejected safely: the incoming state is returned unchanged
 * and the failure is logged, so a corrupted city can never propagate.
 */
export function advanceCity(state: CityState, context: CityContext): CityState {
  if (!isValidCityState(state)) {
    logger.error('City Engine rejected an invalid city state — state left unchanged');
    return state;
  }
  if (!context || !isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    logger.error('City Engine rejected an invalid tick context — state left unchanged');
    return state;
  }
  if (!state.city) {
    return { ...state, tick: state.tick + 1 };
  }

  const hours = context.deltaMs / SIM_HOUR_MS;
  const city = state.city;

  // 1. Construction progress — a building completes exactly once.
  const progressed = city.buildings.map((building) => {
    if (building.status !== 'constructing') return building;
    const definition = getBuildingDefinition(building.typeId);
    if (!definition) return building;

    const progress = clamp(
      roundTo(building.progress + context.deltaMs / definition.constructionDurationMs, 6),
      0,
      1,
    );

    if (progress < 1) {
      return { ...building, progress, status: 'constructing' as const };
    }

    return {
      ...building,
      progress: 1,
      status: 'completed' as const,
      completedAtSimMs: context.simTimeMs,
    };
  });

  // 2. The infrastructure balance of the city.
  const eventPressure = context.eventCityPressure;
  const infrastructurePressure = clamp(eventPressure?.infrastructure ?? 0, 0, 1);
  const withProgress: City = { ...city, buildings: progressed };
  const balance = computeInfrastructureBalance(withProgress, infrastructurePressure);

  // 3. The operational status of every finished building.
  const reconciled = progressed.map((building) => reconcileBuildingStatus(building, balance));
  const withStatus: City = { ...withProgress, buildings: reconciled };

  // 4. The aggregated urban figures.
  const statistics = computeCityStatistics(withStatus, balance);
  const withStatistics: City = { ...withStatus, statistics };

  // 5. Population and employment.
  const housingCapacity = statistics.housingCapacity;
  const employmentCapacity = statistics.employmentCapacity;

  let population = city.population;
  if (hours > 0) {
    const attractiveness = 0.5 + city.prosperity / 200;
    if (housingCapacity > population) {
      population +=
        (housingCapacity - population) *
        convergenceFactor(CITY_RULES.populationGrowthRate * attractiveness, hours);
    } else if (housingCapacity < population) {
      population -=
        (population - housingCapacity) * convergenceFactor(CITY_RULES.populationDecayRate, hours);
    }
  }
  population = roundTo(Math.max(0, Math.min(population, housingCapacity)), 4);

  const employment = roundTo(Math.min(employmentCapacity, population), 4);
  const unemployment =
    population > 0 ? roundTo(clamp(((population - employment) / population) * 100, 0, 100), 4) : 0;

  // 6. The urban indicators.
  const employmentRate = population > 0 ? employment / population : 0;
  const commercialMultiplier = clamp(eventPressure?.commercialActivity ?? 1, 0.5, 2);
  const commercialIndex = clamp(statistics.commercialActivity * commercialMultiplier, 0, 100);

  let environmentImpact = 0;
  for (const building of reconciled) {
    if (building.status !== 'operational') continue;
    environmentImpact += building.effects.environmentImpact;
  }
  const environmentPressure = clamp(eventPressure?.environment ?? 0, 0, 1);
  const environmentTarget = clamp(
    CITY_RULES.baseEnvironment + environmentImpact - environmentPressure * 40,
    0,
    100,
  );

  const publicServiceCapacity =
    city.baselineInfrastructure.publicServices +
    reconciled
      .filter((building) => building.status === 'operational')
      .reduce(
        (total, building) => total + building.effects.infrastructureProvided.publicServices,
        0,
      );
  const servicesPerResident =
    population > 0 ? publicServiceCapacity / population : publicServiceCapacity;
  const publicServicesTarget = clamp(
    servicesPerResident * CITY_RULES.publicServicesPerResident,
    0,
    100,
  );

  const prosperityTarget = clamp(
    PROSPERITY_BASE +
      commercialIndex * PROSPERITY_COMMERCIAL_WEIGHT +
      employmentRate * PROSPERITY_EMPLOYMENT_WEIGHT +
      city.environment * PROSPERITY_ENVIRONMENT_WEIGHT +
      city.publicServices * PROSPERITY_SERVICES_WEIGHT +
      city.infrastructure * PROSPERITY_INFRASTRUCTURE_WEIGHT,
    0,
    100,
  );

  const infrastructureTarget = clamp(balance.lowestUtilization, 0, 100);

  const developmentTarget = clamp(
    DEVELOPMENT_WEIGHTS.base +
      city.prosperity * DEVELOPMENT_WEIGHTS.prosperity +
      city.infrastructure * DEVELOPMENT_WEIGHTS.infrastructure +
      city.environment * DEVELOPMENT_WEIGHTS.environment +
      city.publicServices * DEVELOPMENT_WEIGHTS.publicServices +
      Math.min(1, population / CITY_RULES.populationDevelopmentTarget) * DEVELOPMENT_WEIGHTS.population,
    0,
    100,
  );

  const converge = (current: number, target: number): number =>
    roundTo(
      current +
        (target - current) * convergenceFactor(CITY_RULES.indicatorConvergence, hours),
      4,
    );

  const prosperity = converge(city.prosperity, prosperityTarget);
  const infrastructure = converge(city.infrastructure, infrastructureTarget);
  const environment = converge(city.environment, environmentTarget);
  const publicServices = converge(city.publicServices, publicServicesTarget);
  const development = converge(city.development, developmentTarget);

  // 7. The development level of the districts.
  const districts = city.districts.map((district) => {
    const metrics = getDistrictMetrics(withStatistics, district, balance);
    const target = clamp(
      district.baseDevelopment +
        metrics.operationalBuildingCount * CITY_RULES.districtBuildingBonus +
        metrics.housingCapacity / 40 +
        metrics.employmentCapacity / 60,
      0,
      100,
    );
    return {
      ...district,
      development: roundTo(
        district.development +
          (target - district.development) *
            convergenceFactor(CITY_RULES.districtConvergence, hours),
        4,
      ),
    };
  });

  const level = clamp(1 + Math.floor(development / 20), 1, 5);

  const nextCity: City = {
    ...withStatistics,
    population,
    employment,
    unemployment,
    prosperity,
    infrastructure,
    environment,
    publicServices,
    development,
    level,
    districts,
    tick: city.tick + 1,
  };

  return { city: nextCity, tick: state.tick + 1 };
}

/**
 * The building definitions that may be built in a district.
 */
export function getCompatibleDefinitions(
  districtType: DistrictType,
): BuildingDefinition[] {
  return BUILDING_DEFINITIONS.filter((definition) =>
    isDistrictCompatible(definition, districtType),
  );
}

/**
 * Re-exported for convenience so that the command layer and the interface can
 * reach the capacity helpers through the city module.
 */
export { addCapacity, getDistrictDefinition };
