import { describe, expect, it } from 'vitest';
import { CityWorld } from '@/rendering/city/CityWorld';
import { createInitialCityState } from '@/simulation/city';
import { useGameStore } from '@/game/state/gameStore';

describe('rendering world synchronization', () => {
  it('syncs, updates and clears without mutating authoritative simulation state', () => {
    useGameStore.getState().reset();
    const original = useGameStore.getState().city;
    const before = JSON.stringify(original);

    const city = createInitialCityState(0).city!;
    const world = new CityWorld();

    world.sync(city);
    expect(world.getLayout()).not.toBeNull();
    expect(world.getModel()?.plots.length).toBe(city.plots.length);

    const updated = structuredClone(city);
    updated.plots[0] = { ...updated.plots[0], status: 'owned', ownerId: 'corp_001' };
    world.sync(updated);
    expect(world.getModel()?.plots.find((p) => p.id === updated.plots[0].id)?.status).toBe('owned');

    world.sync(null);
    expect(world.getModel()).toBeNull();
    world.dispose();

    expect(JSON.stringify(useGameStore.getState().city)).toBe(before);
  });

  it('supports repeated sync and selection changes safely', () => {
    const city = createInitialCityState(0).city!;
    const world = new CityWorld();

    world.sync(city);
    world.sync(city);
    world.sync(structuredClone(city));
    world.setSelection({ kind: 'district', districtId: city.districts[0].id });
    world.setSelection({ kind: 'plot', plotId: city.plots[0].id, districtId: city.plots[0].districtId });
    world.setSelection(null);

    expect(world.getLayout()?.districts.length).toBe(5);
    world.dispose();
  });
});