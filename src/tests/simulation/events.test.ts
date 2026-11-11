import { describe, it, expect } from 'vitest';
import type { AppError, Result } from '@/core/types';
import {
  EVENT_DEFINITIONS,
  EVENT_SCHEDULE_INTERVAL_MS,
  MAX_ACTIVE_EVENTS,
  MAX_NEWS_ITEMS,
  advanceEvents,
  activateEvent,
  aggregateModifiers,
  applyEventResponse,
  createInitialEventsState,
  createNeutralModifiers,
  expireEvents,
  getEventDefinition,
  isEventEligible,
  isValidEventDefinition,
  isValidEventsState,
  markNewsRead,
  publishNews,
  selectNextEvent,
  type EventContext,
} from '@/simulation/events';
import { nextRandom } from '@/core/utils';

const HOUR = 3_600_000;

function context(overrides: Partial<EventContext> = {}): EventContext {
  return {
    tick: 1,
    deltaMs: HOUR,
    simTimeMs: 0,
    elapsedSimMs: 0,
    worldDevelopment: 50,
    marketActivityIndex: 60,
    hasCorporation: true,
    hasActiveCity: true,
    ...overrides,
  };
}

/**
 * Asserts that an operation failed and returns its typed error.
 */
function expectFailure<T>(result: Result<T, AppError>): AppError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('the operation was expected to fail');
  return result.error;
}

describe('Global Events Engine — the catalogue', () => {
  it('defines at least fifteen valid and unique events', () => {
    expect(EVENT_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(EVENT_DEFINITIONS.map((definition) => definition.id)).size).toBe(
      EVENT_DEFINITIONS.length,
    );

    EVENT_DEFINITIONS.forEach((definition) => {
      expect(isValidEventDefinition(definition)).toBe(true);
      expect(definition.effects.length).toBeGreaterThan(0);
      expect(definition.durationMs).toBeGreaterThan(0);
      expect(definition.cooldownMs).toBeGreaterThan(0);
    });
  });

  it('covers every documented category', () => {
    const categories = new Set(EVENT_DEFINITIONS.map((definition) => definition.category));

    expect(categories).toContain('economic');
    expect(categories).toContain('technology');
    expect(categories).toContain('industrial');
    expect(categories).toContain('energy');
    expect(categories).toContain('environment');
    expect(categories).toContain('geopolitical');
  });

  it('offers player responses for at least five events', () => {
    const withResponses = EVENT_DEFINITIONS.filter(
      (definition) => (definition.responses?.length ?? 0) > 0,
    );

    expect(withResponses.length).toBeGreaterThanOrEqual(5);
    withResponses.forEach((definition) => {
      definition.responses!.forEach((response) => {
        expect(response.cost).toBeGreaterThanOrEqual(0);
        expect(response.reliefMultiplier).toBeGreaterThan(0);
        expect(response.reliefDurationMs).toBeGreaterThan(0);
      });
    });
  });

  it('creates a valid initial state', () => {
    const state = createInitialEventsState();

    expect(isValidEventsState(state)).toBe(true);
    expect(state.activeEvents).toHaveLength(0);
    expect(state.news).toHaveLength(0);
  });
});

describe('Global Events Engine — scheduling', () => {
  it('selects the same event for the same state', () => {
    const state = createInitialEventsState();
    const first = selectNextEvent(state, context({ elapsedSimMs: 200 * HOUR }));
    const second = selectNextEvent(state, context({ elapsedSimMs: 200 * HOUR }));

    expect(first).not.toBeNull();
    expect(first?.definition.id).toBe(second?.definition.id);
    expect(first?.randomState).toBe(second?.randomState);
  });

  it('respects the minimum elapsed time of an event', () => {
    const state = createInitialEventsState();
    const early = selectNextEvent(state, context({ elapsedSimMs: HOUR }));

    expect(early).toBeNull();
  });

  it('respects the trigger conditions', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'global-market-boom')!;
    const elapsed = { elapsedSimMs: 200 * HOUR, simTimeMs: 200 * HOUR };

    expect(isEventEligible(definition, context({ ...elapsed, marketActivityIndex: 10 }), state)).toBe(
      false,
    );
    expect(isEventEligible(definition, context({ ...elapsed, marketActivityIndex: 80 }), state)).toBe(
      true,
    );
  });

  it('respects the trigger conditions that need the corporation or the city', () => {
    const state = createInitialEventsState();
    const regulation = EVENT_DEFINITIONS.find((entry) => entry.id === 'technology-regulation')!;
    const restrictions = EVENT_DEFINITIONS.find(
      (entry) => entry.id === 'environmental-restrictions',
    )!;

    expect(isEventEligible(regulation, context({ hasCorporation: false }), state)).toBe(false);
    expect(isEventEligible(restrictions, context({ hasActiveCity: false }), state)).toBe(false);
  });

  it('never activates an event twice before the cooldown expires', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'global-market-boom')!;

    const activated = activateEvent(state, definition, 1000);
    const eligible = isEventEligible(
      definition,
      context({ simTimeMs: 2000, elapsedSimMs: 2000 }),
      activated.state,
    );

    expect(eligible).toBe(false);
  });

  it('activates an event after the cooldown has expired', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'global-market-boom')!;

    const activated = activateEvent(state, definition, 0);
    // The event has to end before it may trigger again.
    const ended = expireEvents(activated.state, definition.durationMs + 1).state;

    const eligible = isEventEligible(
      definition,
      context({ simTimeMs: definition.cooldownMs + 1, elapsedSimMs: definition.cooldownMs + 1 }),
      ended,
    );

    expect(eligible).toBe(true);
  });

  it('never exceeds the maximum number of active events', () => {
    let state = createInitialEventsState();
    const definitions = EVENT_DEFINITIONS.slice(0, MAX_ACTIVE_EVENTS + 2);

    definitions.forEach((definition, index) => {
      state = activateEvent(state, definition, index * HOUR).state;
    });

    expect(state.activeEvents).toHaveLength(MAX_ACTIVE_EVENTS + 2);
    expect(isValidEventsState(state)).toBe(false);

    // The scheduler refuses to add another one.
    const selection = selectNextEvent(
      { ...state, activeEvents: state.activeEvents.slice(0, MAX_ACTIVE_EVENTS) },
      context({ elapsedSimMs: 500 * HOUR }),
    );
    expect(selection).toBeNull();
  });

  it('does not generate an event on every tick', () => {
    let state = createInitialEventsState();
    let activations = 0;

    for (let hour = 1; hour <= 120; hour += 1) {
      const result = advanceEvents(
        state,
        context({ elapsedSimMs: hour * HOUR, simTimeMs: hour * HOUR }),
      );
      state = result.state;
      activations += result.activated.length;
    }

    // 120 hours with a twelve hour interval — never more than ten activations.
    expect(activations).toBeLessThanOrEqual(10);
    expect(activations).toBeGreaterThan(0);
  });

  it('does not duplicate an activation during a long tick', () => {
    let state = createInitialEventsState();
    const result = advanceEvents(
      state,
      context({ elapsedSimMs: 500 * HOUR, simTimeMs: 500 * HOUR, deltaMs: 500 * HOUR }),
    );

    expect(result.activated.length).toBeLessThanOrEqual(1);
    expect(new Set(result.state.activeEvents.map((event) => event.id)).size).toBe(
      result.state.activeEvents.length,
    );
  });
});

describe('Global Events Engine — the lifecycle', () => {
  it('expires an event exactly once', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'energy-crisis')!;
    const activated = activateEvent(state, definition, 0);

    const expired = expireEvents(activated.state, definition.durationMs + 1);
    expect(expired.expired).toHaveLength(1);
    expect(expired.state.activeEvents).toHaveLength(0);
    expect(expired.state.history).toHaveLength(1);

    // A second expiry does nothing — the event is gone.
    const again = expireEvents(expired.state, definition.durationMs + 1000);
    expect(again.expired).toHaveLength(0);
    expect(again.state.history).toHaveLength(1);
  });

  it('keeps an event active until its duration has elapsed', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'energy-crisis')!;
    const activated = activateEvent(state, definition, 0);

    const still = expireEvents(activated.state, definition.durationMs - 1);
    expect(still.expired).toHaveLength(0);
    expect(still.state.activeEvents).toHaveLength(1);
  });

  it('removes the influence of an expired event', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'energy-crisis')!;
    const activated = activateEvent(state, definition, 0);

    const active = aggregateModifiers(activated.state, 0);
    expect(active.operatingCost).toBeGreaterThan(1);

    const expired = expireEvents(activated.state, definition.durationMs + 1).state;
    const after = aggregateModifiers(expired, definition.durationMs + 1);
    expect(after.operatingCost).toBe(1);
    expect(after.commodityDemand.energy).toBe(1);
  });

  it('applies a category scoped effect only to that category', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'commodity-shortage')!;
    const activated = activateEvent(state, definition, 0);

    const modifiers = aggregateModifiers(activated.state, 0);

    expect(modifiers.commoditySupply.materials).toBeLessThan(1);
    expect(modifiers.commoditySupply.compute).toBe(1);
    expect(modifiers.commoditySupply.energy).toBe(1);
  });
});

describe('Global Events Engine — the effect system', () => {
  it('produces a neutral modifier set without any event', () => {
    const state = createInitialEventsState();
    const modifiers = aggregateModifiers(state, 0);

    expect(modifiers).toEqual(createNeutralModifiers());
  });

  it('stacks the multipliers of two overlapping events', () => {
    let state = createInitialEventsState();
    const boom = EVENT_DEFINITIONS.find((entry) => entry.id === 'global-market-boom')!;
    const surge = EVENT_DEFINITIONS.find((entry) => entry.id === 'demand-surge')!;

    state = activateEvent(state, boom, 0).state;
    state = activateEvent(state, surge, 0).state;

    const modifiers = aggregateModifiers(state, 0);

    // 1.25 (boom) × 1.35 (surge) on the market demand.
    expect(modifiers.marketDemand).toBeCloseTo(1.6875, 6);
  });

  it('clamps the multipliers to their documented bounds', () => {
    let state = createInitialEventsState();
    const boom = EVENT_DEFINITIONS.find((entry) => entry.id === 'global-market-boom')!;
    const surge = EVENT_DEFINITIONS.find((entry) => entry.id === 'demand-surge')!;
    const recession = EVENT_DEFINITIONS.find((entry) => entry.id === 'market-recession')!;

    state = activateEvent(state, boom, 0).state;
    state = activateEvent(state, surge, 0).state;
    state = activateEvent(state, recession, 0).state;

    const modifiers = aggregateModifiers(state, 0);

    expect(modifiers.marketDemand).toBeLessThanOrEqual(2);
    expect(modifiers.marketDemand).toBeGreaterThanOrEqual(0.5);
    expect(modifiers.operatingCost).toBeLessThanOrEqual(2);
    expect(modifiers.operatingCost).toBeGreaterThanOrEqual(0.5);
  });

  it('clamps the pressures to 0 .. 1', () => {
    let state = createInitialEventsState();
    const disruption = EVENT_DEFINITIONS.find((entry) => entry.id === 'supply-chain-disruption')!;
    const energy = EVENT_DEFINITIONS.find((entry) => entry.id === 'energy-crisis')!;

    state = activateEvent(state, disruption, 0).state;
    state = activateEvent(state, energy, 0).state;

    const modifiers = aggregateModifiers(state, 0);

    expect(modifiers.cityInfrastructurePressure).toBeLessThanOrEqual(1);
    expect(modifiers.cityInfrastructurePressure).toBeGreaterThanOrEqual(0);
    expect(modifiers.cityEnvironmentPressure).toBeLessThanOrEqual(1);
  });
});

describe('Global Events Engine — the player responses', () => {
  it('applies a response exactly once', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'energy-crisis')!;
    const activated = activateEvent(state, definition, 0);
    const responseId = definition.responses![0].id;

    const applied = applyEventResponse(activated.state, activated.event.id, responseId);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('setup failed');

    const again = applyEventResponse(applied.value.state, activated.event.id, responseId);
    expect(again.ok).toBe(false);
    expect(expectFailure(again).code).toBe('EVENT_RESPONSE_APPLIED');
  });

  it('rejects a response for an event that is not active', () => {
    const state = createInitialEventsState();

    const result = applyEventResponse(state, 'evt_999', 'energy-efficiency');

    expect(result.ok).toBe(false);
    expect(expectFailure(result).code).toBe('EVENT_NOT_ACTIVE');
  });

  it('rejects an unknown response', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'energy-crisis')!;
    const activated = activateEvent(state, definition, 0);

    const result = applyEventResponse(activated.state, activated.event.id, 'not-a-response');

    expect(result.ok).toBe(false);
    expect(expectFailure(result).code).toBe('EVENT_RESPONSE_UNKNOWN');
  });

  it('grants a relief that scales the effects of the event', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'energy-crisis')!;
    const activated = activateEvent(state, definition, 0);

    const before = aggregateModifiers(activated.state, 0);
    const applied = applyEventResponse(
      activated.state,
      activated.event.id,
      definition.responses![0].id,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const after = aggregateModifiers(applied.value.state, 0);

    expect(after.operatingCost).toBeLessThan(before.operatingCost);
  });

  it('expires the relief with the event', () => {
    const state = createInitialEventsState();
    const definition = EVENT_DEFINITIONS.find((entry) => entry.id === 'energy-crisis')!;
    const activated = activateEvent(state, definition, 0);
    const applied = applyEventResponse(
      activated.state,
      activated.event.id,
      definition.responses![0].id,
    );
    if (!applied.ok) throw new Error('setup failed');

    const relief = applied.value.event.relief!;
    const after = aggregateModifiers(applied.value.state, relief.untilSimMs + 1);

    expect(after.operatingCost).toBeCloseTo(aggregateModifiers(activated.state, 0).operatingCost, 6);
  });
});

describe('Global Events Engine — the news feed', () => {
  it('publishes a news item for every activation and expiration', () => {
    let state = createInitialEventsState();
    let newsCount = 0;

    for (let hour = 1; hour <= 400; hour += 1) {
      const result = advanceEvents(
        state,
        context({ elapsedSimMs: hour * HOUR, simTimeMs: hour * HOUR }),
      );
      state = result.state;
      newsCount += result.news.length;
    }

    expect(newsCount).toBeGreaterThan(0);
    expect(state.news.length).toBeGreaterThan(0);
    expect(isValidEventsState(state)).toBe(true);
  });

  it('never publishes a duplicate news item', () => {
    let state = createInitialEventsState();

    for (let hour = 1; hour <= 300; hour += 1) {
      state = advanceEvents(
        state,
        context({ elapsedSimMs: hour * HOUR, simTimeMs: hour * HOUR }),
      ).state;
    }

    const ids = state.news.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the news bounded', () => {
    let state = createInitialEventsState();

    for (let index = 0; index < 400; index += 1) {
      state = publishNews(
        state,
        {
          category: 'market',
          headline: `Headline ${index}`,
          description: 'A development.',
          relatedId: null,
          severity: 'info',
        },
        index * HOUR,
      );
    }

    expect(state.news.length).toBeLessThanOrEqual(MAX_NEWS_ITEMS);
    expect(isValidEventsState(state)).toBe(true);
  });

  it('marks a news item as read exactly once', () => {
    let state = createInitialEventsState();
    state = publishNews(
      state,
      {
        category: 'event',
        headline: 'Something happened',
        description: 'A development.',
        relatedId: null,
        severity: 'low',
      },
      0,
    );

    const id = state.news[0].id;
    const read = markNewsRead(state, id);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error('setup failed');

    const again = markNewsRead(read.value, id);
    expect(again.ok).toBe(false);
    expect(expectFailure(again).code).toBe('NEWS_ALREADY_READ');
  });

  it('rejects an unknown news item', () => {
    const state = createInitialEventsState();

    const result = markNewsRead(state, 'news_9999');

    expect(result.ok).toBe(false);
    expect(expectFailure(result).code).toBe('NEWS_NOT_FOUND');
  });
});

describe('Global Events Engine — determinism', () => {
  it('produces the same event sequence for identical runs', () => {
    const run = (): string => {
      let state = createInitialEventsState();
      for (let hour = 1; hour <= 200; hour += 1) {
        state = advanceEvents(
          state,
          context({ elapsedSimMs: hour * HOUR, simTimeMs: hour * HOUR }),
        ).state;
      }
      return JSON.stringify(state.activeEvents) + JSON.stringify(state.news);
    };

    expect(run()).toBe(run());
  });

  it('produces a reproducible random sequence', () => {
    const first = nextRandom(0x1234_5678);
    const second = nextRandom(0x1234_5678);

    expect(first.value).toBe(second.value);
    expect(first.state).toBe(second.state);
    expect(first.value).toBeGreaterThanOrEqual(0);
    expect(first.value).toBeLessThan(1);
  });

  it('schedules the next evaluation at the documented interval', () => {
    const state = createInitialEventsState();

    expect(EVENT_SCHEDULE_INTERVAL_MS).toBe(12 * HOUR);

    const early = advanceEvents(
      state,
      context({ elapsedSimMs: EVENT_SCHEDULE_INTERVAL_MS - 1, simTimeMs: 11 * HOUR }),
    );
    expect(early.state.lastScheduleElapsedMs).toBe(0);

    const late = advanceEvents(
      state,
      context({ elapsedSimMs: EVENT_SCHEDULE_INTERVAL_MS, simTimeMs: 12 * HOUR }),
    );
    expect(late.state.lastScheduleElapsedMs).toBe(EVENT_SCHEDULE_INTERVAL_MS);
  });

  it('rejects an invalid state and leaves it unchanged', () => {
    const state = createInitialEventsState();
    const broken = { ...state, randomState: -1 };

    const result = advanceEvents(broken, context());

    expect(result.state).toBe(broken);
  });

  it('rejects an invalid tick context', () => {
    const state = createInitialEventsState();

    expect(advanceEvents(state, { ...context(), deltaMs: -1 }).state).toBe(state);
    expect(advanceEvents(state, { ...context(), deltaMs: Number.NaN }).state).toBe(state);
  });

  it('exposes every event definition by its identifier', () => {
    EVENT_DEFINITIONS.forEach((definition) => {
      expect(getEventDefinition(definition.id)).toBe(definition);
    });
  });
});
