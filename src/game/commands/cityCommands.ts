/**
 * City commands — land acquisition, construction and urban management.
 *
 * The commands are the only entry point for the player actions of the city.
 * Every command validates its input, applies the domain rules and writes the
 * result to the game state exactly once. A failed command leaves the game
 * state completely unchanged.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import {
  findBuilding,
  getBuildingDefinition,
  purchasePlot,
  sellPlot,
  startConstruction,
  cancelConstruction,
  demolishBuilding,
  renameCity,
  resumeBuilding,
  suspendBuilding,
  assignBuildingEmployees,
  unassignBuildingEmployees,
  type City,
  type CityBuilding,
  type CityState,
  type LandPlot,
} from '@/simulation/city';
import {
  chargeCorporation,
  failure,
  logCommandRejection,
  requireCorporation,
  storeCorporation,
  validateEmployeeAssignment,
} from './shared';

/**
 * Writes the new city state into the game store.
 */
function storeCity(next: CityState): void {
  useGameStore.getState().applyCityState(next);
}

/**
 * Returns the city of the current state, or a typed failure.
 */
function requireCity(): Result<City, AppError> {
  const city = useGameStore.getState().city.city;
  if (!city) {
    return failure('CITY_NOT_FOUND', 'No city has been founded.');
  }
  return { ok: true, value: city };
}

/**
 * Buys a land plot.
 *
 * The purchase price is charged through the corporate ledger — the balance
 * never changes without a transaction. A failed purchase leaves both the city
 * and the corporation untouched.
 */
export function purchaseLandCommand(plotId: string): Result<LandPlot, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const cityResult = requireCity();
  if (!cityResult.ok) return cityResult;

  const plot = cityResult.value.plots.find((candidate) => candidate.id === plotId);
  if (!plot) {
    return failure('CITY_PLOT_NOT_FOUND', `No land plot with id "${plotId}".`);
  }

  const purchased = purchasePlot(store.city, plotId, corporation.id, store.simulation.simTimeMs);
  if (!purchased.ok) {
    logCommandRejection('purchaseLand', purchased.error);
    return purchased;
  }

  const charged = chargeCorporation(corporation, {
    type: 'city',
    amount: -plot.price,
    description: `Land acquisition — ${plot.id}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    logCommandRejection('purchaseLand', charged.error);
    return charged;
  }

  storeCorporation(charged.value);
  storeCity(purchased.value.state);

  logger.info('Land acquired', { plotId, price: plot.price });
  return { ok: true, value: purchased.value.plot };
}

/**
 * Sells an unoccupied land plot back to the city.
 *
 * The plot is retired afterwards — it can never be used again. The refund is
 * the documented resale value of the plot.
 */
export function sellLandCommand(plotId: string): Result<LandPlot, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const cityResult = requireCity();
  if (!cityResult.ok) return cityResult;

  const plot = cityResult.value.plots.find((candidate) => candidate.id === plotId);
  if (!plot) {
    return failure('CITY_PLOT_NOT_FOUND', `No land plot with id "${plotId}".`);
  }
  if (plot.ownerId !== corporation.id) {
    return failure('CITY_PLOT_NOT_OWNED', 'This plot is not owned by the corporation.');
  }

  const sold = sellPlot(store.city, plotId, store.simulation.simTimeMs);
  if (!sold.ok) {
    logCommandRejection('sellLand', sold.error);
    return sold;
  }

  const credited = chargeCorporation(corporation, {
    type: 'city-sale',
    amount: sold.value.refund,
    description: `Land disposal — ${plotId}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!credited.ok) {
    logCommandRejection('sellLand', credited.error);
    return credited;
  }

  storeCorporation(credited.value);
  storeCity(sold.value.state);

  logger.info('Land sold', { plotId, refund: sold.value.refund });
  return { ok: true, value: sold.value.plot };
}

export interface StartConstructionCommand {
  /** Identifier of the building definition. */
  buildingTypeId: string;
  /** Identifier of the plot the building is built on. */
  plotId: string;
}

/**
 * Starts a construction on an owned plot.
 *
 * The construction cost is charged once, through the corporate ledger. The
 * construction then progresses with the simulated time.
 */
export function startConstructionCommand(
  input: StartConstructionCommand,
): Result<CityBuilding, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const cityResult = requireCity();
  if (!cityResult.ok) return cityResult;

  const definition = getBuildingDefinition(input.buildingTypeId);
  if (!definition) {
    return failure('CITY_UNKNOWN_BUILDING', `Unknown building type "${input.buildingTypeId}".`);
  }

  const started = startConstruction(store.city, {
    buildingTypeId: input.buildingTypeId,
    plotId: input.plotId,
    corporationId: corporation.id,
    startedAtSimMs: store.simulation.simTimeMs,
  });

  if (!started.ok) {
    logCommandRejection('startConstruction', started.error);
    return started;
  }

  const requirements = definition.unlockRequirements;
  if (requirements?.technologies) {
    const unlocked = store.technology.unlocked;
    const missing = requirements.technologies.filter((id) => !unlocked.includes(id));
    if (missing.length > 0) {
      const error: AppError = {
        code: 'CITY_TECHNOLOGY_LOCKED',
        message: `This building requires the ${missing.join(', ')} technology.`,
        fatal: false,
        context: {},
        timestamp: Date.now(),
      };
      logCommandRejection('startConstruction', error);
      return { ok: false, error };
    }
  }
  if (requirements?.corporationTier && corporation.tierId !== requirements.corporationTier) {
    return failure(
      'CITY_TIER_LOCKED',
      `This building requires the ${requirements.corporationTier} corporation tier.`,
    );
  }

  const charged = chargeCorporation(corporation, {
    type: 'city',
    amount: -definition.constructionCost,
    description: `Construction — ${definition.name}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    logCommandRejection('startConstruction', charged.error);
    return charged;
  }

  storeCorporation(charged.value);
  storeCity(started.value.state);

  logger.info('Construction started', {
    buildingId: started.value.building.id,
    type: input.buildingTypeId,
    cost: definition.constructionCost,
  });

  return { ok: true, value: started.value.building };
}

/**
 * Cancels an unfinished construction.
 *
 * The construction cost is a sunk cost — it is not refunded. The plot is
 * released and stays owned by the corporation.
 */
export function cancelConstructionCommand(buildingId: string): Result<CityBuilding, AppError> {
  const store = useGameStore.getState();

  const cancelled = cancelConstruction(store.city, buildingId, store.simulation.simTimeMs);
  if (!cancelled.ok) {
    logCommandRejection('cancelConstruction', cancelled.error);
    return cancelled;
  }

  storeCity(cancelled.value.state);
  logger.info('Construction cancelled', { buildingId });
  return { ok: true, value: cancelled.value.building };
}

/**
 * Assigns corporate employees to a city building.
 *
 * The Employee Engine stays the only authority for the employee records.
 */
export function assignBuildingCommand(
  buildingId: string,
  employeeIds: string[],
): Result<CityBuilding, AppError> {
  const store = useGameStore.getState();

  const assignment = validateEmployeeAssignment(employeeIds, store.employees.employees);
  if (!assignment.ok) {
    logCommandRejection('assignBuilding', assignment.error);
    return assignment;
  }

  const assigned = assignBuildingEmployees(store.city, buildingId, employeeIds);
  if (!assigned.ok) {
    logCommandRejection('assignBuilding', assigned.error);
    return assigned;
  }

  storeCity(assigned.value.state);
  return { ok: true, value: assigned.value.building };
}

/**
 * Removes corporate employees from a city building.
 */
export function unassignBuildingCommand(
  buildingId: string,
  employeeIds: string[],
): Result<CityBuilding, AppError> {
  const store = useGameStore.getState();

  const unassigned = unassignBuildingEmployees(store.city, buildingId, employeeIds);
  if (!unassigned.ok) {
    logCommandRejection('unassignBuilding', unassigned.error);
    return unassigned;
  }

  storeCity(unassigned.value.state);
  return { ok: true, value: unassigned.value.building };
}

/**
 * Suspends a running city building.
 */
export function suspendBuildingCommand(buildingId: string): Result<CityBuilding, AppError> {
  const store = useGameStore.getState();

  const suspended = suspendBuilding(store.city, buildingId);
  if (!suspended.ok) {
    logCommandRejection('suspendBuilding', suspended.error);
    return suspended;
  }

  storeCity(suspended.value.state);
  logger.info('Building suspended', { buildingId });
  return { ok: true, value: suspended.value.building };
}

/**
 * Resumes a suspended city building.
 */
export function resumeBuildingCommand(buildingId: string): Result<CityBuilding, AppError> {
  const store = useGameStore.getState();

  const resumed = resumeBuilding(store.city, buildingId);
  if (!resumed.ok) {
    logCommandRejection('resumeBuilding', resumed.error);
    return resumed;
  }

  storeCity(resumed.value.state);
  logger.info('Building resumed', { buildingId });
  return { ok: true, value: resumed.value.building };
}

/**
 * Demolishes a finished city building and releases its plot.
 */
export function demolishBuildingCommand(buildingId: string): Result<CityBuilding, AppError> {
  const store = useGameStore.getState();

  const demolished = demolishBuilding(store.city, buildingId, store.simulation.simTimeMs);
  if (!demolished.ok) {
    logCommandRejection('demolishBuilding', demolished.error);
    return demolished;
  }

  storeCity(demolished.value.state);
  logger.info('Building demolished', { buildingId });
  return { ok: true, value: demolished.value.building };
}

/**
 * Renames the city.
 */
export function renameCityCommand(name: string): Result<City, AppError> {
  const store = useGameStore.getState();

  const renamed = renameCity(store.city, name);
  if (!renamed.ok) {
    logCommandRejection('renameCity', renamed.error);
    return renamed;
  }

  storeCity(renamed.value.state);
  logger.info('City renamed', { name: renamed.value.city.name });
  return { ok: true, value: renamed.value.city };
}

/**
 * Returns a city building of the current state — used by the interface.
 */
export function getCityBuilding(buildingId: string): CityBuilding | undefined {
  const city = useGameStore.getState().city.city;
  return city ? findBuilding(city, buildingId) : undefined;
}
