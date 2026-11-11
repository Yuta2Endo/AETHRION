/**
 * Technology research commands.
 */

import { logger } from '@/core/logging/logger';
import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import {
  cancelResearch,
  getTechnologyDefinition,
  startResearch,
  type ResearchProject,
} from '@/simulation/technology';
import {
  chargeCorporation,
  failure,
  logCommandRejection,
  requireCorporation,
  storeCorporation,
  validateEmployeeAssignment,
} from './shared';

export interface StartResearchCommand {
  technologyId: string;
  /** Employees assigned to the research project. */
  employeeIds: string[];
}

/**
 * Starts a research project and charges the research cost.
 */
export function startResearchCommand(
  input: StartResearchCommand,
): Result<ResearchProject, AppError> {
  const store = useGameStore.getState();

  const corporationResult = requireCorporation();
  if (!corporationResult.ok) return corporationResult;
  const corporation = corporationResult.value;

  const definition = getTechnologyDefinition(input.technologyId);
  if (!definition) {
    return failure('TECHNOLOGY_UNKNOWN', `Unknown technology "${input.technologyId}".`);
  }

  const assignment = validateEmployeeAssignment(input.employeeIds, store.employees.employees);
  if (!assignment.ok) {
    logCommandRejection('startResearch', assignment.error);
    return assignment;
  }

  const started = startResearch(store.technology, {
    technologyId: input.technologyId,
    assignedEmployeeIds: input.employeeIds,
    startedAtSimMs: store.simulation.simTimeMs,
    corporationTierId: corporation.tierId,
  });

  if (!started.ok) {
    logCommandRejection('startResearch', started.error);
    return started;
  }

  const charged = chargeCorporation(corporation, {
    type: 'research',
    amount: -definition.researchCost,
    description: `Research — ${definition.name}`,
    simTimeMs: store.simulation.simTimeMs,
  });

  if (!charged.ok) {
    logCommandRejection('startResearch', charged.error);
    return charged;
  }

  storeCorporation(charged.value);
  store.applyTechnologyState(started.value.state);

  logger.info('Research started', {
    technologyId: definition.id,
    cost: definition.researchCost,
  });

  return { ok: true, value: started.value.project };
}

/**
 * Cancels a running research project. The research cost is not refunded.
 */
export function cancelResearchCommand(projectId: string): Result<ResearchProject, AppError> {
  const store = useGameStore.getState();

  const cancelled = cancelResearch(store.technology, projectId, store.simulation.simTimeMs);
  if (!cancelled.ok) {
    logCommandRejection('cancelResearch', cancelled.error);
    return cancelled;
  }

  store.applyTechnologyState(cancelled.value.state);
  logger.info('Research cancelled', { projectId });
  return { ok: true, value: cancelled.value.project };
}
