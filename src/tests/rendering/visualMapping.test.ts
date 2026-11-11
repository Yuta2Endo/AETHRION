import { describe, expect, it } from 'vitest';
import { buildingHeight, statusOpacity, DISTRICT_COLORS } from '@/rendering/city/palette';
import { createInitialCityState } from '@/simulation/city';
import { buildCityVisualModel } from '@/rendering/adapters/cityAdapter';

describe('rendering visual mapping', () => {
  it('maps building construction and operational states to distinct visual parameters', () => {
    expect(buildingHeight('corporate', 'constructing')).toBeLessThan(buildingHeight('corporate', 'operational'));
    expect(statusOpacity('suspended', true)).toBeLessThan(statusOpacity('operational', true));
    expect(statusOpacity('operational', false)).toBeLessThan(statusOpacity('operational', true));
  });

  it('assigns a stable district color identity', () => {
    expect(DISTRICT_COLORS.commercial).toBeTruthy();
    expect(DISTRICT_COLORS.industrial).not.toBe(DISTRICT_COLORS.research);
  });

  it('reflects restored save/load state in the visual model (read-only)', () => {
    const state = createInitialCityState(0);
    const city = structuredClone(state.city!);
    city.buildings.push({
      id: 'bld_loaded',
      typeId: 'electronics-factory',
      name: 'Electronics Factory',
      category: 'industrial',
      plotId: city.plots[0].id,
      districtId: city.plots[0].districtId,
      status: 'operational',
      progress: 1,
      workforceCapacity: 70,
      operatingCostPerHour: 95,
      assignedEmployeeIds: [],
      effects: {
        populationCapacity: 0,
        productionCapacity: 40,
        researchCapacity: 0,
        commercialActivity: 0,
        prosperity: 0,
        environmentImpact: -10,
        infrastructureProvided: { electricity: 0, water: 0, logistics: 0, publicServices: 0 },
      },
      infrastructureDemand: { electricity: 45, water: 25, logistics: 35, publicServices: 15 },
      startedAtSimMs: 0,
      completedAtSimMs: 1000,
      infrastructureSatisfied: true,
    });
    city.plots[0] = { ...city.plots[0], status: 'occupied', buildingId: 'bld_loaded', ownerId: 'corp_001' };

    const model = buildCityVisualModel(city);
    const building = model.buildings.find((b) => b.id === 'bld_loaded');
    expect(building?.status).toBe('operational');
    expect(model.plots.find((p) => p.id === city.plots[0].id)?.buildingId).toBe('bld_loaded');
  });
});