import { describe, it, expect } from 'vitest';
import type { AppError, Result } from '@/core/types';
import {
  BUILDING_DEFINITIONS,
  CITY_DISTRICT_DEFINITIONS,
  CITY_RULES,
  INFRASTRUCTURE_KEYS,
  advanceCity,
  assignBuildingEmployees,
  buildCityMarketSignal,
  cancelConstruction,
  computeCityStatistics,
  computeInfrastructureBalance,
  createInitialCityState,
  demolishBuilding,
  findBuilding,
  findDistrict,
  findPlot,
  getBuildingDefinition,
  getDistrictMetrics,
  getInfrastructureShare,
  getOperationalFactor,
  isValidBuildingDefinition,
  isValidCity,
  isValidCityName,
  isValidCityState,
  isValidDistrict,
  isValidLandPlot,
  purchasePlot,
  renameCity,
  resumeBuilding,
  sellPlot,
  startConstruction,
  suspendBuilding,
  type CityState,
} from '@/simulation/city';

const HOUR = 3_600_000;
const CORP = 'corp_test';

/**
 * Asserts that an operation failed and returns its typed error.
 */
function expectFailure<T>(result: Result<T, AppError>): AppError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('the operation was expected to fail');
  return result.error;
}

function tick(city: CityState, hours = 1, simTimeMs = 0): CityState {
  return advanceCity(city, { tick: 0, deltaMs: hours * HOUR, simTimeMs });
}

/** Buys a plot and returns the new state. */
function buyPlot(state: CityState, plotId: string): CityState {
  const result = purchasePlot(state, plotId, CORP, 0);
  if (!result.ok) throw new Error(`plot ${plotId} could not be bought`);
  return result.value.state;
}

/** Buys a plot and starts a construction on it. */
function buildOn(
  state: CityState,
  plotId: string,
  buildingTypeId: string,
): { state: CityState; buildingId: string } {
  const owned = buyPlot(state, plotId);
  const result = startConstruction(owned, {
    buildingTypeId,
    plotId,
    corporationId: CORP,
    startedAtSimMs: 0,
  });
  if (!result.ok) throw new Error(`construction failed: ${result.error.message}`);
  return { state: result.value.state, buildingId: result.value.building.id };
}

/** Finds the first free plot of a district with a given zoning. */
function plotOf(state: CityState, districtId: string, zoning: string): string {
  const city = state.city!;
  const district = findDistrict(city, districtId)!;
  for (const plotId of district.plotIds) {
    const plot = findPlot(city, plotId)!;
    if (plot.zoning === zoning && plot.status === 'available') return plotId;
  }
  throw new Error(`no free ${zoning} plot in ${districtId}`);
}

/** Builds the given number of electronics factories in the industrial zone. */
function buildIndustrialFactories(state: CityState, count: number): CityState {
  let working = state;
  const plots = findDistrict(working.city!, 'district_industrial')!.plotIds;

  for (let index = 0; index < count; index += 1) {
    working = buildOn(working, plots[index], 'electronics-factory').state;
  }

  return working;
}

describe('City Engine — deterministic initialization', () => {
  it('creates the same city on every call', () => {
    const first = createInitialCityState();
    const second = createInitialCityState();

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('creates a valid city state', () => {
    const state = createInitialCityState();

    expect(isValidCityState(state)).toBe(true);
    expect(isValidCity(state.city!)).toBe(true);
    expect(state.city).not.toBeNull();
  });

  it('creates exactly five districts with unique identifiers', () => {
    const state = createInitialCityState();
    const districts = state.city!.districts;

    expect(districts).toHaveLength(5);
    expect(new Set(districts.map((district) => district.id)).size).toBe(5);
    expect(districts.map((district) => district.type).sort()).toEqual([
      'commercial',
      'energy',
      'industrial',
      'research',
      'residential',
    ]);
    districts.forEach((district) => {
      expect(isValidDistrict(district)).toBe(true);
    });
  });

  it('creates a finite land map with unique plot identifiers', () => {
    const state = createInitialCityState();
    const plots = state.city!.plots;

    expect(plots).toHaveLength(30);
    expect(new Set(plots.map((plot) => plot.id)).size).toBe(30);
    plots.forEach((plot) => {
      expect(isValidLandPlot(plot)).toBe(true);
      expect(plot.status).toBe('available');
      expect(plot.ownerId).toBeNull();
      expect(plot.price).toBeGreaterThan(0);
    });
  });

  it('assigns every plot to an existing district', () => {
    const state = createInitialCityState();
    const districtIds = new Set(state.city!.districts.map((district) => district.id));

    state.city!.plots.forEach((plot) => {
      expect(districtIds.has(plot.districtId)).toBe(true);
    });
  });

  it('keeps the indicators inside their documented range', () => {
    const state = createInitialCityState();
    const city = state.city!;

    [city.development, city.prosperity, city.infrastructure, city.environment, city.publicServices].forEach(
      (value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      },
    );
    expect(city.population).toBeGreaterThanOrEqual(0);
    expect(city.unemployment).toBeGreaterThanOrEqual(0);
    expect(city.unemployment).toBeLessThanOrEqual(100);
  });

  it('rejects an invalid city state and leaves it unchanged', () => {
    const state = createInitialCityState();
    const broken = { ...state, city: { ...state.city!, population: -5 } };

    const next = advanceCity(broken, { tick: 1, deltaMs: HOUR, simTimeMs: HOUR });

    expect(next).toBe(broken);
  });

  it('rejects an invalid tick context', () => {
    const state = createInitialCityState();

    expect(advanceCity(state, { tick: 1, deltaMs: Number.NaN, simTimeMs: 0 })).toBe(state);
    expect(advanceCity(state, { tick: 1, deltaMs: -10, simTimeMs: 0 })).toBe(state);
  });

  it('validates the city name', () => {
    expect(isValidCityName('Aethrion Prime')).toBe(true);
    expect(isValidCityName('x')).toBe(false);
    expect(isValidCityName('  ')).toBe(false);
    expect(isValidCityName('x'.repeat(60))).toBe(false);
  });

  it('renames the city', () => {
    const state = createInitialCityState();
    const renamed = renameCity(state, '  New Avalon  ');

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.value.city.name).toBe('New Avalon');
    expect(renameCity(state, 'x').ok).toBe(false);
  });
});

describe('City Engine — land', () => {
  it('buys an available plot', () => {
    const state = createInitialCityState();
    const plotId = state.city!.plots[0].id;

    const result = purchasePlot(state, plotId, CORP, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plot.ownerId).toBe(CORP);
    expect(result.value.plot.status).toBe('owned');
    expect(result.value.state.city!.statistics.ownedPlotCount).toBe(1);
  });

  it('rejects an unknown plot without changing the state', () => {
    const state = createInitialCityState();

    const result = purchasePlot(state, 'plot_999', CORP, 0);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(state)).toBe(JSON.stringify(createInitialCityState()));
  });

  it('rejects a duplicate purchase', () => {
    const state = createInitialCityState();
    const owned = buyPlot(state, state.city!.plots[0].id);

    const result = purchasePlot(owned, owned.city!.plots[0].id, CORP, 0);

    expect(expectFailure(result).code).toBe('CITY_PLOT_NOT_AVAILABLE');
  });

  it('rejects an invalid owner and an invalid time', () => {
    const state = createInitialCityState();
    const plotId = state.city!.plots[0].id;

    expect(purchasePlot(state, plotId, '', 0).ok).toBe(false);
    expect(purchasePlot(state, plotId, CORP, -1).ok).toBe(false);
  });

  it('sells an unoccupied plot and refunds the documented resale value', () => {
    const state = createInitialCityState();
    const plotId = state.city!.plots[0].id;
    const owned = buyPlot(state, plotId);

    const result = sellPlot(owned, plotId, 100);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refund).toBeCloseTo(owned.city!.plots[0].price * 0.6, 2);
    expect(result.value.plot.status).toBe('sold');
    expect(result.value.plot.ownerId).toBeNull();
    expect(result.value.plot.soldAtSimMs).toBe(100);
  });

  it('refuses to sell an occupied plot', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');

    const result = sellPlot(built.state, built.state.city!.buildings[0].plotId, 10);

    expect(expectFailure(result).code).toBe('CITY_PLOT_OCCUPIED');
  });

  it('refuses to sell a plot that was never owned', () => {
    const state = createInitialCityState();

    const result = sellPlot(state, state.city!.plots[0].id, 10);

    expect(result.ok).toBe(false);
  });

  it('refuses to rebuy a sold plot', () => {
    const state = createInitialCityState();
    const plotId = state.city!.plots[0].id;
    const sold = sellPlot(buyPlot(state, plotId), plotId, 10);
    if (!sold.ok) throw new Error('setup failed');

    const result = purchasePlot(sold.value.state, plotId, CORP, 20);

    expect(expectFailure(result).code).toBe('CITY_PLOT_SOLD');
  });
});

describe('City Engine — buildings', () => {
  it('defines at least ten valid building definitions with unique identifiers', () => {
    expect(BUILDING_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(BUILDING_DEFINITIONS.map((definition) => definition.id)).size).toBe(
      BUILDING_DEFINITIONS.length,
    );

    BUILDING_DEFINITIONS.forEach((definition) => {
      expect(isValidBuildingDefinition(definition)).toBe(true);
      expect(definition.constructionCost).toBeGreaterThan(0);
      expect(definition.constructionDurationMs).toBeGreaterThan(0);
      expect(definition.compatibleDistricts.length).toBeGreaterThan(0);
      expect(definition.compatibleZoning.length).toBeGreaterThan(0);
    });
  });

  it('rejects an unknown building type', () => {
    const state = createInitialCityState();

    const result = startConstruction(state, {
      buildingTypeId: 'space-elevator',
      plotId: state.city!.plots[0].id,
      corporationId: CORP,
      startedAtSimMs: 0,
    });

    expect(expectFailure(result).code).toBe('CITY_UNKNOWN_BUILDING');
  });

  it('rejects a plot that is not owned', () => {
    const state = createInitialCityState();

    const result = startConstruction(state, {
      buildingTypeId: 'residential-complex',
      plotId: plotOf(state, 'district_residential', 'residential'),
      corporationId: CORP,
      startedAtSimMs: 0,
    });

    expect(expectFailure(result).code).toBe('CITY_PLOT_NOT_OWNED');
  });

  it('rejects an incompatible district', () => {
    const state = createInitialCityState();
    const owned = buyPlot(state, plotOf(state, 'district_residential', 'residential'));

    const result = startConstruction(owned, {
      buildingTypeId: 'electronics-factory',
      plotId: plotOf(state, 'district_residential', 'residential'),
      corporationId: CORP,
      startedAtSimMs: 0,
    });

    expect(expectFailure(result).code).toBe('CITY_DISTRICT_INCOMPATIBLE');
  });

  it('rejects an incompatible zoning', () => {
    const state = createInitialCityState();
    // The downtown district contains one industrially zoned plot — a
    // corporate building may not be built there.
    const plotId = plotOf(state, 'district_downtown', 'industrial');
    const owned = buyPlot(state, plotId);

    const result = startConstruction(owned, {
      buildingTypeId: 'corporate-headquarters',
      plotId,
      corporationId: CORP,
      startedAtSimMs: 0,
    });

    expect(expectFailure(result).code).toBe('CITY_ZONING_INCOMPATIBLE');
  });

  it('rejects a duplicate placement on an occupied plot', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');

    const result = startConstruction(built.state, {
      buildingTypeId: 'electronics-factory',
      plotId: built.state.city!.buildings[0].plotId,
      corporationId: CORP,
      startedAtSimMs: 0,
    });

    expect(expectFailure(result).code).toBe('CITY_PLOT_OCCUPIED');
  });

  it('creates a deterministic building record and occupies the plot', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');

    const building = built.state.city!.buildings[0];
    expect(building.id).toBe('bld_001');
    expect(building.status).toBe('constructing');
    expect(building.progress).toBe(0);
    expect(building.name).toBe('Electronics Factory');
    expect(built.state.city!.plots.find((plot) => plot.id === building.plotId)!.status).toBe('occupied');
    expect(isValidCityState(built.state)).toBe(true);
  });

  it('progresses the construction and completes it exactly once', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');
    const definition = getBuildingDefinition('electronics-factory')!;
    const hours = definition.constructionDurationMs / HOUR;

    const half = tick(built.state, hours / 2);
    expect(half.city!.buildings[0].progress).toBeGreaterThan(0);
    expect(half.city!.buildings[0].progress).toBeLessThan(1);
    expect(half.city!.buildings[0].status).toBe('constructing');

    const done = tick(half, hours / 2);
    expect(done.city!.buildings[0].progress).toBe(1);
    expect(done.city!.buildings[0].status).toBe('operational');

    // Another full duration must not change anything — the building is done.
    const after = tick(done, hours * 3);
    expect(after.city!.buildings[0].status).toBe('operational');
    expect(after.city!.buildings[0].completedAtSimMs).toBe(done.city!.buildings[0].completedAtSimMs);
  });

  it('cancels a construction without a refund and releases the plot', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');

    const cancelled = cancelConstruction(built.state, built.buildingId, 50);

    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.value.building.status).toBe('demolished');
    const plot = cancelled.value.state.city!.plots.find(
      (candidate) => candidate.id === cancelled.value.building.plotId,
    )!;
    expect(plot.status).toBe('owned');
    expect(plot.buildingId).toBeNull();
    expect(plot.ownerId).toBe(CORP);
  });

  it('refuses to cancel a finished construction', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');
    const done = tick(built.state, 100);

    const cancelled = cancelConstruction(done, built.buildingId, 50);

    expect(cancelled.ok).toBe(false);
  });

  it('demolishes a finished building and releases the plot', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');
    const done = tick(built.state, 100);

    const demolished = demolishBuilding(done, built.buildingId, 200);

    expect(demolished.ok).toBe(true);
    if (!demolished.ok) return;
    expect(demolished.value.building.status).toBe('demolished');
    const plot = demolished.value.state.city!.plots.find(
      (candidate) => candidate.id === demolished.value.building.plotId,
    )!;
    expect(plot.status).toBe('owned');
    expect(plot.buildingId).toBeNull();
    expect(demolished.value.state.city!.statistics.operationalBuildingCount).toBe(0);
  });

  it('suspends and resumes a building', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');
    const done = tick(built.state, 100);

    const suspended = suspendBuilding(done, built.buildingId);
    expect(suspended.ok).toBe(true);
    if (!suspended.ok) return;
    expect(suspended.value.building.status).toBe('suspended');
    expect(suspended.value.state.city!.statistics.operationalBuildingCount).toBe(0);

    const resumed = resumeBuilding(suspended.value.state, built.buildingId);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.building.status).toBe('operational');
  });

  it('refuses to assign more employees than the building can employ', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');
    const done = tick(built.state, 100);

    const tooMany = assignBuildingEmployees(done, built.buildingId, [
      'emp_0001',
      'emp_0002',
      'emp_0003',
      'emp_0004',
      'emp_0005',
      'emp_0006',
      'emp_0007',
      'emp_0008',
      'emp_0009',
      'emp_0010',
      'emp_0011',
      'emp_0012',
      'emp_0013',
      'emp_0014',
      'emp_0015',
      'emp_0016',
      'emp_0017',
      'emp_0018',
      'emp_0019',
      'emp_0020',
      'emp_0021',
      'emp_0022',
      'emp_0023',
      'emp_0024',
      'emp_0025',
      'emp_0026',
      'emp_0027',
      'emp_0028',
      'emp_0029',
      'emp_0030',
      'emp_0031',
      'emp_0032',
      'emp_0033',
      'emp_0034',
      'emp_0035',
      'emp_0036',
      'emp_0037',
      'emp_0038',
      'emp_0039',
      'emp_0040',
      'emp_0041',
      'emp_0042',
      'emp_0043',
      'emp_0044',
      'emp_0045',
      'emp_0046',
      'emp_0047',
      'emp_0048',
      'emp_0049',
      'emp_0050',
      'emp_0051',
      'emp_0052',
      'emp_0053',
      'emp_0054',
      'emp_0055',
      'emp_0056',
      'emp_0057',
      'emp_0058',
      'emp_0059',
      'emp_0060',
      'emp_0061',
      'emp_0062',
      'emp_0063',
      'emp_0064',
      'emp_0065',
      'emp_0066',
      'emp_0067',
      'emp_0068',
      'emp_0069',
      'emp_0070',
      'emp_0071',
      'emp_0072',
    ]);

    expect(expectFailure(tooMany).code).toBe('CITY_WORKFORCE_EXCEEDED');
  });

  it('rejects a duplicated employee assignment', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');
    const done = tick(built.state, 100);

    const result = assignBuildingEmployees(done, built.buildingId, ['emp_0001', 'emp_0001']);

    expect(expectFailure(result).code).toBe('COMMAND_DUPLICATE_ASSIGNMENT');
  });
});

describe('City Engine — infrastructure', () => {
  it('aggregates the capacity and the demand of the finished buildings', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');
    const done = tick(built.state, 100);

    const balance = computeInfrastructureBalance(done.city!);

    expect(balance.capacity.electricity).toBe(60);
    expect(balance.demand.electricity).toBe(45);
    expect(balance.shortages.electricity).toBe(0);
    expect(balance.coverage).toBe(1);
  });

  it('never produces a negative capacity or shortage', () => {
    const state = createInitialCityState();
    const balance = computeInfrastructureBalance(state.city!);

    INFRASTRUCTURE_KEYS.forEach((key) => {
      expect(balance.capacity[key]).toBeGreaterThanOrEqual(0);
      expect(balance.demand[key]).toBeGreaterThanOrEqual(0);
      expect(balance.shortages[key]).toBeGreaterThanOrEqual(0);
      expect(balance.utilization[key]).toBeGreaterThanOrEqual(0);
      expect(balance.utilization[key]).toBeLessThanOrEqual(100);
    });
  });

  it('counts the capacity of a provider exactly once', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_energy', 'energy'), 'power-station');
    const done = tick(built.state, 100);

    const balance = computeInfrastructureBalance(done.city!);

    // 60 municipal + 130 of the power station.
    expect(balance.capacity.electricity).toBe(190);
  });

  it('detects a shortage and reduces the operational factor', () => {
    const state = createInitialCityState();
    const working = buildIndustrialFactories(state, 4);

    // The factories need sixty simulated hours to finish.
    let done = working;
    for (let hour = 0; hour < 60; hour += 1) {
      done = tick(done, 1, hour * HOUR);
    }

    const balance = computeInfrastructureBalance(done.city!);

    expect(done.city!.buildings.every((building) => building.status === 'operational')).toBe(true);
    expect(balance.shortages.logistics).toBeGreaterThan(0);
    expect(balance.lowestUtilization).toBeLessThan(100);
    expect(getInfrastructureShare(balance)).toBeLessThan(1);
    expect(getOperationalFactor(balance)).toBeLessThan(1);
    expect(getOperationalFactor(balance)).toBeGreaterThanOrEqual(CITY_RULES.minOperationalShare);
  });

  it('shuts a building down when the service level collapses', () => {
    const state = createInitialCityState();

    // Five factories push the weakest network below the minimum service level.
    const working = buildIndustrialFactories(state, 5);

    let done = working;
    for (let hour = 0; hour < 60; hour += 1) {
      done = tick(done, 1, hour * HOUR);
    }

    const balance = computeInfrastructureBalance(done.city!);
    expect(getInfrastructureShare(balance)).toBeLessThan(CITY_RULES.minOperationalShare);

    done.city!.buildings.forEach((building) => {
      expect(building.status).toBe('completed');
      expect(building.infrastructureSatisfied).toBe(false);
    });
  });
});

describe('City Engine — population and employment', () => {
  it('increases the housing capacity with an operational residential building', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_residential', 'residential'), 'residential-complex');
    const done = tick(built.state, 100);

    expect(done.city!.statistics.housingCapacity).toBe(300 + 420);
  });

  it('grows the population deterministically and caps it at the housing capacity', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_residential', 'residential'), 'residential-complex');

    // The construction runs for sixty simulated hours.
    let working = built.state;
    for (let hour = 0; hour < 60; hour += 1) {
      working = tick(working, 1, hour * HOUR);
    }
    expect(working.city!.buildings[0].status).toBe('operational');

    const before = working.city!.population;
    const grown = tick(working, 1, 61 * HOUR);
    expect(grown.city!.population).toBeGreaterThan(before);
    expect(grown.city!.population).toBeLessThanOrEqual(grown.city!.statistics.housingCapacity);

    // The very same inputs produce the very same population.
    const again = tick(working, 1, 61 * HOUR);
    expect(again.city!.population).toBe(grown.city!.population);
  });

  it('never lets the population exceed the housing capacity', () => {
    const state = createInitialCityState();
    let working = state;

    for (let index = 0; index < 4; index += 1) {
      const plotId = plotOf(working, 'district_residential', 'residential');
      working = buildOn(working, plotId, 'residential-complex').state;
    }

    for (let hour = 0; hour < 400; hour += 1) {
      working = tick(working, 1, hour * HOUR);
    }

    expect(working.city!.population).toBeLessThanOrEqual(working.city!.statistics.housingCapacity);
    expect(working.city!.population).toBeGreaterThan(0);
  });

  it('never lets the employment exceed the population and keeps the unemployment positive', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_residential', 'residential'), 'residential-complex');
    const done = tick(built.state, 60);

    expect(done.city!.employment).toBeLessThanOrEqual(done.city!.population);
    expect(done.city!.unemployment).toBeGreaterThanOrEqual(0);
    expect(done.city!.unemployment).toBeLessThanOrEqual(100);
    expect(done.city!.statistics.availableWorkforce).toBeGreaterThanOrEqual(0);
  });

  it('releases the population when the housing is demolished', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_residential', 'residential'), 'residential-complex');

    let working = built.state;
    for (let hour = 0; hour < 60; hour += 1) {
      working = tick(working, 1, hour * HOUR);
    }
    for (let hour = 0; hour < 40; hour += 1) {
      working = tick(working, 1, (60 + hour) * HOUR);
    }

    const grown = working.city!.population;
    const demolished = demolishBuilding(working, built.buildingId, 500);
    if (!demolished.ok) throw new Error('setup failed');

    const after = tick(demolished.value.state, 100);

    expect(after.city!.statistics.housingCapacity).toBe(300);
    expect(after.city!.population).toBeLessThan(grown);
  });

  it('does not touch the corporate employee records', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');
    const done = tick(built.state, 100);

    expect(done.city!.buildings[0].assignedEmployeeIds).toEqual([]);
  });
});

describe('City Engine — urban indicators', () => {
  it('keeps every indicator inside its documented range over many ticks', () => {
    const state = createInitialCityState();
    let working = state;

    const built = buildOn(working, plotOf(working, 'district_industrial', 'industrial'), 'electronics-factory');
    working = built.state;

    for (let index = 0; index < 200; index += 1) {
      working = tick(working, 1, index * HOUR);
      const city = working.city!;
      expect(city.prosperity).toBeGreaterThanOrEqual(0);
      expect(city.prosperity).toBeLessThanOrEqual(100);
      expect(city.infrastructure).toBeGreaterThanOrEqual(0);
      expect(city.infrastructure).toBeLessThanOrEqual(100);
      expect(city.environment).toBeGreaterThanOrEqual(0);
      expect(city.environment).toBeLessThanOrEqual(100);
      expect(city.publicServices).toBeGreaterThanOrEqual(0);
      expect(city.publicServices).toBeLessThanOrEqual(100);
      expect(city.development).toBeGreaterThanOrEqual(0);
      expect(city.development).toBeLessThanOrEqual(100);
      expect(city.level).toBeGreaterThanOrEqual(1);
      expect(city.level).toBeLessThanOrEqual(5);
      expect(city.population).toBeGreaterThanOrEqual(0);
      expect(city.employment).toBeGreaterThanOrEqual(0);
      expect(city.unemployment).toBeGreaterThanOrEqual(0);
    }
  });

  it('lets the industry erode the environment', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'materials-plant');
    const done = tick(built.state, 200);

    expect(done.city!.environment).toBeLessThan(state.city!.environment);
  });

  it('reports the district figures', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_residential', 'residential'), 'residential-complex');
    const done = tick(built.state, 100);

    const district = findDistrict(done.city!, 'district_residential')!;
    const metrics = getDistrictMetrics(done.city!, district);

    expect(metrics.plotCount).toBe(6);
    expect(metrics.ownedPlots).toBe(1);
    expect(metrics.buildingCount).toBe(1);
    expect(metrics.operationalBuildingCount).toBe(1);
    expect(metrics.housingCapacity).toBe(420);
    expect(metrics.development).toBeGreaterThanOrEqual(0);
  });
});

describe('City Engine — statistics and the market signal', () => {
  it('computes statistics that agree with the authoritative state', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_residential', 'residential'), 'residential-complex');
    const done = tick(built.state, 100);

    const statistics = computeCityStatistics(done.city!);

    expect(statistics.plotCount).toBe(done.city!.plots.length);
    expect(statistics.occupiedPlotCount).toBe(1);
    expect(statistics.buildingCount).toBe(1);
    expect(statistics.operationalBuildingCount).toBe(1);
    expect(statistics.energyDemand).toBe(10);
    expect(statistics.operatingCostPerHour).toBe(35);
  });

  it('produces no market signal while the city runs nothing', () => {
    const state = createInitialCityState();

    expect(buildCityMarketSignal(state.city!)).toBeNull();
  });

  it('produces a bounded market signal once the city runs something', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_downtown', 'commercial'), 'commercial-center');
    const done = tick(built.state, 100);

    const signal = buildCityMarketSignal(done.city!);

    expect(signal).not.toBeNull();
    if (!signal) return;
    expect(signal.commercialActivity).toBeGreaterThan(0);
    expect(signal.commercialActivity).toBeLessThanOrEqual(100);
    expect(signal.energyDemand).toBe(22);
    expect(signal.population).toBe(done.city!.population);
  });
});

describe('City Engine — determinism', () => {
  it('produces the same state for the same inputs', () => {
    const run = (): string => {
      let state = createInitialCityState();
      state = buildOn(state, plotOf(state, 'district_residential', 'residential'), 'residential-complex')
        .state;
      state = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory')
        .state;
      for (let index = 0; index < 25; index += 1) {
        state = tick(state, 1, index * HOUR);
      }
      return JSON.stringify(state);
    };

    expect(run()).toBe(run());
  });

  it('keeps every district definition consistent with the city', () => {
    const state = createInitialCityState();

    expect(state.city!.districts).toHaveLength(CITY_DISTRICT_DEFINITIONS.length);
    CITY_DISTRICT_DEFINITIONS.forEach((definition) => {
      const district = findDistrict(state.city!, definition.id);
      expect(district).toBeDefined();
      expect(district!.type).toBe(definition.type);
      expect(district!.plotIds).toHaveLength(definition.plotCount);
    });
  });

  it('finds buildings and plots by their identifier', () => {
    const state = createInitialCityState();
    const built = buildOn(state, plotOf(state, 'district_industrial', 'industrial'), 'electronics-factory');

    expect(findBuilding(built.state.city!, 'bld_001')).toBeDefined();
    expect(findBuilding(built.state.city!, 'bld_999')).toBeUndefined();
    expect(findPlot(built.state.city!, 'plot_001')).toBeDefined();
  });
});
