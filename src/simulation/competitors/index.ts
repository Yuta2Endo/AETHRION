/**
 * Competitor AI Engine — public surface.
 * Stage 06 implementation.
 */

export {
  AI_PERSONALITIES,
  COMPETITOR_ACTION_COOLDOWN_MS,
  COMPETITOR_BASE_OPERATING_COST,
  COMPETITOR_DECISION_INTERVAL_MS,
  COMPETITOR_DECISION_THRESHOLD,
  COMPETITOR_DEFINITIONS,
  COMPETITOR_OBJECTIVE_LABELS,
  COMPETITOR_REVENUE_PER_PRESENCE,
  MAX_COMPETITOR_HISTORY,
  getCompetitorDefinition,
  getPersonalityProfile,
  isValidCompetitor,
  isValidCompetitorFinances,
  isValidCompetitorsState,
} from './competitorState';
export type {
  AIPersonalityProfile,
  Competitor,
  CompetitorAction,
  CompetitorDefinition,
  CompetitorFinances,
  CompetitorObjective,
  CompetitorObjectiveType,
  CompetitorOperations,
  CompetitorPersonality,
  CompetitorRelationship,
  CompetitorsState,
  CompetitorResearchProject,
} from './competitorState';

export {
  advanceCompetitors,
  buildCompetitorMarketSignal,
  createInitialCompetitorsState,
  evaluateObjectives,
  findCompetitor,
  getCompetitorOperatingCostPerHour,
  getCompetitorRevenuePerHour,
  getCompetitorStability,
  getCompetitorTechnologyProgress,
  resolvePersonality,
  scoreObjective,
  selectResearchTarget,
} from './competitorRules';
export type { CompetitorContext } from './competitorRules';
