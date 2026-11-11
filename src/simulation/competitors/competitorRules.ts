/**
 * Competitor AI Engine — deterministic decision rules.
 *
 * All decisions are a pure function of the competitor state and the context.
 * The AI never uses `Math.random()` and never touches the ledger of the
 * player corporation.
 *
 * The decision cycle of an AI corporation:
 *
 *   1. Every `COMPETITOR_DECISION_INTERVAL_MS` of simulated time the
 *      corporation evaluates its nine objectives and picks the highest score.
 * 2. The score combines the **personality weights** with the **actual state**
 *      of the corporation and of the world.
 * 3. The action has to be affordable — a corporation never spends money it
 *      does not have.
 * 4. The action type is blocked for `COMPETITOR_ACTION_COOLDOWN_MS`, so the
 *      same action cannot repeat every tick.
 * 5. The financial model accrues the revenue and the expenses with the
 *      simulated time.
 */

import { logger } from '@/core/logging/logger';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import type {
  CommodityCategory,
  CompetitorMarketSignal,
  EventEnvironmentModifiers,
  NewsCandidate,
} from '@/simulation/contracts';
import { TECHNOLOGIES, getTechnologyDefinition, type TechnologyCategory } from '@/simulation/technology';
import {
  COMPETITOR_ACTION_COOLDOWN_MS,
  COMPETITOR_BASE_OPERATING_COST,
  COMPETITOR_DECISION_INTERVAL_MS,
  COMPETITOR_DECISION_THRESHOLD,
  COMPETITOR_DEFENSIVE_STABILITY,
  COMPETITOR_AGGRESSIVE_STABILITY,
  COMPETITOR_OBJECTIVE_LABELS,
  COMPETITOR_REVENUE_PER_PRESENCE,
  COMPETITOR_DEFINITIONS,
  MAX_COMPETITOR_HISTORY,
  COMPETITOR_PRESENCE_OPERATING_COST,
  getCompetitorDefinition,
  getPersonalityProfile,
  isValidCompetitorsState,
  type Competitor,
  type CompetitorAction,
  type CompetitorDefinition,
  type CompetitorFinances,
  type CompetitorObjectiveType,
  type CompetitorOperations,
  type CompetitorPersonality,
  type CompetitorsState,
} from './competitorState';

/** Context supplied to the competitor rules on every tick. */
export interface CompetitorContext {
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Simulated time the tick is recorded at. */
  simTimeMs: number;
  /** Aggregate commercial activity of the world, 0..100. */
  marketActivityIndex: number;
  /** Aggregate demand index of the economy, 0..100. */
  globalDemandIndex: number;
  /** Aggregate supply index of the economy, 0..100. */
  globalSupplyIndex: number;
  /** The market presence of the player corporation, 0..100. */
  playerPresence: number;
  /** The modifiers of the currently active global events. */
  modifiers: EventEnvironmentModifiers;
  /** Whether a commodity shortage is active. */
  hasShortage: boolean;
  /** Whether a commodity surplus is active. */
  hasSurplus: boolean;
}

/** The four commodity categories in their canonical order. */
const CATEGORIES: CommodityCategory[] = ['compute', 'energy', 'materials', 'logistics'];

/**
 * Creates the empty operations of a corporation.
 */
function createOperations(): CompetitorOperations {
  return {
    operatingCostPerHour: COMPETITOR_BASE_OPERATING_COST,
    categoryCapacity: { compute: 0, energy: 0, materials: 0, logistics: 0 },
    pricePressure: 0,
    costReduction: null,
    priceMove: null,
  };
}

/**
 * Creates the initial financial model of a corporation.
 */
function createFinances(capital: number): CompetitorFinances {
  return {
    startingCapital: capital,
    balance: capital,
    lifetimeRevenue: 0,
    lifetimeOperatingExpenses: 0,
    lifetimeResearchExpenses: 0,
    lifetimeInvestmentExpenses: 0,
    netResult: 0,
    stability: 50,
  };
}

/**
 * Creates the AI corporations.
 */
export function createInitialCompetitorsState(): CompetitorsState {
  const competitors: Competitor[] = COMPETITOR_DEFINITIONS.map((definition) => {
    const operations = createOperations();
    for (const category of definition.commodityCategories) {
      operations.categoryCapacity[category] = definition.startingPresence;
    }

    return {
      id: definition.id,
      name: definition.name,
      specialization: definition.specialization,
      strategy: definition.strategy,
      basePersonality: definition.personality,
      currentPersonality: definition.personality,
      reputation: definition.reputation,
      tierId: definition.tierId,
      level: definition.tierId === 'established' ? 3 : 2,
      marketPresence: definition.startingPresence,
      finances: createFinances(definition.startingCapital),
      operations,
      commodityCategories: [...definition.commodityCategories],
      technologyCategories: [...definition.technologyCategories],
      unlockedTechnologies: [],
      research: null,
      objective: {
        type: 'increase-market-presence',
        label: COMPETITOR_OBJECTIVE_LABELS['increase-market-presence'],
        priority: 50,
        targetId: null,
        sinceSimMs: 0,
      },
      history: [],
      actionCooldowns: {},
      // The first decision never happens before a full interval has passed.
      nextDecisionSimMs:
        (definition.decisionOffsetHours + COMPETITOR_DECISION_INTERVAL_MS / 3_600_000) *
        3_600_000,
      relationship: {
        standing: 0,
        competitivePressure: definition.startingPresence,
        lastInteractionSimMs: null,
      },
    };
  });

  return { competitors, sequence: 0, tick: 0 };
}

/**
 * Finds an AI corporation by its identifier.
 */
export function findCompetitor(state: CompetitorsState, id: string): Competitor | undefined {
  return state.competitors.find((competitor) => competitor.id === id);
}

/**
 * The personality a corporation currently acts with.
 *
 * The personality shifts under pressure — it is never random. A corporation in
 * trouble becomes defensive, a corporation facing a shortage becomes
 * opportunistic and the market leader becomes aggressive.
 */
export function resolvePersonality(
  competitor: Competitor,
  context: CompetitorContext,
  isLeader: boolean,
): CompetitorPersonality {
  if (competitor.finances.stability < COMPETITOR_DEFENSIVE_STABILITY) return 'defensive';
  if (context.hasShortage) return 'opportunistic';
  if (isLeader && competitor.finances.stability > COMPETITOR_AGGRESSIVE_STABILITY) return 'aggressive';
  return competitor.basePersonality;
}

/**
 * The technology a corporation should research next.
 *
 * The selection reuses the existing Stage 04 technology definitions — there is
 * no second technology tree. A technology is only eligible when the
 * corporation already unlocked its prerequisites and when the research is
 * affordable.
 */
export function selectResearchTarget(
  competitor: Competitor,
): { technologyId: string; cost: number } | null {
  const candidates = TECHNOLOGIES.filter((technology) => {
    if (competitor.unlockedTechnologies.includes(technology.id)) return false;
    if (competitor.research?.technologyId === technology.id) return false;
    if (!competitor.technologyCategories.includes(technology.category)) return false;
    if (!technology.requires.every((id) => competitor.unlockedTechnologies.includes(id))) return false;
    // The corporation never spends more than half of its balance on one project.
    return technology.researchCost <= competitor.finances.balance * 0.5;
  });

  if (candidates.length === 0) return null;

  // The cheapest eligible technology of a prioritised category — deterministic.
  const sorted = [...candidates].sort((a, b) => {
    const priority = (technology: typeof a): number =>
      competitor.technologyCategories.includes(technology.category) ? 0 : 1;
    const byPriority = priority(a) - priority(b);
    if (byPriority !== 0) return byPriority;
    if (a.researchCost !== b.researchCost) return a.researchCost - b.researchCost;
    return a.id.localeCompare(b.id);
  });

  const target = sorted[0];
  return { technologyId: target.id, cost: target.researchCost };
}

/**
 * The score of an objective.
 *
 * The score is the product of the personality weight and the need of the
 * corporation — it is bounded to 0..1.
 */
export function scoreObjective(
  competitor: Competitor,
  objective: CompetitorObjectiveType,
  context: CompetitorContext,
): number {
  const profile = getPersonalityProfile(competitor.currentPersonality);
  if (!profile) return 0;

  const weight = profile.weights[objective] ?? 0;
  const { finances, marketPresence } = competitor;

  switch (objective) {
    case 'invest-research': {
      const need = competitor.unlockedTechnologies.length < 6 ? 1 : 0.3;
      const affordability = finances.balance > 12_000 ? 1 : 0.25;
      const researchSpeed = context.modifiers.researchSpeed;
      return clamp(weight * need * affordability * researchSpeed, 0, 1);
    }
    case 'expand-production': {
      const need = marketPresence < 70 ? 1 : 0.3;
      const affordability = finances.balance > 18_000 ? 1 : 0.3;
      return clamp(weight * need * affordability, 0, 1);
    }
    case 'increase-market-presence': {
      const need = marketPresence < 60 ? 1 : 0.4;
      const affordability = finances.balance > 12_000 ? 1 : 0.3;
      return clamp(weight * need * affordability, 0, 1);
    }
    case 'enter-category': {
      const need = competitor.commodityCategories.length < 3 ? 1 : 0.2;
      const opportunity = context.hasShortage ? 1 : context.hasSurplus ? 0.7 : 0.35;
      const affordability = finances.balance > 25_000 ? 1 : 0.25;
      return clamp(weight * need * opportunity * affordability, 0, 1);
    }
    case 'cut-prices': {
      const need = marketPresence < 55 ? 1 : 0.35;
      const weakness = context.globalDemandIndex < 70 ? 0.7 : 1;
      const affordability = finances.balance > 6_000 ? 1 : 0.3;
      return clamp(weight * need * weakness * affordability, 0, 1);
    }
    case 'raise-prices': {
      const need = marketPresence > 35 ? 1 : 0.4;
      const market = context.marketActivityIndex > 60 ? 1 : 0.5;
      const affordability = finances.balance > 4_000 ? 1 : 0.35;
      return clamp(weight * need * market * affordability, 0, 1);
    }
    case 'reduce-expenses': {
      const need = finances.stability < 65 ? 1 : 0.4;
      return clamp(weight * need, 0, 1);
    }
    case 'accumulate-resources': {
      const need = context.hasShortage ? 1 : 0.3;
      const affordability = finances.balance > 10_000 ? 1 : 0.3;
      return clamp(weight * need * affordability, 0, 1);
    }
    case 'recover-financials': {
      const need = finances.stability < 45 ? 1 : 0.05;
      return clamp(weight * need, 0, 1);
    }
    default:
      return 0;
  }
}

/**
 * The cost of an objective.
 */
function getObjectiveCost(
  objective: CompetitorObjectiveType,
  targetId: string | null,
): number {
  switch (objective) {
    case 'invest-research': {
      const definition = targetId ? getTechnologyDefinition(targetId) : undefined;
      return definition?.researchCost ?? 0;
    }
    case 'expand-production':
      return 8_000;
    case 'increase-market-presence':
      return 5_000;
    case 'enter-category':
      return 12_000;
    case 'cut-prices':
      return 2_000;
    case 'raise-prices':
      return 1_500;
    case 'reduce-expenses':
      return 1_000;
    case 'accumulate-resources':
      return 6_000;
    case 'recover-financials':
      return 0;
    default:
      return 0;
  }
}

/**
 * The deterministic order in which the objectives are evaluated. It also
 * breaks the ties of two objectives with the same score.
 */
const OBJECTIVE_ORDER: CompetitorObjectiveType[] = [
  'recover-financials',
  'reduce-expenses',
  'invest-research',
  'accumulate-resources',
  'enter-category',
  'expand-production',
  'increase-market-presence',
  'cut-prices',
  'raise-prices',
];

/**
 * Evaluates the objectives of a corporation and picks the best one.
 *
 * The result is deterministic: the objectives are evaluated in a fixed order
 * and the first one with the highest score wins.
 */
export function evaluateObjectives(
  competitor: Competitor,
  context: CompetitorContext,
): { objective: CompetitorObjectiveType; score: number; targetId: string | null } | null {
  let best: { objective: CompetitorObjectiveType; score: number; targetId: string | null } | null = null;

  for (const objective of OBJECTIVE_ORDER) {
    // The action type has to be off its cooldown.
    const cooldownUntil = competitor.actionCooldowns[objective] ?? 0;
    if (context.simTimeMs < cooldownUntil) continue;

    // The research needs a target.
    let targetId: string | null = null;
    if (objective === 'invest-research') {
      const target = selectResearchTarget(competitor);
      if (!target) continue;
      targetId = target.technologyId;
    }

    const cost = getObjectiveCost(objective, targetId);
    if (cost > competitor.finances.balance) continue;

    const score = scoreObjective(competitor, objective, context);
    if (score < COMPETITOR_DECISION_THRESHOLD) continue;

    if (!best || score > best.score) {
      best = { objective, score, targetId };
    }
  }

  return best;
}

/**
 * Applies an objective to a corporation and charges its cost.
 */
function applyObjective(
  competitor: Competitor,
  decision: { objective: CompetitorObjectiveType; score: number; targetId: string | null },
  context: CompetitorContext,
): Competitor {
  const cost = getObjectiveCost(decision.objective, decision.targetId);
  const now = context.simTimeMs;

  let finances = { ...competitor.finances };
  let operations: CompetitorOperations = {
    ...competitor.operations,
    categoryCapacity: { ...competitor.operations.categoryCapacity },
  };
  let marketPresence = competitor.marketPresence;
  let reputation = competitor.reputation;
  let research = competitor.research;
  let commodityCategories = [...competitor.commodityCategories];
  let description = COMPETITOR_OBJECTIVE_LABELS[decision.objective];

  switch (decision.objective) {
    case 'invest-research': {
      finances = {
        ...finances,
        balance: roundTo(finances.balance - cost, 2),
        lifetimeResearchExpenses: roundTo(finances.lifetimeResearchExpenses + cost, 2),
      };
      research = {
        technologyId: decision.targetId ?? '',
        progress: 0,
        startedAtSimMs: now,
        costPaid: cost,
      };
      const technology = decision.targetId ? getTechnologyDefinition(decision.targetId) : undefined;
      description = `Started research into ${technology?.name ?? decision.targetId ?? 'a new technology'}`;
      break;
    }
    case 'expand-production': {
      finances = {
        ...finances,
        balance: roundTo(finances.balance - cost, 2),
        lifetimeInvestmentExpenses: roundTo(finances.lifetimeInvestmentExpenses + cost, 2),
      };
      operations.operatingCostPerHour = roundTo(operations.operatingCostPerHour + 2.5, 2);
      for (const category of commodityCategories) {
        operations.categoryCapacity[category] = roundTo(
          operations.categoryCapacity[category] + 4,
          2,
        );
      }
      marketPresence = roundTo(Math.min(100, marketPresence + 2), 2);
      break;
    }
    case 'increase-market-presence': {
      finances = {
        ...finances,
        balance: roundTo(finances.balance - cost, 2),
        lifetimeInvestmentExpenses: roundTo(finances.lifetimeInvestmentExpenses + cost, 2),
      };
      marketPresence = roundTo(Math.min(100, marketPresence + 3), 2);
      break;
    }
    case 'enter-category': {
      finances = {
        ...finances,
        balance: roundTo(finances.balance - cost, 2),
        lifetimeInvestmentExpenses: roundTo(finances.lifetimeInvestmentExpenses + cost, 2),
      };
      const category = selectNewCategory(competitor);
      if (category) {
        commodityCategories = [...commodityCategories, category];
        operations.categoryCapacity[category] = roundTo(
          (operations.categoryCapacity[category] ?? 0) + 8,
          2,
        );
        description = `Entered the ${category} market`;
      }
      break;
    }
    case 'cut-prices': {
      finances = {
        ...finances,
        balance: roundTo(finances.balance - cost, 2),
        lifetimeInvestmentExpenses: roundTo(finances.lifetimeInvestmentExpenses + cost, 2),
      };
      operations.priceMove = { pressure: -0.35, untilSimMs: now + 96 * 3_600_000 };
      marketPresence = roundTo(Math.min(100, marketPresence + 1.5), 2);
      break;
    }
    case 'raise-prices': {
      finances = {
        ...finances,
        balance: roundTo(finances.balance - cost, 2),
        lifetimeInvestmentExpenses: roundTo(finances.lifetimeInvestmentExpenses + cost, 2),
      };
      operations.priceMove = { pressure: 0.35, untilSimMs: now + 96 * 3_600_000 };
      break;
    }
    case 'reduce-expenses': {
      finances = {
        ...finances,
        balance: roundTo(finances.balance - cost, 2),
        lifetimeInvestmentExpenses: roundTo(finances.lifetimeInvestmentExpenses + cost, 2),
      };
      operations.costReduction = { factor: 0.8, untilSimMs: now + 120 * 3_600_000 };
      break;
    }
    case 'accumulate-resources': {
      finances = {
        ...finances,
        balance: roundTo(finances.balance - cost, 2),
        lifetimeInvestmentExpenses: roundTo(finances.lifetimeInvestmentExpenses + cost, 2),
      };
      for (const category of commodityCategories) {
        operations.categoryCapacity[category] = roundTo(
          operations.categoryCapacity[category] + 2,
          2,
        );
      }
      break;
    }
    case 'recover-financials': {
      operations.costReduction = { factor: 0.75, untilSimMs: now + 120 * 3_600_000 };
      description = 'Restored the financial stability';
      break;
    }
    default:
      break;
  }

  finances = {
    ...finances,
    netResult: roundTo(
      finances.lifetimeRevenue -
        finances.lifetimeOperatingExpenses -
        finances.lifetimeResearchExpenses -
        finances.lifetimeInvestmentExpenses,
      2,
    ),
  };

  const action: CompetitorAction = {
    id: `ca_${competitor.id}_${now}`,
    type: decision.objective,
    description,
    cost,
    simTimeMs: now,
    targetId: decision.targetId,
  };

  const relationship = {
    ...competitor.relationship,
    competitivePressure: roundTo(
      clamp(
        competitor.relationship.competitivePressure +
          (decision.objective === 'increase-market-presence' ? 1.5 : 0),
        0,
        100,
      ),
      2,
    ),
    standing: roundTo(
      clamp(
        competitor.relationship.standing +
          (decision.objective === 'cut-prices' ? -1 : decision.objective === 'enter-category' ? -0.5 : 0.5),
        -100,
        100,
      ),
      2,
    ),
    lastInteractionSimMs: now,
  };

  return {
    ...competitor,
    finances,
    operations,
    marketPresence,
    reputation: roundTo(clamp(reputation, 0, 100), 2),
    research,
    commodityCategories,
    objective: {
      type: decision.objective,
      label: COMPETITOR_OBJECTIVE_LABELS[decision.objective],
      priority: roundTo(decision.score * 100, 2),
      targetId: decision.targetId,
      sinceSimMs: now,
    },
    history: [...competitor.history, action].slice(-MAX_COMPETITOR_HISTORY),
    actionCooldowns: {
      ...competitor.actionCooldowns,
      [decision.objective]: now + COMPETITOR_ACTION_COOLDOWN_MS,
    },
    relationship,
  };
}

/**
 * The commodity category a corporation enters next.
 */
function selectNewCategory(competitor: Competitor): CommodityCategory | null {
  for (const category of CATEGORIES) {
    if (!competitor.commodityCategories.includes(category)) return category;
  }
  return null;
}

/**
 * The revenue an AI corporation earns per simulated hour.
 *
 * The revenue is bounded by the market presence and by the commercial
 * activity of the world — there is no unlimited artificial income.
 */
export function getCompetitorRevenuePerHour(
  competitor: Competitor,
  context: CompetitorContext,
): number {
  const presence = clamp(competitor.marketPresence, 0, 100) / 100;
  const activity = 1 + clamp(context.marketActivityIndex, 0, 100) / 100;
  const eventFactor = clamp(context.modifiers.competitorActivity, 0.5, 2);
  return roundTo(presence * COMPETITOR_REVENUE_PER_PRESENCE * activity * eventFactor, 4);
}

/**
 * The operating cost of an AI corporation per simulated hour.
 *
 * The market presence carries a part of the cost — it is what generates the
 * revenue, so the profit of a corporation stays bounded.
 */
export function getCompetitorOperatingCostPerHour(
  competitor: Competitor,
  simTimeMs: number,
): number {
  const reduction = competitor.operations.costReduction;
  const factor =
    reduction && reduction.untilSimMs > simTimeMs ? reduction.factor : 1;
  const presenceCost =
    clamp(competitor.marketPresence, 0, 100) * COMPETITOR_PRESENCE_OPERATING_COST;
  return roundTo((competitor.operations.operatingCostPerHour + presenceCost) * factor, 4);
}

/**
 * The financial stability of an AI corporation, 0..100.
 */
export function getCompetitorStability(
  finances: CompetitorFinances,
  netResultPerHour: number,
  operatingCostPerHour: number,
): number {
  const capitalRatio = finances.balance / Math.max(1, finances.startingCapital);
  const profitScore =
    operatingCostPerHour > 0 ? clamp(netResultPerHour / operatingCostPerHour, -1, 1) * 25 : 0;
  return roundTo(clamp(50 + (capitalRatio - 1) * 25 + profitScore, 0, 100), 4);
}

/**
 * Advances the research project of an AI corporation.
 */
function advanceResearch(
  competitor: Competitor,
  context: CompetitorContext,
): Competitor {
  if (!competitor.research) return competitor;

  const definition = getTechnologyDefinition(competitor.research.technologyId);
  if (!definition) {
    return { ...competitor, research: null };
  }

  // The research speed grows with the reputation of the corporation and with
  // the global research modifiers.
  const rate = (0.6 + (clamp(competitor.reputation, 0, 100) / 100) * 0.4) *
    clamp(context.modifiers.researchSpeed, 0.5, 2);

  const progress = clamp(
    roundTo(competitor.research.progress + (context.deltaMs / definition.researchDurationMs) * rate, 6),
    0,
    1,
  );

  if (progress < 1) {
    return {
      ...competitor,
      research: { ...competitor.research, progress },
    };
  }

  return {
    ...competitor,
    research: null,
    unlockedTechnologies: [...competitor.unlockedTechnologies, definition.id],
    reputation: roundTo(clamp(competitor.reputation + 3, 0, 100), 2),
  };
}

/**
 * Advances the Competitor AI Engine by one tick.
 */
export function advanceCompetitors(
  state: CompetitorsState,
  context: CompetitorContext,
): { state: CompetitorsState; actions: CompetitorAction[]; news: NewsCandidate[] } {
  if (!isValidCompetitorsState(state)) {
    logger.error('Competitor Engine rejected an invalid competitors state — state left unchanged');
    return { state, actions: [], news: [] };
  }
  if (!context || !isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    logger.error('Competitor Engine rejected an invalid tick context — state left unchanged');
    return { state, actions: [], news: [] };
  }

  const hours = context.deltaMs / 3_600_000;
  const actions: CompetitorAction[] = [];
  const news: NewsCandidate[] = [];

  const leaderPresence = state.competitors.reduce(
    (max, competitor) => Math.max(max, competitor.marketPresence),
    0,
  );

  const competitors = state.competitors.map((competitor) => {
    let current = competitor;

    // 1. The personality may shift under pressure.
    const isLeader = competitor.marketPresence >= leaderPresence && leaderPresence > 0;
    const personality = resolvePersonality(competitor, context, isLeader);
    if (personality !== current.currentPersonality) {
      current = { ...current, currentPersonality: personality };
    }

    // 2. The financial model accrues with the simulated time.
    const revenuePerHour = getCompetitorRevenuePerHour(current, context);
    const operatingCostPerHour = getCompetitorOperatingCostPerHour(current, context.simTimeMs);
    const revenue = roundTo(revenuePerHour * hours, 2);
    const operatingExpenses = roundTo(operatingCostPerHour * hours, 2);

    let finances: CompetitorFinances = {
      ...current.finances,
      balance: roundTo(Math.max(0, current.finances.balance + revenue - operatingExpenses), 2),
      lifetimeRevenue: roundTo(current.finances.lifetimeRevenue + revenue, 2),
      lifetimeOperatingExpenses: roundTo(
        current.finances.lifetimeOperatingExpenses + operatingExpenses,
        2,
      ),
    };

    const netResultPerHour = revenuePerHour - operatingCostPerHour;
    finances = {
      ...finances,
      netResult: roundTo(
        finances.lifetimeRevenue -
          finances.lifetimeOperatingExpenses -
          finances.lifetimeResearchExpenses -
          finances.lifetimeInvestmentExpenses,
        2,
      ),
      stability: getCompetitorStability(finances, netResultPerHour, operatingCostPerHour),
    };

    current = { ...current, finances };

    // 3. The research progresses with the simulated time.
    const unlockedBefore = current.unlockedTechnologies.length;
    current = advanceResearch(current, context);
    if (current.unlockedTechnologies.length > unlockedBefore) {
      const technologyId = current.unlockedTechnologies[current.unlockedTechnologies.length - 1];
      const technology = getTechnologyDefinition(technologyId);
      news.push({
        category: 'technology',
        headline: `${current.name} unlocked ${technology?.name ?? technologyId}`,
        description: `${current.name} completed its research programme in ${
          technology?.name ?? technologyId
        }.`,
        relatedId: current.id,
        severity: 'medium',
      });
    }

    // 4. The decision interval — the AI does not decide every tick.
    if (context.simTimeMs >= current.nextDecisionSimMs) {
      const decision = evaluateObjectives(current, context);
      if (decision) {
        const updated = applyObjective(current, decision, context);
        current = {
          ...updated,
          nextDecisionSimMs: context.simTimeMs + COMPETITOR_DECISION_INTERVAL_MS,
        };
        const action = current.history[current.history.length - 1];
        if (action) {
          actions.push(action);
          news.push({
            category: 'competitor',
            headline: `${current.name} — ${action.description}`,
            description: `${current.name} committed ${action.cost.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })} credits to ${action.description.toLowerCase()}.`,
            relatedId: current.id,
            severity: action.cost >= 10_000 ? 'medium' : 'info',
          });
        }
      } else {
        current = { ...current, nextDecisionSimMs: context.simTimeMs + COMPETITOR_DECISION_INTERVAL_MS };
      }
    }

    // 5. The price move expires with the simulated time.
    const priceMove = current.operations.priceMove;
    const operations: CompetitorOperations = {
      ...current.operations,
      categoryCapacity: { ...current.operations.categoryCapacity },
      pricePressure:
        priceMove && priceMove.untilSimMs > context.simTimeMs ? priceMove.pressure : 0,
    };

    return { ...current, operations };
  });

  return { state: { ...state, competitors, tick: state.tick + 1 }, actions, news };
}

/**
 * Builds the signal the Economy Engine consumes.
 *
 * The signal is only produced while at least one AI corporation is active —
 * an empty competitor state leaves the economy exactly as it was.
 */
export function buildCompetitorMarketSignal(
  state: CompetitorsState,
): CompetitorMarketSignal | null {
  if (state.competitors.length === 0) return null;

  const supplyPressure: Record<CommodityCategory, number> = {
    compute: 0,
    energy: 0,
    materials: 0,
    logistics: 0,
  };
  const demandPressure: Record<CommodityCategory, number> = {
    compute: 0,
    energy: 0,
    materials: 0,
    logistics: 0,
  };
  const pricePressure: Record<CommodityCategory, number> = {
    compute: 0,
    energy: 0,
    materials: 0,
    logistics: 0,
  };
  const priceWeight: Record<CommodityCategory, number> = {
    compute: 0,
    energy: 0,
    materials: 0,
    logistics: 0,
  };

  for (const competitor of state.competitors) {
    const presence = clamp(competitor.marketPresence, 0, 100) / 100;

    for (const category of CATEGORIES) {
      const capacity = competitor.operations.categoryCapacity[category] ?? 0;
      supplyPressure[category] += capacity * presence;

      if (competitor.commodityCategories.includes(category)) {
        demandPressure[category] += presence * 50;
        pricePressure[category] += competitor.operations.pricePressure * presence;
        priceWeight[category] += presence;
      }
    }
  }

  for (const category of CATEGORIES) {
    supplyPressure[category] = roundTo(clamp(supplyPressure[category], 0, 100), 4);
    demandPressure[category] = roundTo(clamp(demandPressure[category], 0, 100), 4);
    pricePressure[category] =
      priceWeight[category] > 0
        ? roundTo(clamp(pricePressure[category] / priceWeight[category], -1, 1), 4)
        : 0;
  }

  return { supplyPressure, demandPressure, pricePressure };
}

/**
 * The technologies an AI corporation unlocked, by category.
 */
export function getCompetitorTechnologyProgress(competitor: Competitor): {
  unlocked: number;
  byCategory: Record<TechnologyCategory, number>;
} {
  const byCategory: Record<TechnologyCategory, number> = {
    computing: 0,
    materials: 0,
    energy: 0,
    automation: 0,
    manufacturing: 0,
    ai: 0,
  };

  for (const id of competitor.unlockedTechnologies) {
    const definition = getTechnologyDefinition(id);
    if (!definition) continue;
    byCategory[definition.category] += 1;
  }

  return { unlocked: competitor.unlockedTechnologies.length, byCategory };
}

/**
 * The definition of an AI corporation.
 */
export function getCompetitorDefinitionOf(
  competitor: Competitor,
): CompetitorDefinition | undefined {
  return getCompetitorDefinition(competitor.id);
}
