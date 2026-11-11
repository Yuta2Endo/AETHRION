import { describe, it, expect } from 'vitest';
import {
  createInitialWorld,
  evolveWorld,
  findRegion,
  getMarketActivityIndex,
  getWorldMetrics,
  isValidWorldState,
  INDICATOR_KEYS,
  type WorldState,
} from '@/simulation/world';

const HOUR = 3_600_000;
const CONTEXT = { tick: 1, deltaMs: HOUR };

describe('World Engine', () => {
  it('creates a valid initial world', () => {
    const world = createInitialWorld();

    expect(isValidWorldState(world)).toBe(true);
    expect(world.regions.length).toBeGreaterThan(0);
    expect(world.tick).toBe(0);
    expect(world.activeRegionId).toBe(world.regions[0].id);
  });

  it('gives every region a unique stable identifier', () => {
    const world = createInitialWorld();
    const ids = world.regions.map((region) => region.id);

    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    });

    // Identifiers survive evolution.
    const evolved = evolveWorld(world, CONTEXT);
    expect(evolved.regions.map((region) => region.id)).toEqual(ids);
  });

  it('keeps every indicator inside the 0..100 range', () => {
    let world = createInitialWorld();

    for (let i = 0; i < 200; i += 1) {
      world = evolveWorld(world, { tick: i + 1, deltaMs: HOUR });
      world.regions.forEach((region) => {
        INDICATOR_KEYS.forEach((key) => {
          const value = region.indicators[key];
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        });
        expect(region.stability).toBeGreaterThanOrEqual(0);
        expect(region.stability).toBeLessThanOrEqual(1);
      });
    }
  });

  it('evolves deterministically', () => {
    const first = evolveWorld(createInitialWorld(), CONTEXT);
    const second = evolveWorld(createInitialWorld(), CONTEXT);

    expect(first).toEqual(second);
  });

  it('produces reproducible results over repeated ticks', () => {
    const run = (): WorldState => {
      let world = createInitialWorld();
      for (let i = 0; i < 50; i += 1) {
        world = evolveWorld(world, { tick: i + 1, deltaMs: HOUR });
      }
      return world;
    };

    expect(run()).toEqual(run());
  });

  it('advances development in the direction of the region trend', () => {
    const world = createInitialWorld();
    const region = world.regions.find((r) => r.id === 'helion-rift')!;
    const before = region.indicators.development;

    const evolved = evolveWorld(world, CONTEXT);
    const after = findRegion(evolved, 'helion-rift')!.indicators.development;

    expect(after).toBeGreaterThan(before);
    expect(evolved.tick).toBe(1);
  });

  it('moves infrastructure and market activity toward the development level', () => {
    const world = createInitialWorld();
    const region = world.regions.find((r) => r.id === 'vanta-march')!;
    const beforeInfrastructure = region.indicators.infrastructure;

    const evolved = evolveWorld(world, CONTEXT);
    const after = findRegion(evolved, 'vanta-march')!;

    expect(after.indicators.infrastructure).toBeGreaterThan(beforeInfrastructure);
    expect(after.indicators.marketActivity).toBeGreaterThan(region.indicators.marketActivity);
  });

  it('scales the evolution with the simulated time delta', () => {
    const oneHour = evolveWorld(createInitialWorld(), { tick: 1, deltaMs: HOUR });
    const fourHours = evolveWorld(createInitialWorld(), { tick: 1, deltaMs: HOUR * 4 });

    const oneGrowth =
      findRegion(oneHour, 'cyther-peaks')!.indicators.development -
      33;
    const fourGrowth =
      findRegion(fourHours, 'cyther-peaks')!.indicators.development -
      33;

    expect(fourGrowth).toBeGreaterThan(oneGrowth);
  });

  it('rejects an invalid world state and leaves it unchanged', () => {
    const world = createInitialWorld();
    const invalid: WorldState = {
      ...world,
      regions: [world.regions[0], { ...world.regions[0] }],
    };

    const result = evolveWorld(invalid, CONTEXT);

    expect(result).toBe(invalid);
    expect(result.regions[0]).toBe(invalid.regions[0]);
  });

  it('rejects non-finite indicator values', () => {
    const world = createInitialWorld();
    const invalid: WorldState = {
      ...world,
      regions: [
        {
          ...world.regions[0],
          indicators: { ...world.regions[0].indicators, development: Number.NaN },
        },
        ...world.regions.slice(1),
      ],
    };

    expect(isValidWorldState(invalid)).toBe(false);
    expect(evolveWorld(invalid, CONTEXT)).toBe(invalid);
  });

  it('rejects an invalid tick context and leaves the state unchanged', () => {
    const world = createInitialWorld();

    const result = evolveWorld(world, { tick: 1, deltaMs: Number.NaN });

    expect(result).toBe(world);
  });

  it('keeps the tick counter in sync even when no time passes', () => {
    const world = createInitialWorld();

    const result = evolveWorld(world, { tick: 1, deltaMs: 0 });

    expect(result.tick).toBe(1);
    expect(result.regions[0].indicators.development).toBe(world.regions[0].indicators.development);
  });

  it('computes aggregate world metrics', () => {
    const world = createInitialWorld();
    const metrics = getWorldMetrics(world);

    expect(metrics.regionCount).toBe(world.regions.length);
    expect(metrics.averageDevelopment).toBeGreaterThan(0);
    expect(metrics.averageDevelopment).toBeLessThanOrEqual(100);
    expect(metrics.marketActivityIndex).toBe(metrics.averageMarketActivity);
  });

  it('exposes the commercial activity index used by the economy', () => {
    const world = createInitialWorld();

    const index = getMarketActivityIndex(world);

    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThanOrEqual(100);
  });
});
