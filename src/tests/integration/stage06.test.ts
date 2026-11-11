import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AppError, Result } from '@/core/types';
import { SimulationRunner, SIMULATION_SYSTEM_ORDER } from '@/game/simulationRunner';
import { commands } from '@/game/commands';
import { useGameStore } from '@/game/state/gameStore';
import { ManualScheduler } from '@/tests/helpers/manualScheduler';
import { getPlayerCorporation, isValidCorporationState } from '@/simulation/corporation';
import { createNeutralModifiers, aggregateModifiers, getEventDefinition, isValidEventsState } from '@/simulation/events';
import { createInitialEconomy, updateEconomy } from '@/simulation/economy';
import { buildCompetitorMarketSignal, isValidCompetitorsState } from '@/simulation/competitors';
import { getMarketActivityIndex, evolveWorld } from '@/simulation/world';
import { isValidCityState } from '@/simulation/city';

const TICK_MS = 1000;

/**
 * Asserts that an operation failed and returns its typed error.
 */
function expectFailure<T>(result: Result<T, AppError>): AppError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('the operation was expected to fail');
  return result.error;
}

/**
 * The complete Stage 06 gameplay chain:
 *
 * World → Event scheduler → Global event → Event effect → Economy and city
 *       → AI competitors → Strategic decision → Competitive market activity
 *       → Player sees the consequences → Player responds → Event expires
 */
describe('Stage 06 — events and competitors', () => {
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

  const step = async (ticks: number): Promise<void> => {
    for (let i = 0; i < ticks; i += 1) {
      await runner.step();
    }
  };

  it('keeps the documented tick order', () => {
    const systems = runner.getEngine().getSystems();

    expect(systems.map((system) => system.name)).toEqual([
      'world',
      'events',
      'city',
      'economy',
      'employees',
      'technology',
      'products',
      'resources',
      'production',
      'market',
      'competitors',
      'corporation',
    ]);

    const orders = systems.map((system) => system.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);

    // The events are known before the engines that consume their effects.
    expect(SIMULATION_SYSTEM_ORDER.events).toBeLessThan(SIMULATION_SYSTEM_ORDER.city);
    expect(SIMULATION_SYSTEM_ORDER.events).toBeLessThan(SIMULATION_SYSTEM_ORDER.economy);
    // The AI reacts to the market of the same tick and never changes a result
    // that was already calculated.
    expect(SIMULATION_SYSTEM_ORDER.market).toBeLessThan(SIMULATION_SYSTEM_ORDER.competitors);
    expect(SIMULATION_SYSTEM_ORDER.competitors).toBeLessThan(SIMULATION_SYSTEM_ORDER.corporation);
  });

  it('runs the whole chain from the event to the expiration', async () => {
    // 1. An initial world with a corporation.
    expect(commands.createCorporation({ name: 'Helion Dynamics' }).ok).toBe(true);

    const economyBefore = useGameStore.getState().economy;

    // 2. The event scheduler activates a global event.
    let activated = false;
    for (let hour = 1; hour <= 200 && !activated; hour += 1) {
      await step(1);
      activated = useGameStore.getState().events.activeEvents.length > 0;
    }

    expect(activated).toBe(true);

    const event = useGameStore.getState().events.activeEvents[0];
    const definition = getEventDefinition(event.definitionId);
    expect(definition).toBeDefined();

    // 3. The event effect is applied to the simulation.
    const modifiers = useGameStore.getState().events.activeEvents.length;
    expect(modifiers).toBeGreaterThan(0);

    // 4. The economy reacts to the event.
    const economyAfter = useGameStore.getState().economy;
    const withoutEvent = updateEconomy(economyBefore, {
      tick: 1,
      deltaMs: 3_600_000,
      marketActivityIndex: 50,
      eventModifiers: createNeutralModifiers(),
    });

    const changed = economyAfter.commodities.some(
      (commodity, index) =>
        Math.abs(commodity.demand - withoutEvent.commodities[index].demand) > 0.0001 ||
        Math.abs(commodity.supply - withoutEvent.commodities[index].supply) > 0.0001,
    );
    expect(changed).toBe(true);

    // 5. The AI competitors evaluate the conditions and decide.
    const competitorsBefore = useGameStore.getState().competitors;
    for (let hour = 0; hour < 60; hour += 1) {
      await step(1);
    }
    const competitorsAfter = useGameStore.getState().competitors;

    const decided = competitorsAfter.competitors.some(
      (competitor) => competitor.history.length > competitorsBefore.competitors.find(
        (candidate) => candidate.id === competitor.id,
      )!.history.length,
    );
    expect(decided).toBe(true);

    // 6. The competitive market activity is reported.
    const signal = buildCompetitorMarketSignal(competitorsAfter);
    expect(signal).not.toBeNull();
    if (signal) {
      expect(signal.supplyPressure.compute).toBeGreaterThanOrEqual(0);
      expect(signal.supplyPressure.compute).toBeLessThanOrEqual(100);
    }

    // 7. The player sees the consequences in the news feed.
    const news = useGameStore.getState().events.news;
    expect(news.length).toBeGreaterThan(0);
    expect(news.some((item) => item.relatedId === event.id)).toBe(true);

    // 8. The corporate financial state remains valid.
    expect(isValidCorporationState(useGameStore.getState().corporation)).toBe(true);
    expect(
      getPlayerCorporation(useGameStore.getState().corporation)!.finances.balance,
    ).toBeGreaterThanOrEqual(0);

    // 9. The event expires and the temporary effects are removed.
    const duration = definition!.durationMs / 3_600_000;
    for (let hour = 0; hour <= duration + 2; hour += 1) {
      await step(1);
    }

    const expired = useGameStore
      .getState()
      .events.activeEvents.find((candidate) => candidate.id === event.id);
    expect(expired).toBeUndefined();
    expect(useGameStore.getState().events.history.some((entry) => entry.id === event.id)).toBe(true);
  });

  it('preserves the Stage 05 behaviour while no event is active', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    // The first event may not trigger before 48 simulated hours.
    await step(24);

    expect(useGameStore.getState().events.activeEvents).toHaveLength(0);

    const before = useGameStore.getState();
    const deltaMs = runner.getClock().getBaseSimMsPerTick();

    // The event modifiers are neutral — the events change nothing.
    expect(aggregateModifiers(before.events, before.simulation.simTimeMs)).toEqual(
      createNeutralModifiers(),
    );

    // The economy therefore behaves exactly as it did without the events.
    const expectedWorld = evolveWorld(before.world, { tick: 1, deltaMs });
    const expected = updateEconomy(before.economy, {
      tick: 1,
      deltaMs,
      marketActivityIndex: getMarketActivityIndex(expectedWorld),
      competitorSignal: buildCompetitorMarketSignal(before.competitors) ?? undefined,
    });

    await runner.step();

    const after = useGameStore.getState();
    expect(after.economy.commodities[0].demand).toBeCloseTo(
      expected.commodities[0].demand,
      4,
    );
  });

  it('preserves the Stage 04 behaviour without any competitor activity', () => {
    const economy = createInitialEconomy();

    // Without a competitor signal the market behaves exactly as before.
    const withoutSignal = updateEconomy(economy, {
      tick: 1,
      deltaMs: 3_600_000,
      marketActivityIndex: 50,
    });

    const withSignal = updateEconomy(economy, {
      tick: 1,
      deltaMs: 3_600_000,
      marketActivityIndex: 50,
      competitorSignal: {
        supplyPressure: { compute: 40, energy: 20, materials: 0, logistics: 10 },
        demandPressure: { compute: 10, energy: 30, materials: 5, logistics: 0 },
        pricePressure: { compute: 0, energy: -0.2, materials: 0, logistics: 0 },
      },
    });

    expect(withSignal.commodities.find((c) => c.id === 'quantum-core')!.demand).not.toBeCloseTo(
      withoutSignal.commodities.find((c) => c.id === 'quantum-core')!.demand,
      4,
    );
  });

  it('answers an event through the command layer', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    // An event with responses is injected into the simulation state.
    const definition = getEventDefinition('energy-crisis')!;
    const response = definition.responses![0];
    const state = useGameStore.getState();
    state.applyEventsState({
      ...state.events,
      activeEvents: [
        {
          id: 'evt_001',
          definitionId: definition.id,
          name: definition.name,
          category: definition.category,
          severity: definition.severity,
          startedAtSimMs: 0,
          endsAtSimMs: definition.durationMs,
          effects: definition.effects.map((effect) => ({ ...effect })),
          appliedResponseIds: [],
          relief: null,
        },
      ],
    });

    const balanceBefore = getPlayerCorporation(useGameStore.getState().corporation)!.finances.balance;

    const result = commands.respondToEvent('evt_001', response.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The cost reached the corporate ledger.
    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    expect(corporation.finances.balance).toBe(balanceBefore - response.cost);
    expect(corporation.transactions.some((transaction) => transaction.type === 'operating')).toBe(
      true,
    );

    // The response is applied exactly once.
    const again = commands.respondToEvent('evt_001', response.id);
    expect(again.ok).toBe(false);
    expect(expectFailure(again).code).toBe('EVENT_RESPONSE_APPLIED');
  });

  it('rejects an unaffordable response without changing the state', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    const definition = getEventDefinition('energy-crisis')!;
    const response = definition.responses![0];
    const state = useGameStore.getState();
    state.applyEventsState({
      ...state.events,
      activeEvents: [
        {
          id: 'evt_001',
          definitionId: definition.id,
          name: definition.name,
          category: definition.category,
          severity: definition.severity,
          startedAtSimMs: 0,
          endsAtSimMs: definition.durationMs,
          effects: definition.effects.map((effect) => ({ ...effect })),
          appliedResponseIds: [],
          relief: null,
        },
      ],
    });

    // Drain the balance.
    const corporation = getPlayerCorporation(useGameStore.getState().corporation)!;
    state.applyCorporationState({
      ...state.corporation,
      corporations: state.corporation.corporations.map((candidate) =>
        candidate.id === corporation.id
          ? { ...candidate, finances: { ...candidate.finances, balance: 10 } }
          : candidate,
      ),
    });

    const before = JSON.stringify(useGameStore.getState());
    const result = commands.respondToEvent('evt_001', response.id);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(useGameStore.getState())).toBe(before);
  });

  it('rejects a response for an expired event', () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    const result = commands.respondToEvent('evt_999', 'energy-efficiency');

    expect(result.ok).toBe(false);
    expect(expectFailure(result).code).toBe('EVENT_NOT_ACTIVE');
  });

  it('marks a news item as read', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });
    await step(60);

    const news = useGameStore.getState().events.news;
    expect(news.length).toBeGreaterThan(0);

    const result = commands.markNewsRead(news[0].id);
    expect(result.ok).toBe(true);

    const again = commands.markNewsRead(news[0].id);
    expect(again.ok).toBe(false);
  });

  it('is deterministic across identical runs', async () => {
    const run = async (): Promise<string> => {
      runner.reset();
      commands.createCorporation({ name: 'Helion Dynamics' });
      for (let i = 0; i < 120; i += 1) {
        await runner.step();
      }
      const state = useGameStore.getState();
      return JSON.stringify({
        events: state.events,
        competitors: state.competitors,
        economy: state.economy,
      });
    };

    const first = await run();
    const second = await run();

    expect(second).toBe(first);
  });

  it('pauses the events and the competitors', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    runner.start();
    await runner.step();

    const eventsBefore = useGameStore.getState().events.tick;
    const competitorsBefore = useGameStore.getState().competitors.tick;

    runner.pause();
    await runner.step();

    expect(useGameStore.getState().events.tick).toBe(eventsBefore);
    expect(useGameStore.getState().competitors.tick).toBe(competitorsBefore);

    runner.resume();
    await runner.step();

    expect(useGameStore.getState().events.tick).toBeGreaterThan(eventsBefore);
    expect(useGameStore.getState().competitors.tick).toBeGreaterThan(competitorsBefore);

    runner.stop();
  });

  it('does not duplicate an activation or an expiration during a long tick', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    // A long tick must not trigger a burst of events.
    const state = useGameStore.getState();
    state.applyEventsState({ ...state.events, lastScheduleElapsedMs: 0 });

    await step(1);

    const active = useGameStore.getState().events.activeEvents;
    expect(new Set(active.map((event) => event.id)).size).toBe(active.length);
    expect(active.length).toBeLessThanOrEqual(3);
  });

  it('keeps every new slice valid over a long run', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    for (let hour = 0; hour < 120; hour += 1) {
      await step(1);
    }

    expect(isValidEventsState(useGameStore.getState().events)).toBe(true);
    expect(isValidCompetitorsState(useGameStore.getState().competitors)).toBe(true);
    expect(isValidCityState(useGameStore.getState().city)).toBe(true);
    expect(isValidCorporationState(useGameStore.getState().corporation)).toBe(true);
  });

  it('never lets the corporation or the competitors go negative', async () => {
    commands.createCorporation({ name: 'Helion Dynamics' });

    for (let hour = 0; hour < 200; hour += 1) {
      await step(1);
    }

    expect(
      getPlayerCorporation(useGameStore.getState().corporation)!.finances.balance,
    ).toBeGreaterThanOrEqual(0);

    useGameStore.getState().competitors.competitors.forEach((competitor) => {
      expect(competitor.finances.balance).toBeGreaterThanOrEqual(0);
    });
  });

  it('inspects a competitor through the command layer', () => {
    const competitor = useGameStore.getState().competitors.competitors[0];

    const result = commands.getCompetitor({ competitorId: competitor.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe(competitor.name);

    const missing = commands.getCompetitor({ competitorId: 'nobody' });
    expect(missing.ok).toBe(false);
    expect(expectFailure(missing).code).toBe('COMPETITOR_NOT_FOUND');
  });
});
