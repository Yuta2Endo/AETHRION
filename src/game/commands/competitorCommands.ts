/**
 * Competitor commands — the player-facing view of the AI corporations.
 *
 * The AI decides on its own; the player may only **inspect** a corporation.
 * There is deliberately no command that lets the player steer the AI — that
 * would be a single-player cheat and it would break the illusion of an
 * independent economy.
 */

import type { AppError, Result } from '@/core/types';
import { useGameStore } from '@/game/state/gameStore';
import { findCompetitor, type Competitor } from '@/simulation/competitors';
import { failure } from './shared';

export interface GetCompetitorCommand {
  /** The identifier of the AI corporation. */
  competitorId: string;
}

/**
 * Returns the public record of an AI corporation.
 *
 * The command is read-only — it never changes the simulation state.
 */
export function getCompetitorCommand(input: GetCompetitorCommand): Result<Competitor, AppError> {
  const state = useGameStore.getState();
  const competitor = findCompetitor(state.competitors, input.competitorId);

  if (!competitor) {
    return failure(
      'COMPETITOR_NOT_FOUND',
      `No competitor with id "${input.competitorId}".`,
    );
  }

  return { ok: true, value: competitor };
}
