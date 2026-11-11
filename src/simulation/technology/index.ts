/**
 * Technology Research Engine — public surface.
 * Stage 04 implementation.
 */

export {
  MAX_RESEARCH_HISTORY,
  MAX_RESEARCH_PROJECTS,
  TECHNOLOGIES,
  TECHNOLOGY_CATEGORIES,
  createInitialTechnologyState,
  findResearchProject,
  getTechnologyDefinition,
  isValidTechnologyDefinition,
  isValidTechnologyState,
} from './technologyState';
export type {
  ResearchHistoryEntry,
  ResearchProject,
  ResearchProjectStatus,
  TechnologyCategory,
  TechnologyDefinition,
  TechnologyEffects,
  TechnologyId,
  TechnologyState,
  TechnologyStatus,
} from './technologyState';

export {
  advanceResearch,
  canStartResearch,
  cancelResearch,
  getEmployeeContribution,
  getMissingPrerequisites,
  getResearchContribution,
  getTechnologiesByCategory,
  getTechnologyStatus,
  getUnlockedEffects,
  startResearch,
} from './technologyRules';
export type { ResearchContext, StartResearchInput } from './technologyRules';
