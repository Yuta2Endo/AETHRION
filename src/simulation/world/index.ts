/**
 * World Engine module (Stage 01 placeholder).
 * Responsible for global regions, map, and world state evolution.
 * Typed interface only — no implementation in Stage 01.
 */

export interface WorldRegion {
  id: string;
  name: string;
  level: number;
  influence: number;
}

export interface WorldState {
  regions: WorldRegion[];
  activeRegionId: string | null;
}

export const defaultWorldState: WorldState = {
  regions: [],
  activeRegionId: null,
};

export function getWorldInfo(): WorldState {
  return { ...defaultWorldState };
}
