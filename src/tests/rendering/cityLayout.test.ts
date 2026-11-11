import { describe, expect, it } from 'vitest';
import { buildCityLayout, getDistrictWorldPosition, getPlotWorldPosition } from '@/rendering/adapters/cityLayout';
import { createInitialCityState } from '@/simulation/city';

describe('rendering city layout adapter', () => {
  it('builds a deterministic layout for the same city state', () => {
    const city = createInitialCityState(0).city!;
    const a = buildCityLayout(city);
    const b = buildCityLayout(structuredClone(city));

    expect(a).toEqual(b);
    expect(Object.keys(a.byDistrictId)).toHaveLength(5);
    expect(Object.keys(a.byPlotId)).toHaveLength(city.plots.length);
  });

  it('maps every district and plot to stable positions', () => {
    const city = createInitialCityState(0).city!;
    const layout = buildCityLayout(city);

    for (const district of city.districts) {
      const pos = getDistrictWorldPosition(layout, district.id);
      expect(pos).not.toBeNull();
      expect(Number.isFinite(pos!.x)).toBe(true);
      expect(Number.isFinite(pos!.z)).toBe(true);

      for (const plotId of district.plotIds) {
        const plotPos = getPlotWorldPosition(layout, plotId);
        expect(plotPos).not.toBeNull();
        expect(layout.byPlotId[plotId]?.districtId).toBe(district.id);
      }
    }
  });

  it('keeps district placement stable by district identity', () => {
    const city = createInitialCityState(0).city!;
    const layout = buildCityLayout(city);

    expect(layout.byDistrictId['district_downtown']?.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(layout.byDistrictId['district_industrial']?.center).toEqual({ x: -18, y: 0, z: -12 });
    expect(layout.byDistrictId['district_research']?.center).toEqual({ x: 18, y: 0, z: -12 });
  });
});