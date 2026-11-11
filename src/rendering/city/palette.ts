import type { BuildingCategory, BuildingStatus, DistrictType } from '@/simulation/city';

export const DISTRICT_COLORS: Record<DistrictType, number> = {
  commercial: 0x00d9ff,
  industrial: 0xf59e0b,
  research: 0xa855f7,
  residential: 0x22c55e,
  energy: 0x38bdf8,
};

export const DISTRICT_GROUND_COLORS: Record<DistrictType, number> = {
  commercial: 0x0b2230,
  industrial: 0x241a0a,
  research: 0x1d1030,
  residential: 0x0f2318,
  energy: 0x0b1f2e,
};

export const CATEGORY_COLORS: Record<BuildingCategory, number> = {
  corporate: 0x00d9ff,
  industrial: 0xf59e0b,
  research: 0xa855f7,
  residential: 0x22c55e,
  infrastructure: 0x38bdf8,
};

export function buildingHeight(category: BuildingCategory, status: BuildingStatus): number {
  const base: Record<BuildingCategory, number> = {
    corporate: 2.8,
    industrial: 1.8,
    research: 2.2,
    residential: 2.0,
    infrastructure: 1.4,
  };

  const height = base[category];
  if (status === 'planned' || status === 'constructing') return Math.max(0.4, height * 0.35);
  if (status === 'suspended') return height * 0.9;
  return height;
}

export function statusOpacity(status: BuildingStatus, infrastructureSatisfied: boolean): number {
  if (status === 'suspended') return 0.45;
  if (status === 'completed') return 0.7;
  if (status === 'operational' && !infrastructureSatisfied) return 0.75;
  return 0.95;
}