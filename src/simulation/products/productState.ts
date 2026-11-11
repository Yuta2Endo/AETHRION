/**
 * Product Development Engine — data model.
 *
 * A product *definition* is the blueprint (data driven table). A product
 * *instance* is the corporation's own development project of that blueprint.
 */

import { isFiniteNumber } from '@/core/utils';
import type { ResourceRequirement } from '@/simulation/contracts';
import type { TechnologyId } from '@/simulation/technology';

export type ProductCategory =
  | 'computing'
  | 'industrial'
  | 'energy'
  | 'automation'
  | 'software';

export type ProductDefinitionId = string;

export interface ProductDefinition {
  id: ProductDefinitionId;
  name: string;
  description: string;
  category: ProductCategory;
  /** Technology that must be unlocked before development can start. */
  requiresTechnology: TechnologyId;
  /** Development cost charged when the project starts. */
  developmentCost: number;
  /** Simulated milliseconds of work required at full contribution. */
  developmentDurationMs: number;
  /** Resources consumed per produced unit. */
  resourceCost: ResourceRequirement;
  /** Manufacturing complexity, 1..5. */
  complexity: number;
  /** Manufacturing cost per unit, excluding resources. */
  baseProductionCost: number;
  /** Reference market price per unit. */
  basePrice: number;
  /** Units sold per simulated hour at 100 % market activity. */
  baseDemand: number;
  /** Simulated time to produce `facilityCapacity` units at efficiency 1. */
  productionTimeMs: number;
}

const HOUR = 3_600_000;

export const PRODUCT_DEFINITIONS: readonly ProductDefinition[] = [
  {
    id: 'helix-workstation',
    name: 'Helix Workstation',
    description: 'A photonic compute station for heavy analytical work.',
    category: 'computing',
    requiresTechnology: 'photonic-cores',
    developmentCost: 9_000,
    developmentDurationMs: 48 * HOUR,
    resourceCost: { electronics: 1, components: 1 },
    complexity: 2,
    baseProductionCost: 180,
    basePrice: 900,
    baseDemand: 1.5,
    productionTimeMs: 12 * HOUR,
  },
  {
    id: 'nova-fabricator',
    name: 'Nova Fabricator',
    description: 'Precision industrial fabrication platform.',
    category: 'industrial',
    requiresTechnology: 'precision-fabrication',
    developmentCost: 11_000,
    developmentDurationMs: 56 * HOUR,
    resourceCost: { metals: 2, 'industrial-chemicals': 2 },
    complexity: 3,
    baseProductionCost: 240,
    basePrice: 1_100,
    baseDemand: 1,
    productionTimeMs: 16 * HOUR,
  },
  {
    id: 'arc-reactor',
    name: 'Arc Reactor',
    description: 'Compact helion power module for industrial sites.',
    category: 'energy',
    requiresTechnology: 'helion-fusion',
    developmentCost: 14_000,
    developmentDurationMs: 64 * HOUR,
    resourceCost: { energy: 6, 'advanced-materials': 1 },
    complexity: 4,
    baseProductionCost: 300,
    basePrice: 1_600,
    baseDemand: 0.8,
    productionTimeMs: 20 * HOUR,
  },
  {
    id: 'sentinel-automaton',
    name: 'Sentinel Automaton',
    description: 'Autonomous industrial guardian unit.',
    category: 'automation',
    requiresTechnology: 'robotic-assembly',
    developmentCost: 16_000,
    developmentDurationMs: 72 * HOUR,
    resourceCost: { components: 3, electronics: 2, metals: 2 },
    complexity: 4,
    baseProductionCost: 380,
    basePrice: 2_400,
    baseDemand: 0.6,
    productionTimeMs: 24 * HOUR,
  },
  {
    id: 'oracle-suite',
    name: 'Oracle Suite',
    description: 'Adaptive forecasting software sold as a licence.',
    category: 'software',
    requiresTechnology: 'neural-array',
    developmentCost: 12_000,
    developmentDurationMs: 60 * HOUR,
    resourceCost: { 'research-data': 2, electronics: 1 },
    complexity: 3,
    baseProductionCost: 120,
    basePrice: 900,
    baseDemand: 2,
    productionTimeMs: 10 * HOUR,
  },
  {
    id: 'atlas-forge',
    name: 'Atlas Forge',
    description: 'Molecular-scale industrial forge for advanced alloys.',
    category: 'industrial',
    requiresTechnology: 'molecular-assembly',
    developmentCost: 22_000,
    developmentDurationMs: 90 * HOUR,
    resourceCost: { 'advanced-materials': 2, metals: 4 },
    complexity: 5,
    baseProductionCost: 420,
    basePrice: 2_600,
    baseDemand: 0.5,
    productionTimeMs: 28 * HOUR,
  },
];

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'computing',
  'industrial',
  'energy',
  'automation',
  'software',
];

export type ProductStatus = 'developing' | 'ready' | 'retired';

export interface ProductInstance {
  id: string;
  definitionId: ProductDefinitionId;
  name: string;
  status: ProductStatus;
  /** Development completion between 0 and 1. */
  progress: number;
  /** Product quality, 0..100. */
  quality: number;
  /** Innovation rating, 0..100. */
  innovation: number;
  /** Market readiness, 0..100. */
  marketReadiness: number;
  assignedEmployeeIds: string[];
  /** Development cost already charged. */
  costPaid: number;
  createdAtSimMs: number;
  completedAtSimMs: number | null;
  /** Current market price per unit. */
  price: number;
  /** Whether the product is offered on the market. */
  salesActive: boolean;
  /** Finished units currently in stock. */
  inventory: number;
  /** Lifetime units sold. */
  unitsSold: number;
  /** Lifetime sales revenue. */
  revenue: number;
}

export interface ProductState {
  instances: ProductInstance[];
  sequence: number;
  tick: number;
}

export function createInitialProductState(): ProductState {
  return {
    instances: [],
    sequence: 0,
    tick: 0,
  };
}

export function getProductDefinition(
  id: ProductDefinitionId,
): ProductDefinition | undefined {
  return PRODUCT_DEFINITIONS.find((definition) => definition.id === id);
}

export function findProductInstance(
  state: ProductState,
  id: string,
): ProductInstance | undefined {
  return state.instances.find((instance) => instance.id === id);
}

export function isValidProductDefinition(definition: ProductDefinition): boolean {
  if (!definition || typeof definition.id !== 'string' || definition.id.length === 0) return false;
  if (typeof definition.name !== 'string' || definition.name.length === 0) return false;
  if (!PRODUCT_CATEGORIES.includes(definition.category)) return false;
  if (!isFiniteNumber(definition.developmentCost) || definition.developmentCost <= 0) return false;
  if (!isFiniteNumber(definition.developmentDurationMs) || definition.developmentDurationMs <= 0) {
    return false;
  }
  if (!isFiniteNumber(definition.complexity) || definition.complexity < 1) return false;
  if (!isFiniteNumber(definition.baseProductionCost) || definition.baseProductionCost < 0) {
    return false;
  }
  if (!isFiniteNumber(definition.basePrice) || definition.basePrice <= 0) return false;
  if (!isFiniteNumber(definition.baseDemand) || definition.baseDemand <= 0) return false;
  if (!isFiniteNumber(definition.productionTimeMs) || definition.productionTimeMs <= 0) {
    return false;
  }
  return true;
}

export function isValidProductState(state: ProductState): boolean {
  if (!state || !Array.isArray(state.instances)) return false;
  if (!isFiniteNumber(state.sequence) || state.sequence < 0) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;

  const ids = new Set<string>();
  for (const instance of state.instances) {
    if (!instance || typeof instance.id !== 'string' || instance.id.length === 0) return false;
    if (ids.has(instance.id)) return false;
    ids.add(instance.id);
    if (!getProductDefinition(instance.definitionId)) return false;
    if (!isFiniteNumber(instance.progress) || instance.progress < 0 || instance.progress > 1) {
      return false;
    }
    if (!isFiniteNumber(instance.quality) || instance.quality < 0 || instance.quality > 100) {
      return false;
    }
    if (!isFiniteNumber(instance.innovation) || instance.innovation < 0) return false;
    if (!isFiniteNumber(instance.marketReadiness) || instance.marketReadiness < 0) return false;
    if (!isFiniteNumber(instance.costPaid) || instance.costPaid < 0) return false;
    if (!isFiniteNumber(instance.price) || instance.price < 0) return false;
    if (!isFiniteNumber(instance.inventory) || instance.inventory < 0) return false;
    if (!isFiniteNumber(instance.unitsSold) || instance.unitsSold < 0) return false;
    if (!isFiniteNumber(instance.revenue) || instance.revenue < 0) return false;
    if (!['developing', 'ready', 'retired'].includes(instance.status)) return false;
  }

  return true;
}
