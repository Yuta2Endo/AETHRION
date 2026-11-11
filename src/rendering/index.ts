/**
 * Rendering Engine — public surface.
 *
 * Three.js is responsible for rendering only. The rendering layer must never
 * mutate authoritative simulation state or contain gameplay rules.
 */

export { WorldRenderer } from './core/WorldRenderer';
export type { WorldRendererOptions, FocusTarget } from './core/WorldRenderer';
export { CityWorld } from './city/CityWorld';
export { buildCityLayout, getDistrictWorldPosition, getPlotWorldPosition } from './adapters/cityLayout';
export { buildCityVisualModel, toBuildingVisualState, toDistrictVisualState, toPlotVisualState } from './adapters/cityAdapter';
export { detectRenderQuality, isWebGLAvailable } from './core/quality';
export type { CityLayout, DistrictLayout, PlotLayout, SceneSelection, SelectionKind } from './types';

// Legacy Stage 01 exports (kept for compatibility).
export { WorldScene } from './three/scenes/WorldScene';
export { createPerspectiveCamera } from './three/cameras/PerspectiveCamera';
export { createGridHelper, createEmptyObject } from './three/objects';
export { createNeonMaterial, createEmpireMaterial } from './three/materials';
export { createAmbientLight, createNeonPointLight } from './three/lighting';