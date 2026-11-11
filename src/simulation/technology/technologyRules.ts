/**
 * Technology Research Engine — deterministic rules.
 *
 * Research progress is driven by the *current* workforce: the skill,
 * productivity and profession of the assigned employees determine how fast a
 * technology is unlocked. Nothing here depends on React or the wall clock.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { clamp, isFiniteNumber, roundTo } from '@/core/utils';
import type { Employee } from '@/simulation/employees';
import {
  MAX_RESEARCH_HISTORY,
  MAX_RESEARCH_PROJECTS,
  TECHNOLOGIES,
  getTechnologyDefinition,
  isValidTechnologyState,
  type ResearchProject,
  type TechnologyDefinition,
  type TechnologyEffects,
  type TechnologyId,
  type TechnologyState,
  type TechnologyStatus,
} from './technologyState';

export interface ResearchContext {
  tick: number;
  /** Simulated milliseconds advanced by this tick. */
  deltaMs: number;
  /** Simulated time the research is recorded at. */
  simTimeMs: number;
  /**
   * The research speed modifier of the active global events (Stage 06).
   *
   * Optional: when it is absent the research behaves exactly as in Stage 04.
   */
  eventResearchSpeed?: number;
}

/**
 * Aggregated effects of every unlocked technology.
 * Multipliers are multiplied together, quality bonuses are summed.
 */
export function getUnlockedEffects(state: TechnologyState): TechnologyEffects {
  const effects: TechnologyEffects = {
    productionEfficiency: 1,
    researchSpeed: 1,
    qualityBonus: 0,
    marketReach: 1,
    resourceYield: 1,
  };

  for (const id of state.unlocked) {
    const definition = getTechnologyDefinition(id);
    if (!definition) continue;
    const unlock = definition.effects;
    if (unlock.productionEfficiency !== undefined) {
      effects.productionEfficiency! *= unlock.productionEfficiency;
    }
    if (unlock.researchSpeed !== undefined) {
      effects.researchSpeed! *= unlock.researchSpeed;
    }
    if (unlock.qualityBonus !== undefined) {
      effects.qualityBonus! += unlock.qualityBonus;
    }
    if (unlock.marketReach !== undefined) {
      effects.marketReach! *= unlock.marketReach;
    }
    if (unlock.resourceYield !== undefined) {
      effects.resourceYield! *= unlock.resourceYield;
    }
  }

  return effects;
}

/**
 * Status of a technology with respect to the current research state.
 */
export function getTechnologyStatus(
  state: TechnologyState,
  definition: TechnologyDefinition,
  corporationTierId?: string,
): TechnologyStatus {
  if (state.unlocked.includes(definition.id)) return 'completed';
  if (state.projects.some((p) => p.technologyId === definition.id && p.status === 'active')) {
    return 'researching';
  }

  const prerequisitesMet = definition.requires.every((id) => state.unlocked.includes(id));
  if (!prerequisitesMet) return 'locked';

  if (definition.requiresTier !== undefined && corporationTierId !== undefined) {
    if (definition.requiresTier !== corporationTierId) {
      // The tier gate is checked precisely in canStartResearch; here it only
      // marks the technology as not yet available.
      return 'locked';
    }
  }

  return 'available';
}

/**
 * The technologies that are still missing for a definition.
 */
export function getMissingPrerequisites(
  state: TechnologyState,
  definition: TechnologyDefinition,
): TechnologyId[] {
  return definition.requires.filter((id) => !state.unlocked.includes(id));
}

/**
 * Contribution of a single employee to a research project.
 *
 * - A matching profession contributes fully, a different profession at 40 %.
 * - The skill factor is the ratio between the employee skill and the skill the
 *   technology requires (capped at 100 %).
 * - The productivity factor scales the contribution.
 */
export function getEmployeeContribution(
  definition: TechnologyDefinition,
  employee: Employee,
): number {
  if (employee.status === 'departed') return 0;

  const professionFactor =
    definition.requiredProfession !== undefined &&
    employee.profession !== definition.requiredProfession
      ? 0.4
      : 1;

  const reference = definition.requiredSkill ?? 100;
  const skillFactor = reference > 0 ? clamp(employee.skill / reference, 0, 1) : 0;
  const productivityFactor = clamp(employee.productivity / 100, 0, 1);

  return professionFactor * skillFactor * productivityFactor;
}

/**
 * Total contribution of the assigned workforce to a technology.
 */
export function getResearchContribution(
  definition: TechnologyDefinition,
  employees: readonly Employee[],
  assignedEmployeeIds: readonly string[],
): number {
  let contribution = 0;
  for (const id of assignedEmployeeIds) {
    const employee = employees.find((candidate) => candidate.id === id);
    if (!employee) continue;
    contribution += getEmployeeContribution(definition, employee);
  }
  return contribution;
}

/**
 * Validates that a research project may be started.
 */
export function canStartResearch(
  state: TechnologyState,
  definition: TechnologyDefinition,
  corporationTierId: string | undefined,
): Result<void, AppError> {
  const fail = (code: string, message: string): Result<void, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  if (!isValidTechnologyState(state)) {
    return fail('TECHNOLOGY_INVALID_STATE', 'The research state is invalid.');
  }
  if (state.unlocked.includes(definition.id)) {
    return fail('TECHNOLOGY_ALREADY_UNLOCKED', `${definition.name} is already unlocked.`);
  }
  if (state.projects.some((p) => p.technologyId === definition.id && p.status === 'active')) {
    return fail(
      'TECHNOLOGY_RESEARCH_ACTIVE',
      `${definition.name} is already being researched.`,
    );
  }

  const missing = getMissingPrerequisites(state, definition);
  if (missing.length > 0) {
    return fail(
      'TECHNOLOGY_MISSING_PREREQUISITE',
      `${definition.name} requires ${missing.join(', ')}.`,
    );
  }

  if (definition.requiresTier !== undefined && definition.requiresTier !== corporationTierId) {
    return fail(
      'TECHNOLOGY_TIER_REQUIRED',
      `${definition.name} requires the ${definition.requiresTier} tier.`,
    );
  }

  if (!isFiniteNumber(definition.researchCost) || definition.researchCost <= 0) {
    return fail('TECHNOLOGY_INVALID_COST', 'The research cost is invalid.');
  }
  if (!isFiniteNumber(definition.researchDurationMs) || definition.researchDurationMs <= 0) {
    return fail('TECHNOLOGY_INVALID_DURATION', 'The research duration is invalid.');
  }

  return { ok: true, value: undefined };
}

export interface StartResearchInput {
  technologyId: TechnologyId;
  assignedEmployeeIds: string[];
  /** Simulated time the project starts at. */
  startedAtSimMs: number;
  corporationTierId: string | undefined;
}

/**
 * Starts a research project.
 */
export function startResearch(
  state: TechnologyState,
  input: StartResearchInput,
): Result<{ project: ResearchProject; state: TechnologyState }, AppError> {
  const fail = (
    code: string,
    message: string,
  ): Result<{ project: ResearchProject; state: TechnologyState }, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  const definition = getTechnologyDefinition(input.technologyId);
  if (!definition) {
    return fail('TECHNOLOGY_UNKNOWN', `Unknown technology "${input.technologyId}".`);
  }

  const allowed = canStartResearch(state, definition, input.corporationTierId);
  if (!allowed.ok) return allowed;

  const unique = new Set(input.assignedEmployeeIds);
  if (unique.size !== input.assignedEmployeeIds.length) {
    return fail('TECHNOLOGY_DUPLICATE_ASSIGNMENT', 'An employee is assigned twice.');
  }

  const sequence = state.sequence + 1;
  const project: ResearchProject = {
    id: `res_${String(sequence).padStart(4, '0')}`,
    technologyId: definition.id,
    status: 'active',
    progress: 0,
    assignedEmployeeIds: [...input.assignedEmployeeIds],
    costPaid: definition.researchCost,
    startedAtSimMs: input.startedAtSimMs,
    completedAtSimMs: null,
  };

  const projects = [...state.projects, project].slice(-MAX_RESEARCH_PROJECTS);

  return {
    ok: true,
    value: {
      project,
      state: { ...state, projects, sequence },
    },
  };
}

/**
 * Cancels an active research project. The research cost is not refunded —
 * the spent funds are recorded as a sunk cost.
 */
export function cancelResearch(
  state: TechnologyState,
  projectId: string,
  simTimeMs: number,
): Result<{ project: ResearchProject; state: TechnologyState }, AppError> {
  const fail = (
    code: string,
    message: string,
  ): Result<{ project: ResearchProject; state: TechnologyState }, AppError> => ({
    ok: false,
    error: { code, message, fatal: false, context: {}, timestamp: Date.now() },
  });

  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    return fail('RESEARCH_PROJECT_NOT_FOUND', `No research project with id "${projectId}".`);
  }
  if (project.status !== 'active') {
    return fail('RESEARCH_PROJECT_NOT_ACTIVE', 'The research project is not active.');
  }

  const cancelled: ResearchProject = {
    ...project,
    status: 'cancelled',
    completedAtSimMs: simTimeMs,
  };

  const history = [
    ...state.history,
    {
      technologyId: project.technologyId,
      projectId: project.id,
      outcome: 'cancelled' as const,
      simTimeMs,
      employeeIds: project.assignedEmployeeIds,
    },
  ].slice(-MAX_RESEARCH_HISTORY);

  return {
    ok: true,
    value: {
      project: cancelled,
      state: {
        ...state,
        projects: state.projects.map((candidate) =>
          candidate.id === projectId ? cancelled : candidate,
        ),
        history,
      },
    },
  };
}

/**
 * Advances every active research project by the elapsed simulated time.
 */
export function advanceResearch(
  state: TechnologyState,
  context: ResearchContext,
  employees: readonly Employee[],
): TechnologyState {
  if (!isValidTechnologyState(state)) {
    logger.error('Technology Engine rejected an invalid research state — state left unchanged');
    return state;
  }
  if (!isFiniteNumber(context.deltaMs) || context.deltaMs < 0) {
    logger.error('Technology Engine rejected an invalid tick context — state left unchanged');
    return state;
  }

  const speedMultiplier =
    (getUnlockedEffects(state).researchSpeed ?? 1) *
    clamp(context.eventResearchSpeed ?? 1, 0.5, 2);
  const unlocked = [...state.unlocked];
  const history = [...state.history];

  const projects = state.projects.map((project) => {
    if (project.status !== 'active') return project;

    const definition = getTechnologyDefinition(project.technologyId);
    if (!definition) return project;

    const contribution = getResearchContribution(
      definition,
      employees,
      project.assignedEmployeeIds,
    );

    if (contribution <= 0) {
      // No effective workforce assigned — the project makes no progress.
      return project;
    }

    const progressDelta =
      (contribution * context.deltaMs * speedMultiplier) / definition.researchDurationMs;
    const progress = clamp(roundTo(project.progress + progressDelta, 6), 0, 1);

    if (progress >= 1) {
      if (!unlocked.includes(definition.id)) {
        unlocked.push(definition.id);
      }
      history.push({
        technologyId: definition.id,
        projectId: project.id,
        outcome: 'completed',
        simTimeMs: context.simTimeMs,
        employeeIds: project.assignedEmployeeIds,
      });
      return {
        ...project,
        progress: 1,
        status: 'completed' as const,
        completedAtSimMs: context.simTimeMs,
      };
    }

    return { ...project, progress };
  });

  return {
    ...state,
    unlocked,
    projects,
    history: history.slice(-MAX_RESEARCH_HISTORY),
    tick: state.tick + 1,
  };
}

/**
 * Technologies grouped by category, for the interface.
 */
export function getTechnologiesByCategory(): Record<string, TechnologyDefinition[]> {
  const grouped: Record<string, TechnologyDefinition[]> = {};
  for (const definition of TECHNOLOGIES) {
    const bucket = grouped[definition.category] ?? [];
    bucket.push(definition);
    grouped[definition.category] = bucket;
  }
  return grouped;
}
