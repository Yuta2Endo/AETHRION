/**
 * Technology Engine module (Stage 01 placeholder).
 * Responsible for technology tree, research, and unlocks.
 * Typed interface only — no implementation in Stage 01.
 */

export interface Technology {
  id: string;
  name: string;
  level: number;
  unlocked: boolean;
}

export interface TechnologyState {
  technologies: Technology[];
}

export const defaultTechnologyState: TechnologyState = {
  technologies: [],
};

export function getTechnologyState(): TechnologyState {
  return { ...defaultTechnologyState };
}
