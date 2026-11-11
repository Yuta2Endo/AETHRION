/**
 * Rendering types.
 *
 * Shared, rendering-only types. The rendering layer never mutates the
 * simulation state — it only reads it and visualises it.
 */

import type { BuildingCategory, BuildingStatus, DistrictType, ZoningCategory } from '@/simulation/city';

export type SelectionKind = 'district' | 'plot' | 'building';

export interface DistrictSelection {
  kind: 'district';
  districtId: string;
}

export interface PlotSelection {
  kind: 'plot';
  plotId: string;
  districtId: string;
}

export interface BuildingSelection {
  kind: 'building';
  buildingId: string;
  plotId: string;
  districtId: string;
}

export type SceneSelection = DistrictSelection | PlotSelection | BuildingSelection;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlotLayout {
  plotId: string;
  districtId: string;
  index: number;
  position: Vec3;
  size: { width: number; depth: number };
}

export interface DistrictLayout {
  districtId: string;
  type: DistrictType;
  name: string;
  index: number;
  center: Vec3;
  size: { width: number; depth: number };
  plots: PlotLayout[];
}

export interface CityLayout {
  districts: DistrictLayout[];
  byDistrictId: Record<string, DistrictLayout>;
  byPlotId: Record<string, PlotLayout>;
}

export interface DistrictVisualState {
  id: string;
  name: string;
  type: DistrictType;
  development: number;
  plotCount: number;
  ownedPlots: number;
  occupiedPlots: number;
  buildingCount: number;
  operationalBuildingCount: number;
}

export interface PlotVisualState {
  id: string;
  districtId: string;
  districtType: DistrictType;
  zoning: ZoningCategory;
  status: 'available' | 'owned' | 'occupied' | 'sold';
  price: number;
  buildingId: string | null;
  infrastructureAvailable: boolean;
}

export interface BuildingVisualState {
  id: string;
  name: string;
  typeId: string;
  category: BuildingCategory;
  districtId: string;
  plotId: string;
  status: BuildingStatus;
  progress: number;
  workforceCapacity: number;
  operatingCostPerHour: number;
  infrastructureSatisfied: boolean;
}

export interface RenderQuality {
  /** Device pixel ratio cap. */
  pixelRatio: number;
  /** Enable antialiasing. */
  antialias: boolean;
  /** Enable shadow maps. */
  shadows: boolean;
}

export interface RenderingMetrics {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}