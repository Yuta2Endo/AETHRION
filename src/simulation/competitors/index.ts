/**
 * Competitor AI Engine module (Stage 01 placeholder).
 * Responsible for AI corporations and competitive behavior.
 * Typed interface only — no implementation in Stage 01.
 */

export interface Competitor {
  id: string;
  name: string;
  strength: number;
  aggressiveness: number;
}

export interface CompetitorsState {
  competitors: Competitor[];
}

export const defaultCompetitorsState: CompetitorsState = {
  competitors: [],
};

export function getCompetitorsState(): CompetitorsState {
  return { ...defaultCompetitorsState };
}
