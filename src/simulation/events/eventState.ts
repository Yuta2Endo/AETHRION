/**
 * Global Events Engine — data model.
 *
 * Owns the event catalogue, the active event instances, the event history and
 * the in-game news.
 *
 * Design rules (Stage 06):
 * - The catalogue is a **data driven table**. An event is a plain record — no
 *   JavaScript callbacks, no functions inside the data.
 * - Every effect is a typed, serialisable definition with explicit bounds.
 * - Identifiers are deterministic — no `Date.now()` and no `Math.random()`
 *   ever enters the simulation state.
 */

import { isFiniteNumber } from '@/core/utils';
import type {
  CommodityCategory,
  NewsCategory,
  NewsSeverity,
  ResourceId,
} from '@/simulation/contracts';

/**
 * The categories and the severity of the news items live in the shared
 * contracts module — the Competitor Engine publishes candidates too.
 */
export type { NewsCategory, NewsSeverity };

/** The categories of the global events. */
export type EventCategory =
  | 'economic'
  | 'technology'
  | 'industrial'
  | 'energy'
  | 'environment'
  | 'geopolitical';

/** The severity of an event. */
export type EventSeverity = 'low' | 'medium' | 'high';

/**
 * The kinds of effect an event can have.
 *
 * Every effect is applied to an existing engine through a typed contract —
 * an event never mutates the simulation directly.
 */
export type EventEffectType =
  | 'commodity-demand'
  | 'commodity-supply'
  | 'operating-cost'
  | 'research-speed'
  | 'production-efficiency'
  | 'market-demand'
  | 'city-infrastructure-pressure'
  | 'city-environment-pressure'
  | 'city-commercial-activity'
  | 'competitor-activity';

/**
 * A single, typed effect of an event.
 *
 * Multiplier effects use `multiplier`, pressure effects use `pressure`. A
 * commodity effect may be restricted to one commodity category.
 */
export interface EventEffectDefinition {
  type: EventEffectType;
  /** The multiplier of a multiplier effect, 0.25 .. 2. */
  multiplier?: number;
  /** The additive pressure of a pressure effect, 0 .. 1. */
  pressure?: number;
  /** Restricts a commodity effect to a single category. */
  category?: CommodityCategory;
}

/**
 * The conditions under which an event may be triggered.
 */
export interface EventTrigger {
  /** The world development must be at least this value, 0..100. */
  minWorldDevelopment?: number;
  /** The world development must be at most this value, 0..100. */
  maxWorldDevelopment?: number;
  /** The market activity index must be at least this value, 0..100. */
  minMarketActivity?: number;
  /** The market activity index must be at most this value, 0..100. */
  maxMarketActivity?: number;
  /** The event needs the player corporation to exist. */
  requiresCorporation?: boolean;
  /** The event needs a city that runs at least one building. */
  requiresActiveCity?: boolean;
}

/**
 * A player response to an active event.
 *
 * A response always has a real cost and a real, measurable effect: the relief
 * multiplier scales the effects of the event instance while it lasts.
 */
export interface EventResponseDefinition {
  id: string;
  label: string;
  description: string;
  /** One-time corporate cost in Aether Credits. */
  cost: number;
  /** Multiplier applied to the effects of this event instance, 0.25 .. 2. */
  reliefMultiplier: number;
  /** How long the relief lasts, in simulated milliseconds. */
  reliefDurationMs: number;
  /** An optional resource purchase the response performs. */
  resourcePurchase?: {
    resourceId: ResourceId;
    quantity: number;
  };
}

/**
 * The definition of a global event.
 */
export interface EventDefinition {
  id: string;
  name: string;
  description: string;
  category: EventCategory;
  severity: EventSeverity;
  /** How long the event lasts, in simulated milliseconds. */
  durationMs: number;
  /** How long the event has to be absent before it may trigger again. */
  cooldownMs: number;
  /** The event may not trigger before this much simulated time has passed. */
  minElapsedMs: number;
  /** The conditions of the trigger. */
  triggers: EventTrigger;
  /** The effects of the event. */
  effects: EventEffectDefinition[];
  /** The optional player responses. */
  responses?: EventResponseDefinition[];
  /** The weight of the deterministic weighted selection. */
  weight: number;
  /** The headline of the news item the event produces. */
  newsHeadline: string;
}

/**
 * An event that is currently active.
 */
export interface ActiveEvent {
  id: string;
  definitionId: string;
  name: string;
  category: EventCategory;
  severity: EventSeverity;
  startedAtSimMs: number;
  endsAtSimMs: number;
  /** The effects of the definition. */
  effects: EventEffectDefinition[];
  /** The responses the player already chose. */
  appliedResponseIds: string[];
  /** The relief a granted response provides, and when it expires. */
  relief: {
    multiplier: number;
    untilSimMs: number;
  } | null;
}

/**
 * An entry of the bounded event history.
 */
export interface EventHistoryEntry {
  id: string;
  definitionId: string;
  name: string;
  category: EventCategory;
  severity: EventSeverity;
  startedAtSimMs: number;
  endedAtSimMs: number;
  /** Whether the player answered the event. */
  responded: boolean;
}

/**
 * The categories of the news items.
 */
export type NewsItemCategory = NewsCategory;

/**
 * The severity of a news item.
 */
export type NewsItemSeverity = NewsSeverity;

/**
 * A single news item.
 *
 * News is always generated from an actual simulation event — there is no
 * invented content.
 */
export interface NewsItem {
  id: string;
  /** The simulated time the item was published at. */
  simTimeMs: number;
  category: NewsCategory;
  headline: string;
  description: string;
  /** The identifier of the related entity, when there is one. */
  relatedId: string | null;
  severity: NewsSeverity;
  read: boolean;
}

/**
 * The state of the Global Events Engine.
 */
export interface EventsState {
  /** The events that are currently active. */
  activeEvents: ActiveEvent[];
  /** The bounded history of the events that ended. */
  history: EventHistoryEntry[];
  /** The bounded news feed. */
  news: NewsItem[];
  /** The deterministic random state of the scheduler. */
  randomState: number;
  /** The elapsed simulated time of the last scheduling evaluation. */
  lastScheduleElapsedMs: number;
  /** The simulated time each event definition may trigger again. */
  cooldowns: Record<string, number>;
  /** The sequence used to generate the deterministic identifiers. */
  sequence: number;
  /** Number of event ticks processed. */
  tick: number;
}

/** The maximum number of events that may be active at the same time. */
export const MAX_ACTIVE_EVENTS = 3;
/** The maximum number of entries kept in the event history. */
export const MAX_EVENT_HISTORY = 24;
/** The maximum number of items kept in the news feed. */
export const MAX_NEWS_ITEMS = 40;
/** The minimum interval between two scheduling evaluations, in simulated hours. */
export const EVENT_SCHEDULE_INTERVAL_MS = 12 * 3_600_000;
/** The lower bound of every effect multiplier. */
export const MIN_EFFECT_MULTIPLIER = 0.5;
/** The upper bound of every effect multiplier. */
export const MAX_EFFECT_MULTIPLIER = 2;
/** The lower bound of a relief multiplier. */
export const MIN_RELIEF_MULTIPLIER = 0.25;
/** The upper bound of a relief multiplier. */
export const MAX_RELIEF_MULTIPLIER = 2;
/** The default seed of the event scheduler. */
export const EVENT_RANDOM_SEED = 0x5eed_e001;

const HOUR = 3_600_000;

/**
 * The global event catalogue — seventeen data driven definitions.
 */
export const EVENT_DEFINITIONS: readonly EventDefinition[] = [
  // ------------------------------------------------------------- Economic
  {
    id: 'global-market-boom',
    name: 'Global Market Boom',
    description:
      'Capital floods into the markets. Demand surges and every producer struggles to keep up.',
    category: 'economic',
    severity: 'medium',
    durationMs: 96 * HOUR,
    cooldownMs: 320 * HOUR,
    minElapsedMs: 72 * HOUR,
    triggers: { minMarketActivity: 40 },
    effects: [
      { type: 'commodity-demand', multiplier: 1.2 },
      { type: 'market-demand', multiplier: 1.25 },
      { type: 'city-commercial-activity', multiplier: 1.15 },
    ],
    responses: [
      {
        id: 'boom-expand-output',
        label: 'Expand production to capture the boom',
        description: 'Invest 8 000 credits in additional output capacity.',
        cost: 8_000,
        reliefMultiplier: 1.1,
        reliefDurationMs: 120 * HOUR,
      },
      {
        id: 'boom-hold-reserves',
        label: 'Hold reserves and wait',
        description: 'Accept the higher costs and keep the balance safe.',
        cost: 1_500,
        reliefMultiplier: 0.95,
        reliefDurationMs: 120 * HOUR,
      },
    ],
    weight: 10,
    newsHeadline: 'Global market boom lifts every sector',
  },
  {
    id: 'market-recession',
    name: 'Market Recession',
    description:
      'Orders collapse across the board. Companies cut costs and hoard their remaining capital.',
    category: 'economic',
    severity: 'high',
    durationMs: 120 * HOUR,
    cooldownMs: 400 * HOUR,
    minElapsedMs: 120 * HOUR,
    triggers: { maxMarketActivity: 70 },
    effects: [
      { type: 'commodity-demand', multiplier: 0.78 },
      { type: 'market-demand', multiplier: 0.72 },
      { type: 'city-commercial-activity', multiplier: 0.8 },
      { type: 'competitor-activity', multiplier: 0.85 },
    ],
    responses: [
      {
        id: 'recession-cut-costs',
        label: 'Cut operating expenses',
        description: 'Pay 5 000 credits to reduce the operating costs of the period.',
        cost: 5_000,
        reliefMultiplier: 0.85,
        reliefDurationMs: 160 * HOUR,
      },
      {
        id: 'recession-accumulate',
        label: 'Accumulate scarce resources',
        description: 'Buy 120 units of raw materials while the prices are low.',
        cost: 2_000,
        reliefMultiplier: 0.95,
        reliefDurationMs: 160 * HOUR,
        resourcePurchase: { resourceId: 'raw-materials', quantity: 120 },
      },
    ],
    weight: 9,
    newsHeadline: 'Recession empties the order books of the sector',
  },
  {
    id: 'inflation-shock',
    name: 'Inflation Shock',
    description:
      'The cost of everything rises. Operating expenses and energy bills surge together.',
    category: 'economic',
    severity: 'medium',
    durationMs: 72 * HOUR,
    cooldownMs: 288 * HOUR,
    minElapsedMs: 96 * HOUR,
    triggers: {},
    effects: [
      { type: 'operating-cost', multiplier: 1.3 },
      { type: 'commodity-supply', multiplier: 0.88 },
    ],
    responses: [
      {
        id: 'inflation-efficiency',
        label: 'Invest in energy efficiency',
        description: 'Pay 6 500 credits to offset the inflation of the operating costs.',
        cost: 6_500,
        reliefMultiplier: 0.8,
        reliefDurationMs: 120 * HOUR,
      },
    ],
    weight: 9,
    newsHeadline: 'Inflation shock drives the operating costs up',
  },
  {
    id: 'commodity-shortage',
    name: 'Commodity Shortage',
    description:
      'A structural deficit in the materials supply. The scarce goods become expensive fast.',
    category: 'economic',
    severity: 'high',
    durationMs: 96 * HOUR,
    cooldownMs: 360 * HOUR,
    minElapsedMs: 144 * HOUR,
    triggers: {},
    effects: [
      { type: 'commodity-supply', multiplier: 0.7, category: 'materials' },
      { type: 'commodity-demand', multiplier: 1.15, category: 'materials' },
    ],
    responses: [
      {
        id: 'shortage-stockpile',
        label: 'Stockpile raw materials',
        description: 'Buy 150 units of raw materials before the shortage bites.',
        cost: 3_000,
        reliefMultiplier: 0.9,
        reliefDurationMs: 120 * HOUR,
        resourcePurchase: { resourceId: 'raw-materials', quantity: 150 },
      },
    ],
    weight: 8,
    newsHeadline: 'Commodity shortage tightens the materials market',
  },
  {
    id: 'demand-surge',
    name: 'Demand Surge',
    description:
      'A wave of consumption sweeps the market. Everything that can be sold is sold.',
    category: 'economic',
    severity: 'low',
    durationMs: 48 * HOUR,
    cooldownMs: 240 * HOUR,
    minElapsedMs: 48 * HOUR,
    triggers: { minMarketActivity: 55 },
    effects: [
      { type: 'market-demand', multiplier: 1.35 },
      { type: 'commodity-demand', multiplier: 1.1 },
    ],
    weight: 10,
    newsHeadline: 'Demand surge catches the market unprepared',
  },

  // ---------------------------------------------------------- Technology
  {
    id: 'scientific-breakthrough',
    name: 'Scientific Breakthrough',
    description:
      'A fundamental discovery accelerates every research programme in the world.',
    category: 'technology',
    severity: 'medium',
    durationMs: 120 * HOUR,
    cooldownMs: 384 * HOUR,
    minElapsedMs: 120 * HOUR,
    triggers: {},
    effects: [
      { type: 'research-speed', multiplier: 1.35 },
      { type: 'competitor-activity', multiplier: 1.1 },
    ],
    responses: [
      {
        id: 'science-fund-labs',
        label: 'Fund the laboratories',
        description: 'Pay 4 500 credits to gain even more research throughput.',
        cost: 4_500,
        reliefMultiplier: 1.15,
        reliefDurationMs: 160 * HOUR,
      },
    ],
    weight: 8,
    newsHeadline: 'Scientific breakthrough accelerates research worldwide',
  },
  {
    id: 'semiconductor-breakthrough',
    name: 'Semiconductor Breakthrough',
    description:
      'A new fabrication process changes the economics of computing hardware for good.',
    category: 'technology',
    severity: 'medium',
    durationMs: 144 * HOUR,
    cooldownMs: 432 * HOUR,
    minElapsedMs: 168 * HOUR,
    triggers: {},
    effects: [
      { type: 'commodity-supply', multiplier: 1.2, category: 'compute' },
      { type: 'production-efficiency', multiplier: 1.15 },
    ],
    responses: [
      {
        id: 'semiconductor-upgrade-lines',
        label: 'Upgrade the production lines',
        description: 'Pay 7 000 credits to convert the gain into output.',
        cost: 7_000,
        reliefMultiplier: 1.2,
        reliefDurationMs: 160 * HOUR,
      },
    ],
    weight: 7,
    newsHeadline: 'Semiconductor breakthrough reshapes the compute supply',
  },
  {
    id: 'ai-research-breakthrough',
    name: 'AI Research Breakthrough',
    description:
      'Machine cognition takes a decisive step forward. The software market never looks back.',
    category: 'technology',
    severity: 'high',
    durationMs: 168 * HOUR,
    cooldownMs: 480 * HOUR,
    minElapsedMs: 240 * HOUR,
    triggers: {},
    effects: [
      { type: 'research-speed', multiplier: 1.45 },
      { type: 'market-demand', multiplier: 1.3 },
      { type: 'competitor-activity', multiplier: 1.15 },
    ],
    responses: [
      {
        id: 'ai-patent-programme',
        label: 'Launch a patent programme',
        description: 'Pay 9 000 credits to protect the advantage.',
        cost: 9_000,
        reliefMultiplier: 1.15,
        reliefDurationMs: 200 * HOUR,
      },
    ],
    weight: 6,
    newsHeadline: 'AI research breakthrough divides the industry',
  },
  {
    id: 'technology-regulation',
    name: 'Technology Regulation',
    description:
      'New compliance rules restrict the research of every laboratory that operates in the sector.',
    category: 'technology',
    severity: 'medium',
    durationMs: 96 * HOUR,
    cooldownMs: 336 * HOUR,
    minElapsedMs: 144 * HOUR,
    triggers: { requiresCorporation: true },
    effects: [
      { type: 'research-speed', multiplier: 0.72 },
      { type: 'operating-cost', multiplier: 1.12 },
    ],
    responses: [
      {
        id: 'regulation-compliance',
        label: 'Invest in compliance',
        description: 'Pay 5 500 credits to meet the new rules.',
        cost: 5_500,
        reliefMultiplier: 0.8,
        reliefDurationMs: 140 * HOUR,
      },
      {
        id: 'regulation-suspend',
        label: 'Suspend the affected research',
        description: 'Pause the programmes for a lower cost, at a heavier price.',
        cost: 2_500,
        reliefMultiplier: 0.9,
        reliefDurationMs: 140 * HOUR,
      },
    ],
    weight: 8,
    newsHeadline: 'Technology regulation forces the sector to comply',
  },

  // ------------------------------------------------------------ Industrial
  {
    id: 'supply-chain-disruption',
    name: 'Supply Chain Disruption',
    description:
      'Freight corridors fail across the region. The factories slow down and the logistics cost rises.',
    category: 'industrial',
    severity: 'high',
    durationMs: 84 * HOUR,
    cooldownMs: 300 * HOUR,
    minElapsedMs: 96 * HOUR,
    triggers: {},
    effects: [
      { type: 'production-efficiency', multiplier: 0.75 },
      { type: 'commodity-supply', multiplier: 0.82, category: 'logistics' },
      { type: 'city-infrastructure-pressure', pressure: 0.2 },
    ],
    responses: [
      {
        id: 'disruption-logistics',
        label: 'Invest in logistics capacity',
        description: 'Pay 6 000 credits to protect the throughput.',
        cost: 6_000,
        reliefMultiplier: 0.85,
        reliefDurationMs: 120 * HOUR,
      },
      {
        id: 'disruption-reduce',
        label: 'Reduce the production activity',
        description: 'Slow the lines down for a lower cost.',
        cost: 2_000,
        reliefMultiplier: 0.9,
        reliefDurationMs: 120 * HOUR,
      },
    ],
    weight: 9,
    newsHeadline: 'Supply chain disruption halts the freight corridors',
  },
  {
    id: 'manufacturing-crisis',
    name: 'Manufacturing Crisis',
    description:
      'A failure cascades through the plants. Output drops and the operating costs spike.',
    category: 'industrial',
    severity: 'high',
    durationMs: 72 * HOUR,
    cooldownMs: 288 * HOUR,
    minElapsedMs: 120 * HOUR,
    triggers: {},
    effects: [
      { type: 'production-efficiency', multiplier: 0.65 },
      { type: 'operating-cost', multiplier: 1.25 },
    ],
    responses: [
      {
        id: 'crisis-maintenance',
        label: 'Emergency maintenance',
        description: 'Pay 8 000 credits to bring the lines back up.',
        cost: 8_000,
        reliefMultiplier: 0.8,
        reliefDurationMs: 100 * HOUR,
      },
    ],
    weight: 7,
    newsHeadline: 'Manufacturing crisis shakes the industrial sector',
  },
  {
    id: 'industrial-automation-breakthrough',
    name: 'Industrial Automation Breakthrough',
    description:
      'Self-operating lines reach the market. Every factory becomes cheaper to run.',
    category: 'industrial',
    severity: 'low',
    durationMs: 144 * HOUR,
    cooldownMs: 400 * HOUR,
    minElapsedMs: 168 * HOUR,
    triggers: {},
    effects: [
      { type: 'production-efficiency', multiplier: 1.2 },
      { type: 'operating-cost', multiplier: 0.88 },
    ],
    weight: 8,
    newsHeadline: 'Automation breakthrough lowers the cost of production',
  },

  // ------------------------------------------------------ Energy & Environment
  {
    id: 'energy-crisis',
    name: 'Energy Crisis',
    description:
      'The power grid cannot cover the demand. Energy costs explode and the city strains.',
    category: 'energy',
    severity: 'high',
    durationMs: 96 * HOUR,
    cooldownMs: 336 * HOUR,
    minElapsedMs: 120 * HOUR,
    triggers: {},
    effects: [
      { type: 'operating-cost', multiplier: 1.4 },
      { type: 'commodity-demand', multiplier: 1.3, category: 'energy' },
      { type: 'commodity-supply', multiplier: 0.75, category: 'energy' },
      { type: 'city-infrastructure-pressure', pressure: 0.3 },
    ],
    responses: [
      {
        id: 'energy-efficiency',
        label: 'Invest in energy efficiency',
        description: 'Pay 7 500 credits to reduce the energy draw of the operation.',
        cost: 7_500,
        reliefMultiplier: 0.82,
        reliefDurationMs: 140 * HOUR,
      },
      {
        id: 'energy-buy-stock',
        label: 'Purchase additional energy',
        description: 'Buy 200 MWh of energy and pay the premium of 4 000 credits.',
        cost: 4_000,
        reliefMultiplier: 0.88,
        reliefDurationMs: 140 * HOUR,
        resourcePurchase: { resourceId: 'energy', quantity: 200 },
      },
      {
        id: 'energy-reduce-output',
        label: 'Reduce the production activity',
        description: 'Slow the operation down and accept the lost output.',
        cost: 1_000,
        reliefMultiplier: 0.92,
        reliefDurationMs: 140 * HOUR,
      },
    ],
    weight: 9,
    newsHeadline: 'Energy crisis rattles the industrial belt',
  },
  {
    id: 'renewable-energy-breakthrough',
    name: 'Renewable Energy Breakthrough',
    description:
      'A new generation of collectors makes the energy supply abundant and cheap.',
    category: 'energy',
    severity: 'medium',
    durationMs: 120 * HOUR,
    cooldownMs: 360 * HOUR,
    minElapsedMs: 144 * HOUR,
    triggers: {},
    effects: [
      { type: 'commodity-supply', multiplier: 1.25, category: 'energy' },
      { type: 'operating-cost', multiplier: 0.9 },
      { type: 'city-infrastructure-pressure', pressure: -0.1 },
    ],
    responses: [
      {
        id: 'renewable-build-plants',
        label: 'Build additional power capacity',
        description: 'Pay 5 000 credits to exploit the cheap energy.',
        cost: 5_000,
        reliefMultiplier: 1.12,
        reliefDurationMs: 140 * HOUR,
      },
    ],
    weight: 8,
    newsHeadline: 'Renewable breakthrough floods the market with cheap power',
  },
  {
    id: 'environmental-restrictions',
    name: 'Environmental Restrictions',
    description:
      'New emission limits bind the whole sector. The environment of the city suffers.',
    category: 'environment',
    severity: 'medium',
    durationMs: 108 * HOUR,
    cooldownMs: 336 * HOUR,
    minElapsedMs: 168 * HOUR,
    triggers: { requiresActiveCity: true },
    effects: [
      { type: 'operating-cost', multiplier: 1.18 },
      { type: 'city-environment-pressure', pressure: 0.25 },
      { type: 'city-infrastructure-pressure', pressure: 0.15 },
    ],
    responses: [
      {
        id: 'environment-compliance',
        label: 'Invest in compliance',
        description: 'Pay 6 000 credits to meet the new emission limits.',
        cost: 6_000,
        reliefMultiplier: 0.85,
        reliefDurationMs: 140 * HOUR,
      },
      {
        id: 'environment-accept',
        label: 'Accept the restrictions',
        description: 'Pay nothing and live with the higher costs.',
        cost: 0,
        reliefMultiplier: 1,
        reliefDurationMs: 140 * HOUR,
      },
    ],
    weight: 8,
    newsHeadline: 'Environmental restrictions tighten the emission limits',
  },

  // --------------------------------------------------------- Geopolitical
  {
    id: 'international-trade-restrictions',
    name: 'International Trade Restrictions',
    description:
      'Trade barriers divide the markets. Cross-border commerce slows down everywhere.',
    category: 'geopolitical',
    severity: 'high',
    durationMs: 120 * HOUR,
    cooldownMs: 400 * HOUR,
    minElapsedMs: 192 * HOUR,
    triggers: {},
    effects: [
      { type: 'market-demand', multiplier: 0.8 },
      { type: 'commodity-supply', multiplier: 0.88, category: 'logistics' },
      { type: 'competitor-activity', multiplier: 0.9 },
    ],
    responses: [
      {
        id: 'trade-localise',
        label: 'Localise the supply chain',
        description: 'Pay 6 500 credits to rebuild the sourcing around the home region.',
        cost: 6_500,
        reliefMultiplier: 0.85,
        reliefDurationMs: 160 * HOUR,
      },
      {
        id: 'trade-absorb',
        label: 'Absorb the tariffs',
        description: 'Pay 3 000 credits and keep trading.',
        cost: 3_000,
        reliefMultiplier: 0.95,
        reliefDurationMs: 160 * HOUR,
      },
    ],
    weight: 7,
    newsHeadline: 'Trade restrictions split the international markets',
  },
  {
    id: 'corporate-regulation-changes',
    name: 'Corporate Regulation Changes',
    description:
      'A new regulatory framework changes the rules of the market — mildly, but everywhere.',
    category: 'geopolitical',
    severity: 'low',
    durationMs: 72 * HOUR,
    cooldownMs: 264 * HOUR,
    minElapsedMs: 96 * HOUR,
    triggers: { requiresCorporation: true },
    effects: [
      { type: 'operating-cost', multiplier: 1.08 },
      { type: 'market-demand', multiplier: 0.96 },
    ],
    weight: 9,
    newsHeadline: 'Corporate regulation changes reshape the market rules',
  },
];

/**
 * Creates a map of the four commodity categories with the same initial value.
 */
export function createEmptyCategoryMap(initial: number): Record<CommodityCategory, number> {
  return {
    compute: initial,
    energy: initial,
    materials: initial,
    logistics: initial,
  };
}

/**
 * Looks up an event definition by its identifier.
 */
export function getEventDefinition(id: string): EventDefinition | undefined {
  return EVENT_DEFINITIONS.find((definition) => definition.id === id);
}

/**
 * Creates the initial state of the Global Events Engine.
 */
export function createInitialEventsState(): EventsState {
  return {
    activeEvents: [],
    history: [],
    news: [],
    randomState: EVENT_RANDOM_SEED,
    lastScheduleElapsedMs: 0,
    cooldowns: {},
    sequence: 0,
    tick: 0,
  };
}

/**
 * Validates a single effect definition.
 */
export function isValidEventEffect(effect: EventEffectDefinition): boolean {
  if (!effect) return false;
  if (
    ![
      'commodity-demand',
      'commodity-supply',
      'operating-cost',
      'research-speed',
      'production-efficiency',
      'market-demand',
      'city-infrastructure-pressure',
      'city-environment-pressure',
      'city-commercial-activity',
      'competitor-activity',
    ].includes(effect.type)
  ) {
    return false;
  }

  const isPressure =
    effect.type === 'city-infrastructure-pressure' || effect.type === 'city-environment-pressure';

  if (isPressure) {
    if (!isFiniteNumber(effect.pressure) || effect.pressure < -1 || effect.pressure > 1) return false;
  } else {
    if (
      !isFiniteNumber(effect.multiplier) ||
      effect.multiplier < MIN_EFFECT_MULTIPLIER ||
      effect.multiplier > MAX_EFFECT_MULTIPLIER
    ) {
      return false;
    }
  }

  if (effect.category !== undefined) {
    if (!['compute', 'energy', 'materials', 'logistics'].includes(effect.category)) return false;
  }

  return true;
}

/**
 * Validates an event definition.
 */
export function isValidEventDefinition(definition: EventDefinition): boolean {
  if (!definition) return false;
  if (typeof definition.id !== 'string' || definition.id.length === 0) return false;
  if (typeof definition.name !== 'string' || definition.name.length === 0) return false;
  if (typeof definition.description !== 'string' || definition.description.length === 0) return false;
  if (!['economic', 'technology', 'industrial', 'energy', 'environment', 'geopolitical'].includes(definition.category)) {
    return false;
  }
  if (!['low', 'medium', 'high'].includes(definition.severity)) return false;
  if (!isFiniteNumber(definition.durationMs) || definition.durationMs <= 0) return false;
  if (!isFiniteNumber(definition.cooldownMs) || definition.cooldownMs < 0) return false;
  if (!isFiniteNumber(definition.minElapsedMs) || definition.minElapsedMs < 0) return false;
  if (!isFiniteNumber(definition.weight) || definition.weight <= 0) return false;
  if (typeof definition.newsHeadline !== 'string' || definition.newsHeadline.length === 0) return false;
  if (!Array.isArray(definition.effects) || definition.effects.length === 0) return false;
  for (const effect of definition.effects) {
    if (!isValidEventEffect(effect)) return false;
  }

  if (definition.responses !== undefined) {
    if (!Array.isArray(definition.responses)) return false;
    const ids = new Set<string>();
    for (const response of definition.responses) {
      if (!response) return false;
      if (typeof response.id !== 'string' || response.id.length === 0) return false;
      if (ids.has(response.id)) return false;
      ids.add(response.id);
      if (typeof response.label !== 'string' || response.label.length === 0) return false;
      if (!isFiniteNumber(response.cost) || response.cost < 0) return false;
      if (
        !isFiniteNumber(response.reliefMultiplier) ||
        response.reliefMultiplier < MIN_RELIEF_MULTIPLIER ||
        response.reliefMultiplier > MAX_RELIEF_MULTIPLIER
      ) {
        return false;
      }
      if (!isFiniteNumber(response.reliefDurationMs) || response.reliefDurationMs <= 0) return false;
      if (response.resourcePurchase !== undefined) {
        if (!isFiniteNumber(response.resourcePurchase.quantity)) return false;
        if (response.resourcePurchase.quantity <= 0) return false;
      }
    }
  }

  return true;
}

/**
 * Validates an active event instance.
 */
export function isValidActiveEvent(event: ActiveEvent): boolean {
  if (!event) return false;
  if (typeof event.id !== 'string' || event.id.length === 0) return false;
  if (!getEventDefinition(event.definitionId)) return false;
  if (!isFiniteNumber(event.startedAtSimMs) || event.startedAtSimMs < 0) return false;
  if (!isFiniteNumber(event.endsAtSimMs) || event.endsAtSimMs <= event.startedAtSimMs) return false;
  if (!Array.isArray(event.effects) || event.effects.length === 0) return false;
  if (!Array.isArray(event.appliedResponseIds)) return false;
  if (new Set(event.appliedResponseIds).size !== event.appliedResponseIds.length) return false;
  if (event.relief !== null) {
    if (!isFiniteNumber(event.relief.multiplier)) return false;
    if (!isFiniteNumber(event.relief.untilSimMs)) return false;
  }
  return true;
}

/**
 * Validates a news item.
 */
export function isValidNewsItem(item: NewsItem): boolean {
  if (!item) return false;
  if (typeof item.id !== 'string' || item.id.length === 0) return false;
  if (!isFiniteNumber(item.simTimeMs) || item.simTimeMs < 0) return false;
  if (!['event', 'competitor', 'technology', 'market', 'player'].includes(item.category)) return false;
  if (typeof item.headline !== 'string' || item.headline.length === 0) return false;
  if (typeof item.description !== 'string') return false;
  if (item.relatedId !== null && typeof item.relatedId !== 'string') return false;
  if (!['info', 'low', 'medium', 'high'].includes(item.severity)) return false;
  if (typeof item.read !== 'boolean') return false;
  return true;
}

/**
 * Validates the whole events state.
 */
export function isValidEventsState(state: EventsState): boolean {
  if (!state) return false;
  if (!Array.isArray(state.activeEvents) || state.activeEvents.length > MAX_ACTIVE_EVENTS) {
    return false;
  }
  if (!Array.isArray(state.history) || state.history.length > MAX_EVENT_HISTORY) return false;
  if (!Array.isArray(state.news) || state.news.length > MAX_NEWS_ITEMS) return false;
  if (!isFiniteNumber(state.randomState) || state.randomState < 0) return false;
  if (!isFiniteNumber(state.lastScheduleElapsedMs) || state.lastScheduleElapsedMs < 0) return false;
  if (!isFiniteNumber(state.sequence) || state.sequence < 0) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;
  if (!state.cooldowns || typeof state.cooldowns !== 'object') return false;

  const activeIds = new Set<string>();
  for (const event of state.activeEvents) {
    if (!isValidActiveEvent(event)) return false;
    if (activeIds.has(event.id)) return false;
    activeIds.add(event.id);
  }

  const newsIds = new Set<string>();
  for (const item of state.news) {
    if (!isValidNewsItem(item)) return false;
    if (newsIds.has(item.id)) return false;
    newsIds.add(item.id);
  }

  return true;
}
