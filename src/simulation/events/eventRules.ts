/**
 * Global Events Engine — deterministic rules.
 *
 * Every function is a pure function of the state, the context and the world
 * conditions. There is no `Date.now()` and no `Math.random()`: the random
 * sequence is produced by the seeded generator of `@/core/utils`, and its
 * state lives in the events state, so the whole event sequence of a run is
 * reproducible.
 *
 * Rules:
 *
 * 1. The scheduler evaluates the catalogue at most every
 *    `EVENT_SCHEDULE_INTERVAL_MS` of simulated time.
 * 2. An event may only trigger when its conditions are met, when its cooldown
 *    has expired and when it is not already active.
 * 3. The candidate events are selected with a **deterministic weighted
 *    selection** — the same roll always picks the same event.
 * 4. At most `MAX_ACTIVE_EVENTS` events are active at the same time.
 * 5. An event expires **exactly once** — the expiry is stamped and the
 *    instance is moved into the bounded history.
 * 6. The effects of the overlapping events stack **multiplicatively**, and the
 *    aggregate is clamped to 0.5 .. 2 (0 .. 1 for the pressures).
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { clamp, isFiniteNumber, nextRandom, pickWeighted, roundTo } from '@/core/utils';
import type {
  CommodityCategory,
  EventEnvironmentModifiers,
  NewsCandidate,
} from '@/simulation/contracts';
import {
  EVENT_DEFINITIONS,
  EVENT_SCHEDULE_INTERVAL_MS,
  MAX_ACTIVE_EVENTS,
  MAX_EFFECT_MULTIPLIER,
  MAX_EVENT_HISTORY,
  MAX_NEWS_ITEMS,
  MIN_EFFECT_MULTIPLIER,
  createEmptyCategoryMap,
  getEventDefinition,
  isValidEventsState,
  type ActiveEvent,
  type EventDefinition,
  type EventEffectDefinition,
  type EventHistoryEntry,
  type EventsState,
  type EventSeverity,
  type NewsCategory,
  type NewsItem,
  type NewsSeverity,
} from './eventState';

/** Context supplied to the events rules on every tick. */
export interface EventContext {
  /** Current tick number. */
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Simulated time the tick is recorded at. */
  simTimeMs: number;
  /** Simulated time elapsed since the start of the simulation. */
  elapsedSimMs: number;
  /** Aggregate development of the world, 0..100. */
  worldDevelopment: number;
  /** Aggregate commercial activity of the world, 0..100. */
  marketActivityIndex: number;
  /** Whether the player corporation exists. */
  hasCorporation: boolean;
  /** Whether the city runs at least one building. */
  hasActiveCity: boolean;
}

function failure<T>(code: string, message: string): Result<T, AppError> {
  return {
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  };
}

/**
 * The neutral modifier set — every multiplier is 1 and every pressure is 0.
 */
export function createNeutralModifiers(): EventEnvironmentModifiers {
  return {
    commodityDemand: createEmptyCategoryMap(1),
    commoditySupply: createEmptyCategoryMap(1),
    operatingCost: 1,
    researchSpeed: 1,
    productionEfficiency: 1,
    marketDemand: 1,
    cityInfrastructurePressure: 0,
    cityEnvironmentPressure: 0,
    cityCommercialActivity: 1,
    competitorActivity: 1,
  };
}

/**
 * Whether the trigger conditions of an event are met.
 */
export function isEventEligible(
  definition: EventDefinition,
  context: EventContext,
  state: EventsState,
): boolean {
  if (context.elapsedSimMs < definition.minElapsedMs) return false;

  const cooldownUntil = state.cooldowns[definition.id] ?? 0;
  if (context.simTimeMs < cooldownUntil) return false;

  if (state.activeEvents.some((event) => event.definitionId === definition.id)) return false;

  const { triggers } = definition;
  if (triggers.minWorldDevelopment !== undefined && context.worldDevelopment < triggers.minWorldDevelopment) {
    return false;
  }
  if (triggers.maxWorldDevelopment !== undefined && context.worldDevelopment > triggers.maxWorldDevelopment) {
    return false;
  }
  if (triggers.minMarketActivity !== undefined && context.marketActivityIndex < triggers.minMarketActivity) {
    return false;
  }
  if (triggers.maxMarketActivity !== undefined && context.marketActivityIndex > triggers.maxMarketActivity) {
    return false;
  }
  if (triggers.requiresCorporation && !context.hasCorporation) return false;
  if (triggers.requiresActiveCity && !context.hasActiveCity) return false;

  return true;
}

/**
 * Picks the next event deterministically.
 *
 * The candidates are the eligible events, weighted by their definition weight.
 * The roll comes from the seeded generator, so the same state always selects
 * the same event.
 */
export function selectNextEvent(
  state: EventsState,
  context: EventContext,
): { definition: EventDefinition; randomState: number } | null {
  if (state.activeEvents.length >= MAX_ACTIVE_EVENTS) return null;

  const candidates: EventDefinition[] = [];
  const weights: number[] = [];

  for (const definition of EVENT_DEFINITIONS) {
    if (!isEventEligible(definition, context, state)) continue;
    candidates.push(definition);
    weights.push(definition.weight);
  }

  if (candidates.length === 0) return null;

  const rolled = nextRandom(state.randomState);
  const picked = pickWeighted(candidates, weights, rolled.value);
  if (!picked) return null;

  return { definition: picked, randomState: rolled.state };
}

/**
 * Activates an event and creates its instance.
 */
export function activateEvent(
  state: EventsState,
  definition: EventDefinition,
  simTimeMs: number,
): { state: EventsState; event: ActiveEvent } {
  const sequence = state.sequence + 1;
  const event: ActiveEvent = {
    id: `evt_${String(sequence).padStart(3, '0')}`,
    definitionId: definition.id,
    name: definition.name,
    category: definition.category,
    severity: definition.severity,
    startedAtSimMs: simTimeMs,
    endsAtSimMs: simTimeMs + definition.durationMs,
    effects: definition.effects.map((effect) => ({ ...effect })),
    appliedResponseIds: [],
    relief: null,
  };

  const next: EventsState = {
    ...state,
    activeEvents: [...state.activeEvents, event],
    cooldowns: {
      ...state.cooldowns,
      [definition.id]: simTimeMs + definition.cooldownMs,
    },
    sequence,
  };

  return { state: next, event };
}

/**
 * Expires the events whose duration has elapsed.
 *
 * The expiry happens **exactly once**: the instance leaves the active list and
 * is written into the bounded history.
 */
export function expireEvents(
  state: EventsState,
  simTimeMs: number,
): { state: EventsState; expired: ActiveEvent[] } {
  const expired: ActiveEvent[] = [];
  const remaining: ActiveEvent[] = [];

  for (const event of state.activeEvents) {
    if (event.endsAtSimMs <= simTimeMs) {
      expired.push(event);
    } else {
      remaining.push(event);
    }
  }

  if (expired.length === 0) {
    return { state, expired };
  }

  const history: EventHistoryEntry[] = [
    ...state.history,
    ...expired.map((event) => ({
      id: event.id,
      definitionId: event.definitionId,
      name: event.name,
      category: event.category,
      severity: event.severity,
      startedAtSimMs: event.startedAtSimMs,
      endedAtSimMs: simTimeMs,
      responded: event.appliedResponseIds.length > 0,
    })),
  ].slice(-MAX_EVENT_HISTORY);

  return {
    state: { ...state, activeEvents: remaining, history },
    expired,
  };
}

/**
 * The multiplier a relief currently provides for an event instance.
 *
 * A relief expires with the simulated time — it never influences an event
 * after its duration.
 */
function getReliefMultiplier(event: ActiveEvent, simTimeMs: number): number {
  if (!event.relief) return 1;
  if (event.relief.untilSimMs <= simTimeMs) return 1;
  return event.relief.multiplier;
}

/**
 * Aggregates the effects of the active events into the modifier set.
 *
 * The multipliers stack multiplicatively and the aggregate is clamped, so
 * overlapping events can never produce an unbounded effect. The pressures are
 * additive and clamped to 0 .. 1.
 */
export function aggregateModifiers(
  state: EventsState,
  simTimeMs: number,
): EventEnvironmentModifiers {
  const modifiers = createNeutralModifiers();

  for (const event of state.activeEvents) {
    const relief = getReliefMultiplier(event, simTimeMs);

    for (const effect of event.effects) {
      applyEffect(modifiers, effect, relief);
    }
  }

  return modifiers;
}

/**
 * Applies a single effect to the modifier set.
 */
function applyEffect(
  modifiers: EventEnvironmentModifiers,
  effect: EventEffectDefinition,
  relief: number,
): void {
  switch (effect.type) {
    case 'commodity-demand': {
      const value = (effect.multiplier ?? 1) * relief;
      const categories: CommodityCategory[] = effect.category
        ? [effect.category]
        : ['compute', 'energy', 'materials', 'logistics'];
      for (const category of categories) {
        modifiers.commodityDemand[category] = clamp(
          modifiers.commodityDemand[category] * value,
          MIN_EFFECT_MULTIPLIER,
          MAX_EFFECT_MULTIPLIER,
        );
      }
      break;
    }
    case 'commodity-supply': {
      const value = (effect.multiplier ?? 1) * relief;
      const categories: CommodityCategory[] = effect.category
        ? [effect.category]
        : ['compute', 'energy', 'materials', 'logistics'];
      for (const category of categories) {
        modifiers.commoditySupply[category] = clamp(
          modifiers.commoditySupply[category] * value,
          MIN_EFFECT_MULTIPLIER,
          MAX_EFFECT_MULTIPLIER,
        );
      }
      break;
    }
    case 'operating-cost':
      modifiers.operatingCost = clamp(
        modifiers.operatingCost * (effect.multiplier ?? 1) * relief,
        MIN_EFFECT_MULTIPLIER,
        MAX_EFFECT_MULTIPLIER,
      );
      break;
    case 'research-speed':
      modifiers.researchSpeed = clamp(
        modifiers.researchSpeed * (effect.multiplier ?? 1) * relief,
        MIN_EFFECT_MULTIPLIER,
        MAX_EFFECT_MULTIPLIER,
      );
      break;
    case 'production-efficiency':
      modifiers.productionEfficiency = clamp(
        modifiers.productionEfficiency * (effect.multiplier ?? 1) * relief,
        MIN_EFFECT_MULTIPLIER,
        MAX_EFFECT_MULTIPLIER,
      );
      break;
    case 'market-demand':
      modifiers.marketDemand = clamp(
        modifiers.marketDemand * (effect.multiplier ?? 1) * relief,
        MIN_EFFECT_MULTIPLIER,
        MAX_EFFECT_MULTIPLIER,
      );
      break;
    case 'city-infrastructure-pressure':
      modifiers.cityInfrastructurePressure = clamp(
        modifiers.cityInfrastructurePressure + (effect.pressure ?? 0),
        0,
        1,
      );
      break;
    case 'city-environment-pressure':
      modifiers.cityEnvironmentPressure = clamp(
        modifiers.cityEnvironmentPressure + (effect.pressure ?? 0),
        0,
        1,
      );
      break;
    case 'city-commercial-activity':
      modifiers.cityCommercialActivity = clamp(
        modifiers.cityCommercialActivity * (effect.multiplier ?? 1) * relief,
        MIN_EFFECT_MULTIPLIER,
        MAX_EFFECT_MULTIPLIER,
      );
      break;
    case 'competitor-activity':
      modifiers.competitorActivity = clamp(
        modifiers.competitorActivity * (effect.multiplier ?? 1) * relief,
        MIN_EFFECT_MULTIPLIER,
        MAX_EFFECT_MULTIPLIER,
      );
      break;
    default:
      break;
  }
}

/**
 * Advances the Global Events Engine by one tick.
 *
 * The scheduler only evaluates the catalogue every
 * `EVENT_SCHEDULE_INTERVAL_MS` of simulated time — a long tick can therefore
 * never trigger a burst of events.
 */
export function advanceEvents(
  state: EventsState,
  context: EventContext,
): {
  state: EventsState;
  activated: ActiveEvent[];
  expired: ActiveEvent[];
  news: NewsItem[];
} {
  if (!isValidEventsState(state)) {
    logger.error('Events Engine rejected an invalid events state — state left unchanged');
    return { state, activated: [], expired: [], news: [] };
  }
  if (!context || !isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    logger.error('Events Engine rejected an invalid tick context — state left unchanged');
    return { state, activated: [], expired: [], news: [] };
  }

  const news: NewsItem[] = [];
  const activated: ActiveEvent[] = [];
  let next = state;

  // 1. The events whose duration has elapsed expire — exactly once.
  const expiry = expireEvents(next, context.simTimeMs);
  next = expiry.state;
  for (const event of expiry.expired) {
    const created = createNewsItem(
      next,
      'event',
      `${event.name} ends`,
      `The ${event.name.toLowerCase()} is over.`,
      event.id,
      event.severity,
      context.simTimeMs,
    );
    next = appendNews(created.state, [created.item]);
    news.push(created.item);
  }

  // 2. The scheduler evaluates the catalogue at a bounded interval of the
  // elapsed simulated time — a long tick can therefore never trigger a burst
  // of events.
  if (context.elapsedSimMs - next.lastScheduleElapsedMs >= EVENT_SCHEDULE_INTERVAL_MS) {
    const selection = selectNextEvent(next, context);
    if (selection) {
      const activation = activateEvent(next, selection.definition, context.simTimeMs);
      next = { ...activation.state, randomState: selection.randomState };
      activated.push(activation.event);

      const created = createNewsItem(
        next,
        'event',
        selection.definition.newsHeadline,
        selection.definition.description,
        activation.event.id,
        selection.definition.severity,
        context.simTimeMs,
      );
      next = appendNews(created.state, [created.item]);
      news.push(created.item);
    }
    next = { ...next, lastScheduleElapsedMs: context.elapsedSimMs };
  }

  next = { ...next, tick: next.tick + 1 };

  return { state: next, activated, expired: expiry.expired, news };
}

/**
 * Creates a news item with a deterministic identifier.
 *
 * The identifier sequence is shared with the events, so every identifier of
 * the engine is unique and monotonically increasing.
 */
export function createNewsItem(
  state: EventsState,
  category: NewsCategory,
  headline: string,
  description: string,
  relatedId: string | null,
  severity: NewsSeverity,
  simTimeMs: number,
): { state: EventsState; item: NewsItem } {
  const sequence = state.sequence + 1;
  const item: NewsItem = {
    id: `news_${String(sequence).padStart(4, '0')}`,
    simTimeMs,
    category,
    headline,
    description,
    relatedId,
    severity,
    read: false,
  };

  return { state: { ...state, sequence }, item };
}

/**
 * Appends news items to the feed. The feed is bounded — the oldest items are
 * dropped.
 */
export function appendNews(state: EventsState, items: NewsItem[]): EventsState {
  if (items.length === 0) return state;
  return { ...state, news: [...state.news, ...items].slice(-MAX_NEWS_ITEMS) };
}

/**
 * Publishes a news candidate and appends it to the feed.
 *
 * The Global Events Engine owns the identifier sequence of the news, so the
 * other engines only produce candidates.
 */
export function publishNews(
  state: EventsState,
  candidate: NewsCandidate,
  simTimeMs: number,
): EventsState {
  const created = createNewsItem(
    state,
    candidate.category,
    candidate.headline,
    candidate.description,
    candidate.relatedId,
    candidate.severity,
    simTimeMs,
  );

  return appendNews(created.state, [created.item]);
}

/**
 * Marks a news item as read.
 */
export function markNewsRead(state: EventsState, newsId: string): Result<EventsState, AppError> {
  const item = state.news.find((candidate) => candidate.id === newsId);
  if (!item) {
    return failure('NEWS_NOT_FOUND', `No news item with id "${newsId}".`);
  }
  if (item.read) {
    return failure('NEWS_ALREADY_READ', 'This news item has already been read.');
  }

  return {
    ok: true,
    value: {
      ...state,
      news: state.news.map((candidate) =>
        candidate.id === newsId ? { ...candidate, read: true } : candidate,
      ),
    },
  };
}

/**
 * Applies a player response to an active event.
 *
 * The response is only available while the event is active, it may only be
 * applied once and the relief it grants is bounded.
 */
export function applyEventResponse(
  state: EventsState,
  eventId: string,
  responseId: string,
): Result<{ state: EventsState; event: ActiveEvent; responseId: string }, AppError> {
  const event = state.activeEvents.find((candidate) => candidate.id === eventId);
  if (!event) {
    return failure('EVENT_NOT_ACTIVE', `No active event with id "${eventId}".`);
  }

  const definition = getEventDefinition(event.definitionId);
  if (!definition) {
    return failure('EVENT_UNKNOWN', 'The event definition no longer exists.');
  }

  const response = definition.responses?.find((candidate) => candidate.id === responseId);
  if (!response) {
    return failure('EVENT_RESPONSE_UNKNOWN', `Unknown response "${responseId}".`);
  }

  if (event.appliedResponseIds.includes(responseId)) {
    return failure('EVENT_RESPONSE_APPLIED', 'This response has already been applied.');
  }

  const relief = {
    multiplier: clamp(response.reliefMultiplier, 0.25, 2),
    untilSimMs: Math.min(event.endsAtSimMs, event.startedAtSimMs + response.reliefDurationMs),
  };

  const updated: ActiveEvent = {
    ...event,
    appliedResponseIds: [...event.appliedResponseIds, responseId],
    relief,
  };

  return {
    ok: true,
    value: {
      state: {
        ...state,
        activeEvents: state.activeEvents.map((candidate) =>
          candidate.id === eventId ? updated : candidate,
        ),
      },
      event: updated,
      responseId,
    },
  };
}

/**
 * The severity of an event, used by the interface.
 */
export function getEventSeverity(event: ActiveEvent): EventSeverity {
  return event.severity;
}

/**
 * The remaining duration of an active event, in simulated milliseconds.
 */
export function getRemainingDurationMs(event: ActiveEvent, simTimeMs: number): number {
  return Math.max(0, roundTo(event.endsAtSimMs - simTimeMs, 2));
}
