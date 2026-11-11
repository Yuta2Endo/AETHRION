/**
 * Corporation Engine module (Stage 01 placeholder).
 * Responsible for corporations, employees, hiring, and corporate structure.
 * Typed interface only — no implementation in Stage 01.
 */

export interface Corporation {
  id: string;
  name: string;
  tier: number;
  revenue: number;
}

export interface CorporationState {
  corporations: Corporation[];
  playerCorporationId: string | null;
}

export const defaultCorporationState: CorporationState = {
  corporations: [],
  playerCorporationId: null,
};

export function getCorporationState(): CorporationState {
  return { ...defaultCorporationState };
}
