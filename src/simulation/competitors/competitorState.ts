/**
 * Competitor AI Engine — data model.
 *
 * Owns the AI corporations, their personality profiles, their financial
 * record, their research and their relationship with the player.
 *
 * Design rules (Stage 06):
 * - The competitors, their personalities and their objectives are **data
 *   driven tables** — the decision engine never hardcodes a corporation.
 * - The AI has its **own** financial model. It never touches the ledger of
 *   the player corporation.
 * - Everything stays deterministic, bounded and serialisable.
 */

import { isFiniteNumber } from '@/core/utils';
import type { CommodityCategory } from '@/simulation/contracts';
import type { TechnologyCategory } from '@/simulation/technology';

/**
 * The five personality profiles of the AI corporations.
 *
 * A personality changes the **weights** of the decision scoring — it never
 * introduces random behaviour.
 */
export type CompetitorPersonality =
  | 'aggressive'
  | 'innovative'
  | 'conservative'
  | 'opportunistic'
  | 'defensive';

/**
 * The strategic objectives — and therefore the possible actions — of an AI
 * corporation.
 */
export type CompetitorObjectiveType =
  | 'invest-research'
  | 'expand-production'
  | 'increase-market-presence'
  | 'enter-category'
  | 'cut-prices'
  | 'raise-prices'
  | 'reduce-expenses'
  | 'accumulate-resources'
  | 'recover-financials';

/**
 * The personality profile of an AI corporation.
 */
export interface AIPersonalityProfile {
  id: CompetitorPersonality;
  name: string;
  description: string;
  /** The weight of every objective, 0..1. */
  weights: Record<CompetitorObjectiveType, number>;
  /** How strongly the competitor reacts to the global events, 0..2. */
  eventSensitivity: number;
  /** How much risk the competitor accepts, 0..1. */
  riskTolerance: number;
}

/**
 * The definition of an AI corporation.
 */
export interface CompetitorDefinition {
  id: string;
  name: string;
  /** The focus of the corporation. */
  specialization: string;
  /** The long term strategy of the corporation. */
  strategy: string;
  /** The base personality of the corporation. */
  personality: CompetitorPersonality;
  /** The corporation tier the AI starts in. */
  tierId: string;
  /** The reputation the AI starts with, 0..100. */
  reputation: number;
  /** The capital the AI starts with. */
  startingCapital: number;
  /** The market presence the AI starts with, 0..100. */
  startingPresence: number;
  /** The commodity categories the AI operates in. */
  commodityCategories: CommodityCategory[];
  /** The technology categories the AI prioritizes. */
  technologyCategories: TechnologyCategory[];
  /** The offset of the decision interval, in simulated hours. */
  decisionOffsetHours: number;
}

/**
 * The independent financial model of an AI corporation.
 *
 * It is deliberately **not** the Corporation Engine of the player: the AI has
 * no employees, no payroll and no ledger. It is a compact, bounded model.
 */
export interface CompetitorFinances {
  /** The capital the AI started with. */
  startingCapital: number;
  /** The current balance. Never negative. */
  balance: number;
  /** The lifetime revenue. */
  lifetimeRevenue: number;
  /** The lifetime operating expenses. */
  lifetimeOperatingExpenses: number;
  /** The lifetime research expenses. */
  lifetimeResearchExpenses: number;
  /** The lifetime investment expenses (production, market presence, …). */
  lifetimeInvestmentExpenses: number;
  /** Revenue minus every expense. */
  netResult: number;
  /** The financial stability, 0..100. */
  stability: number;
}

/**
 * The operational state of an AI corporation.
 */
export interface CompetitorOperations {
  /** The operating cost per simulated hour. */
  operatingCostPerHour: number;
  /** The production capacity per commodity category. */
  categoryCapacity: Record<CommodityCategory, number>;
  /** The competitive price pressure, -1..1. Negative undercuts the market. */
  pricePressure: number;
  /** The cost reduction of the last action, and when it expires. */
  costReduction: { factor: number; untilSimMs: number } | null;
  /** The price move of the last action, and when it expires. */
  priceMove: { pressure: number; untilSimMs: number } | null;
}

/**
 * A research project of an AI corporation.
 */
export interface CompetitorResearchProject {
  technologyId: string;
  /** The progress between 0 and 1. */
  progress: number;
  startedAtSimMs: number;
  costPaid: number;
}

/**
 * The strategic objective an AI corporation pursues.
 */
export interface CompetitorObjective {
  type: CompetitorObjectiveType;
  label: string;
  /** How strongly the objective is pursued, 0..100. */
  priority: number;
  /** The commodity or technology the objective refers to, when relevant. */
  targetId: string | null;
  /** The simulated time the objective was set. */
  sinceSimMs: number;
}

/**
 * A significant action of an AI corporation.
 */
export interface CompetitorAction {
  id: string;
  type: CompetitorObjectiveType;
  description: string;
  /** The cost of the action. */
  cost: number;
  /** The simulated time the action was taken. */
  simTimeMs: number;
  /** The target of the action, when relevant. */
  targetId: string | null;
}

/**
 * The competitive relationship of an AI corporation with the player.
 */
export interface CompetitorRelationship {
  /** The standing with the player, -100..100. Negative is hostile. */
  standing: number;
  /** The competitive pressure the AI puts on the player, 0..100. */
  competitivePressure: number;
  /** The simulated time of the last interaction with the player. */
  lastInteractionSimMs: number | null;
}

/**
 * An AI corporation.
 */
export interface Competitor {
  id: string;
  name: string;
  specialization: string;
  strategy: string;
  /** The personality the AI was founded with. */
  basePersonality: CompetitorPersonality;
  /** The personality the AI currently acts with. It may shift. */
  currentPersonality: CompetitorPersonality;
  reputation: number;
  tierId: string;
  level: number;
  /** The market presence of the AI, 0..100. */
  marketPresence: number;
  finances: CompetitorFinances;
  operations: CompetitorOperations;
  /** The commodity categories the AI operates in. */
  commodityCategories: CommodityCategory[];
  /** The technology categories the AI prioritizes. */
  technologyCategories: TechnologyCategory[];
  /** The technologies the AI unlocked. */
  unlockedTechnologies: string[];
  /** The running research project, or null. */
  research: CompetitorResearchProject | null;
  /** The current strategic objective. */
  objective: CompetitorObjective;
  /** The bounded history of the significant actions. */
  history: CompetitorAction[];
  /** The simulated time until each objective type may be used again. */
  actionCooldowns: Record<string, number>;
  /** The simulated time of the next decision. */
  nextDecisionSimMs: number;
  /** The relationship with the player. */
  relationship: CompetitorRelationship;
}

/**
 * The state of the Competitor AI Engine.
 */
export interface CompetitorsState {
  competitors: Competitor[];
  /** The sequence used to generate the deterministic identifiers. */
  sequence: number;
  /** Number of competitor ticks processed. */
  tick: number;
}

/** The maximum number of actions kept in the history of an AI corporation. */
export const MAX_COMPETITOR_HISTORY = 12;
/** The number of simulated hours between two decisions of an AI corporation. */
export const COMPETITOR_DECISION_INTERVAL_MS = 24 * 3_600_000;
/** The number of simulated hours an action type is blocked after it was used. */
export const COMPETITOR_ACTION_COOLDOWN_MS = 72 * 3_600_000;
/** The revenue an AI corporation earns per hour at a market presence of 100. */
export const COMPETITOR_REVENUE_PER_PRESENCE = 70;
/** The operating cost of an AI corporation per simulated hour at the start. */
export const COMPETITOR_BASE_OPERATING_COST = 25;
/**
 * The operating cost per point of market presence, per simulated hour.
 *
 * The presence is what generates the revenue, so it also carries a part of
 * the cost — that keeps the profit of a corporation bounded.
 */
export const COMPETITOR_PRESENCE_OPERATING_COST = 0.35;
/** The stability below which an AI corporation becomes defensive. */
export const COMPETITOR_DEFENSIVE_STABILITY = 35;
/** The stability above which a leading AI corporation becomes aggressive. */
export const COMPETITOR_AGGRESSIVE_STABILITY = 60;
/** The score a decision has to reach before it is taken. */
export const COMPETITOR_DECISION_THRESHOLD = 0.25;

/**
 * The five personality profiles.
 */
export const AI_PERSONALITIES: readonly AIPersonalityProfile[] = [
  {
    id: 'aggressive',
    name: 'Aggressive',
    description:
      'Takes the market: expands output, undercuts the competition and pushes the prices up.',
    weights: {
      'invest-research': 0.4,
      'expand-production': 1,
      'increase-market-presence': 0.9,
      'enter-category': 0.7,
      'cut-prices': 0.9,
      'raise-prices': 0.8,
      'reduce-expenses': 0.3,
      'accumulate-resources': 0.3,
      'recover-financials': 0.2,
    },
    eventSensitivity: 1.1,
    riskTolerance: 0.9,
  },
  {
    id: 'innovative',
    name: 'Innovative',
    description:
      'Buys its future with research: the deepest research portfolio of the sector.',
    weights: {
      'invest-research': 1,
      'expand-production': 0.5,
      'increase-market-presence': 0.6,
      'enter-category': 0.6,
      'cut-prices': 0.4,
      'raise-prices': 0.5,
      'reduce-expenses': 0.3,
      'accumulate-resources': 0.4,
      'recover-financials': 0.3,
    },
    eventSensitivity: 0.9,
    riskTolerance: 0.6,
  },
  {
    id: 'conservative',
    name: 'Conservative',
    description:
      'Protects the balance: controlled investments, high prices and a full reserve.',
    weights: {
      'invest-research': 0.5,
      'expand-production': 0.4,
      'increase-market-presence': 0.5,
      'enter-category': 0.4,
      'cut-prices': 0.5,
      'raise-prices': 0.9,
      'reduce-expenses': 1,
      'accumulate-resources': 0.9,
      'recover-financials': 0.9,
    },
    eventSensitivity: 0.7,
    riskTolerance: 0.3,
  },
  {
    id: 'opportunistic',
    name: 'Opportunistic',
    description:
      'Reads the market: enters the categories the world is short of and buys what is cheap.',
    weights: {
      'invest-research': 0.6,
      'expand-production': 0.6,
      'increase-market-presence': 0.8,
      'enter-category': 1,
      'cut-prices': 0.7,
      'raise-prices': 0.8,
      'reduce-expenses': 0.4,
      'accumulate-resources': 1,
      'recover-financials': 0.7,
    },
    eventSensitivity: 1.4,
    riskTolerance: 0.7,
  },
  {
    id: 'defensive',
    name: 'Defensive',
    description:
      'Guards what it has: reserves, cost control and a protected market position.',
    weights: {
      'invest-research': 0.7,
      'expand-production': 0.3,
      'increase-market-presence': 0.4,
      'enter-category': 0.3,
      'cut-prices': 0.6,
      'raise-prices': 0.7,
      'reduce-expenses': 0.8,
      'accumulate-resources': 0.9,
      'recover-financials': 1,
    },
    eventSensitivity: 0.6,
    riskTolerance: 0.2,
  },
];

/**
 * The three AI corporations.
 */
export const COMPETITOR_DEFINITIONS: readonly CompetitorDefinition[] = [
  {
    id: 'nexora-industries',
    name: 'NEXORA INDUSTRIES',
    specialization: 'Advanced computing, electronics and frontier technology',
    strategy: 'Technology leadership — win the research race and set the standard',
    personality: 'innovative',
    tierId: 'growth',
    reputation: 28,
    startingCapital: 120_000,
    startingPresence: 34,
    commodityCategories: ['compute'],
    technologyCategories: ['computing', 'ai'],
    decisionOffsetHours: 0,
  },
  {
    id: 'vantex-global',
    name: 'VANTEX GLOBAL',
    specialization: 'Industrial production, materials and logistics',
    strategy: 'Operational efficiency — win the market share through throughput',
    personality: 'conservative',
    tierId: 'growth',
    reputation: 24,
    startingCapital: 150_000,
    startingPresence: 42,
    commodityCategories: ['materials', 'logistics'],
    technologyCategories: ['manufacturing', 'automation'],
    decisionOffsetHours: 8,
  },
  {
    id: 'helion-dynamics',
    name: 'HELION DYNAMICS',
    specialization: 'Energy generation, infrastructure and advanced materials',
    strategy: 'Resource control — secure the inputs and invest for the long term',
    personality: 'defensive',
    tierId: 'established',
    reputation: 32,
    startingCapital: 135_000,
    startingPresence: 30,
    commodityCategories: ['energy', 'materials'],
    technologyCategories: ['energy', 'materials'],
    decisionOffsetHours: 16,
  },
];

/**
 * Looks up a personality profile.
 */
export function getPersonalityProfile(id: CompetitorPersonality): AIPersonalityProfile | undefined {
  return AI_PERSONALITIES.find((profile) => profile.id === id);
}

/**
 * Looks up a competitor definition.
 */
export function getCompetitorDefinition(id: string): CompetitorDefinition | undefined {
  return COMPETITOR_DEFINITIONS.find((definition) => definition.id === id);
}

/**
 * The human readable label of an objective.
 */
export const COMPETITOR_OBJECTIVE_LABELS: Record<CompetitorObjectiveType, string> = {
  'invest-research': 'Invest in research',
  'expand-production': 'Expand the production capacity',
  'increase-market-presence': 'Increase the market presence',
  'enter-category': 'Enter a new commodity category',
  'cut-prices': 'Cut the prices',
  'raise-prices': 'Raise the prices',
  'reduce-expenses': 'Reduce the operating expenses',
  'accumulate-resources': 'Accumulate resources',
  'recover-financials': 'Recover the financial stability',
};

/**
 * Validates the financial model of an AI corporation.
 */
export function isValidCompetitorFinances(finances: CompetitorFinances): boolean {
  if (!finances) return false;
  if (!isFiniteNumber(finances.startingCapital) || finances.startingCapital <= 0) return false;
  if (!isFiniteNumber(finances.balance) || finances.balance < 0) return false;
  if (!isFiniteNumber(finances.lifetimeRevenue) || finances.lifetimeRevenue < 0) return false;
  if (!isFiniteNumber(finances.lifetimeOperatingExpenses) || finances.lifetimeOperatingExpenses < 0) {
    return false;
  }
  if (!isFiniteNumber(finances.lifetimeResearchExpenses) || finances.lifetimeResearchExpenses < 0) {
    return false;
  }
  if (!isFiniteNumber(finances.lifetimeInvestmentExpenses) || finances.lifetimeInvestmentExpenses < 0) {
    return false;
  }
  if (!isFiniteNumber(finances.netResult)) return false;
  if (!isFiniteNumber(finances.stability) || finances.stability < 0 || finances.stability > 100) {
    return false;
  }
  return true;
}

/**
 * Validates an AI corporation.
 */
export function isValidCompetitor(competitor: Competitor): boolean {
  if (!competitor) return false;
  if (typeof competitor.id !== 'string' || competitor.id.length === 0) return false;
  if (typeof competitor.name !== 'string' || competitor.name.length === 0) return false;
  if (typeof competitor.specialization !== 'string' || competitor.specialization.length === 0) return false;
  if (typeof competitor.strategy !== 'string' || competitor.strategy.length === 0) return false;
  if (!getPersonalityProfile(competitor.basePersonality)) return false;
  if (!getPersonalityProfile(competitor.currentPersonality)) return false;
  if (!isFiniteNumber(competitor.reputation) || competitor.reputation < 0 || competitor.reputation > 100) {
    return false;
  }
  if (!isFiniteNumber(competitor.level) || competitor.level < 1) return false;
  if (
    !isFiniteNumber(competitor.marketPresence) ||
    competitor.marketPresence < 0 ||
    competitor.marketPresence > 100
  ) {
    return false;
  }
  if (!isValidCompetitorFinances(competitor.finances)) return false;
  if (!isFiniteNumber(competitor.operations.operatingCostPerHour) || competitor.operations.operatingCostPerHour < 0) {
    return false;
  }
  if (
    !isFiniteNumber(competitor.operations.pricePressure) ||
    competitor.operations.pricePressure < -1 ||
    competitor.operations.pricePressure > 1
  ) {
    return false;
  }
  if (!Array.isArray(competitor.commodityCategories) || competitor.commodityCategories.length === 0) {
    return false;
  }
  if (!Array.isArray(competitor.technologyCategories) || competitor.technologyCategories.length === 0) {
    return false;
  }
  if (!Array.isArray(competitor.unlockedTechnologies)) return false;
  if (new Set(competitor.unlockedTechnologies).size !== competitor.unlockedTechnologies.length) {
    return false;
  }
  if (competitor.research !== null) {
    if (!competitor.research.technologyId) return false;
    if (
      !isFiniteNumber(competitor.research.progress) ||
      competitor.research.progress < 0 ||
      competitor.research.progress > 1
    ) {
      return false;
    }
  }
  if (!Array.isArray(competitor.history) || competitor.history.length > MAX_COMPETITOR_HISTORY) {
    return false;
  }
  if (!isFiniteNumber(competitor.nextDecisionSimMs) || competitor.nextDecisionSimMs < 0) return false;
  if (
    !isFiniteNumber(competitor.relationship.standing) ||
    competitor.relationship.standing < -100 ||
    competitor.relationship.standing > 100
  ) {
    return false;
  }
  if (
    !isFiniteNumber(competitor.relationship.competitivePressure) ||
    competitor.relationship.competitivePressure < 0 ||
    competitor.relationship.competitivePressure > 100
  ) {
    return false;
  }
  return true;
}

/**
 * Validates the whole competitors state.
 */
export function isValidCompetitorsState(state: CompetitorsState): boolean {
  if (!state) return false;
  if (!Array.isArray(state.competitors)) return false;
  if (!isFiniteNumber(state.sequence) || state.sequence < 0) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;

  const ids = new Set<string>();
  for (const competitor of state.competitors) {
    if (!isValidCompetitor(competitor)) return false;
    if (ids.has(competitor.id)) return false;
    ids.add(competitor.id);
  }

  return true;
}
