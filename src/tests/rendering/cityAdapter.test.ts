import { describe, expect, it } from 'vitest';
import { buildCityVisualModel, findBuildingVisual, findDistrictVisual, findPlotVisual } from '@/rendering/adapters/cityAdapter';
import { createInitialCityState } from '@/simulation/city';

describe('rendering city adapter', () => {
  it('maps actual simulation city data into a visual model', () => {
    const city = createInitialCityState(0).city!;
    const model = buildCityVisualModel(city);

    expect(model.cityId).toBe(city.id);
    expect(model.name).toBe(city.name);
    expect(model.districts).toHaveLength(city.districts.length);
    expect(model.plots).toHaveLength(city.plots.length);
    expect(model.buildings).toHaveLength(city.buildings.filter((b) => b.status !== 'demolished').length);
  });

  it('reflects building and plot states from authoritative data', () => {
    const state = createInitialCityState(0);
    const city = structuredClone(state.city!);
    city.plots[0] = { ...city.plots[0], status: 'owned', ownerId: 'corp_001' };
    city.buildings.push({
      id: 'bld_test_1',
      typeId: 'regional-office',
      name: 'Regional Office',
      category: 'corporate',
      plotId: city.plots[1].id,
      districtId: city.plots[1].districtId,
      status: 'constructing',
      progress: 0.42,
      workforceCapacity: 40,
      operatingCostPerHour: 60,
      assignedEmployeeIds: ['emp_1'],
      effects: {
        populationCapacity: 0,
        productionCapacity: 0,
        researchCapacity: 2,
        commercialActivity: 11,
        prosperity: 9,
        environmentImpact: 2,
        infrastructureProvided: { electricity: 0, water: 0, logistics: 0, publicServices: 0 },
      },
      infrastructureDemand: { electricity: 20, water: 14, logistics: 18, publicServices: 18 },
      startedAtSimMs: 0,
      completedAtSimMs: null,
      infrastructureSatisfied: false,
    });

    const model = buildCityVisualModel(city);
    const plot = findPlotVisual(model, city.plots[0].id);
    const building = findBuildingVisual(model, 'bld_test_1');

    expect(plot?.status).toBe('owned');
    expect(building?.status).toBe('constructing');
    expect(building?.progress).toBeCloseTo(0.42);
    expect(building?.infrastructureSatisfied).toBe(false);
  });

  it('handles missing optional/lookup data safely', () => {
    const city = createInitialCityState(0).city!;
    const model = buildCityVisualModel(city);

    expect(findDistrictVisual(model, 'missing')).toBeUndefined();
    expect(findPlotVisual(model, 'missing')).toBeUndefined();
    expect(findBuildingVisual(model, 'missing')).toBeUndefined();
  });
});