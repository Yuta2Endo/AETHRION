/**
 * Global Events Engine — public surface.
 * Stage 06 implementation.
 */

export {
  EVENT_DEFINITIONS,
  EVENT_RANDOM_SEED,
  EVENT_SCHEDULE_INTERVAL_MS,
  MAX_ACTIVE_EVENTS,
  MAX_EFFECT_MULTIPLIER,
  MAX_EVENT_HISTORY,
  MAX_NEWS_ITEMS,
  MIN_EFFECT_MULTIPLIER,
  MIN_RELIEF_MULTIPLIER,
  MAX_RELIEF_MULTIPLIER,
  createEmptyCategoryMap,
  createInitialEventsState,
  getEventDefinition,
  isValidActiveEvent,
  isValidEventDefinition,
  isValidEventEffect,
  isValidEventsState,
  isValidNewsItem,
} from './eventState';
export type {
  ActiveEvent,
  EventCategory,
  EventDefinition,
  EventEffectDefinition,
  EventEffectType,
  EventHistoryEntry,
  EventResponseDefinition,
  EventSeverity,
  EventTrigger,
  EventsState,
  NewsCategory,
  NewsItem,
  NewsSeverity,
} from './eventState';

export {
  activateEvent,
  advanceEvents,
  aggregateModifiers,
  appendNews,
  createNeutralModifiers,
  createNewsItem,
  expireEvents,
  getEventSeverity,
  getRemainingDurationMs,
  isEventEligible,
  markNewsRead,
  publishNews,
  selectNextEvent,
  applyEventResponse,
} from './eventRules';
export type { EventContext } from './eventRules';
