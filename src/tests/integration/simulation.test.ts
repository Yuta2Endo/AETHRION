import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimulationRunner, SIMULATION_SYSTEM_ORDER } from '@/game/simulationRunner';
import { useGameStore } from '@/game/state/gameStore';
import { ManualScheduler } from '@/tests/helpers/manualScheduler';
import { evolveWorld, getMarketActivityIndex } from '@/simulation/world';
import { updateEconomy } from '@/simulation/economy';

const TICK_MS = 1000;

/**
 * Flushes the pending microtasks so that an asynchronous tick has fully
 * settled before the store is inspected.
 */
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('Simulation integration', () => {
  let scheduler: ManualScheduler;
  let runner: SimulationRunner;

  beforeEach(() => {
    useGameStore.getState().reset();
    scheduler = new ManualScheduler();
    runner = new SimulationRunner({ scheduler, tickDurationMs: TICK_MS });
  });

  afterEach(() => {
    runner.dispose();
    useGameStore.getState().reset();
  });

  it('registers the world and economy systems in the documented order', () => {
    const systems = runner.getEngine().getSystems();

    expect(systems.map((system) => system.name)).toEqual(['world', 'economy']);
    expect(SIMULATION_SYSTEM_ORDER.world).toBeLessThan(SIMULATION_SYSTEM_ORDER.economy);
    expect(systems[0].order).toBeLessThan(systems[1].order);
  });

  it('updates the world and the economy through the simulation lifecycle', async () => {
    const worldBefore = useGameStore.getState().world;
    const economyBefore = useGameStore.getState().economy;

    await runner.step();

    const worldAfter = useGameStore.getState().world;
    const economyAfter = useGameStore.getState().economy;

    expect(worldAfter.tick).toBe(1);
    expect(economyAfter.tick).toBe(1);
    expect(worldAfter.regions[0].indicators.development).not.toBe(
      worldBefore.regions[0].indicators.development,
    );
    expect(economyAfter.commodities[0].supply).not.toBe(economyBefore.commodities[0].supply);
  });

  it('feeds the world state produced in the same tick into the economy', async () => {
    const worldBefore = useGameStore.getState().world;
    const economyBefore = useGameStore.getState().economy;

    const expectedWorld = evolveWorld(worldBefore, { tick: 1, deltaMs: runner.getClock().getBaseSimMsPerTick() });
    const expectedIndex = getMarketActivityIndex(expectedWorld);
    const expectedEconomy = updateEconomy(economyBefore, {
      tick: 1,
      deltaMs: runner.getClock().getBaseSimMsPerTick(),
      marketActivityIndex: expectedIndex,
    });

    await runner.step();

    const economyAfter = useGameStore.getState().economy;

    // The economy must observe the world produced by the earlier system in
    // the same tick — this proves the documented execution order.
    expect(economyAfter.commodities[0].demand).toBeCloseTo(
      expectedEconomy.commodities[0].demand,
      6,
    );
  });

  it('keeps the store in sync with the engine', async () => {
    runner.start();
    await runner.step();

    const store = useGameStore.getState();

    expect(store.simulation.status).toBe('running');
    expect(store.simulation.tick).toBe(1);
    expect(store.simulation.speed).toBe(1);
    expect(store.simulation.date).toEqual(runner.getClock().getDate());
    expect(store.simulation.simTimeMs).toBe(runner.getClock().now());
    expect(store.empire.foundedOn).toEqual(runner.getClock().getDate());
  });

  it('pauses the whole simulation', async () => {
    runner.start();
    await runner.step();
    const tickBeforePause = useGameStore.getState().simulation.tick;

    runner.pause();
    expect(useGameStore.getState().simulation.status).toBe('paused');

    await runner.step();

    expect(useGameStore.getState().simulation.tick).toBe(tickBeforePause);
    expect(useGameStore.getState().world.tick).toBe(1);
  });

  it('resumes the simulation from where it was paused', async () => {
    runner.start();
    await runner.step();
    runner.pause();

    await runner.step();
    runner.resume();
    await runner.step();

    expect(useGameStore.getState().simulation.status).toBe('running');
    expect(useGameStore.getState().simulation.tick).toBe(2);
    expect(useGameStore.getState().world.tick).toBe(2);
  });

  it('applies the speed multiplier to the simulated time', async () => {
    runner.setSpeed(4);
    runner.start();
    await runner.step();

    const clock = runner.getClock();
    expect(useGameStore.getState().simulation.speed).toBe(4);
    expect(clock.getElapsedSimMs()).toBe(clock.getBaseSimMsPerTick() * 4);
  });

  it('rejects an invalid speed without breaking the simulation', () => {
    runner.start();
    runner.setSpeed(2);
    runner.setSpeed(Number.NaN);

    expect(runner.getSpeed()).toBe(2);
    expect(useGameStore.getState().simulation.status).toBe('running');
  });

  it('advances the simulation through the frame scheduler', async () => {
    runner.start();

    scheduler.advance(TICK_MS); // time baseline
    scheduler.advance(TICK_MS);
    await flushMicrotasks();

    expect(useGameStore.getState().simulation.tick).toBe(1);
    expect(useGameStore.getState().world.tick).toBe(1);
  });

  it('restores the initial state on reset', async () => {
    runner.start();
    await runner.step();

    runner.reset();

    const store = useGameStore.getState();
    expect(store.simulation.tick).toBe(0);
    expect(store.simulation.status).toBe('idle');
    expect(store.world.tick).toBe(0);
    expect(store.economy.tick).toBe(0);
    expect(store.empire.foundedOn).toBeNull();
  });

  it('does not persist the simulation state to localStorage', () => {
    // The game store must not use the zustand persist middleware — persistent
    // storage is an IndexedDB concern reserved for Stage 08.
    expect((useGameStore as unknown as { persist?: unknown }).persist).toBeUndefined();
    expect(globalThis.localStorage?.length ?? 0).toBe(0);
  });
});
