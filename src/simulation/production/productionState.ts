/**
 * Production Engine — data model.
 *
 * Facilities are abstract corporate assets in Stage 04 — there is no city
 * engine yet, they are not rendered anywhere.
 */

import { isFiniteNumber } from '@/core/utils';
import type { ResourceRequirement } from '@/simulation/contracts';
import type { ProductCategory } from '@/simulation/products';

export type FacilityType =
  | 'electronics-factory'
  | 'materials-plant'
  | 'energy-facility'
  | 'assembly-facility';

export interface FacilityDefinition {
  type: FacilityType;
  name: string;
  /** Product categories the facility is able to manufacture. */
  capabilities: ProductCategory[];
  /** Units produced per batch at efficiency 1. */
  capacity: number;
  /** Operating cost per simulated hour. */
  operatingCost: number;
  /** Construction cost charged when the facility is built. */
  constructionCost: number;
}

export const FACILITY_DEFINITIONS: readonly FacilityDefinition[] = [
  {
    type: 'electronics-factory',
    name: 'Electronics Factory',
    capabilities: ['computing', 'automation'],
    capacity: 40,
    operatingCost: 60,
    constructionCost: 5_000,
  },
  {
    type: 'materials-plant',
    name: 'Materials Processing Plant',
    capabilities: ['industrial'],
    capacity: 60,
    operatingCost: 45,
    constructionCost: 4_000,
  },
  {
    type: 'energy-facility',
    name: 'Energy Facility',
    capabilities: ['energy'],
    capacity: 30,
    operatingCost: 80,
    constructionCost: 6_500,
  },
  {
    type: 'assembly-facility',
    name: 'Assembly Facility',
    capabilities: ['computing', 'industrial', 'energy', 'automation', 'software'],
    capacity: 50,
    operatingCost: 55,
    constructionCost: 7_500,
  },
];

export type FacilityStatus = 'idle' | 'producing' | 'offline';

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  /** Units produced per batch at efficiency 1. */
  capacity: number;
  /** Base efficiency multiplier, 0.5 .. 2. */
  efficiency: number;
  /** Operating cost per simulated hour. */
  operatingCost: number;
  assignedEmployeeIds: string[];
  status: FacilityStatus;
  /** Ids of the production orders assigned to this facility. */
  queue: string[];
}

export type ProductionOrderStatus = 'queued' | 'running' | 'completed' | 'cancelled';

export interface ProductionOrder {
  id: string;
  productInstanceId: string;
  productDefinitionId: string;
  facilityId: string;
  quantity: number;
  produced: number;
  /** Completion between 0 and 1. */
  progress: number;
  status: ProductionOrderStatus;
  /** Resources reserved for this order. */
  reservedResources: ResourceRequirement;
  /** Operating cost charged when the order was created. */
  operatingCost: number;
  startedAtSimMs: number;
  completedAtSimMs: number | null;
}

export interface ProductionState {
  facilities: Facility[];
  orders: ProductionOrder[];
  sequence: number;
  tick: number;
}

/** Maximum number of production orders kept (finished ones are dropped). */
export const MAX_PRODUCTION_ORDERS = 24;
/** A single order may not exceed this multiple of the facility capacity. */
export const MAX_BATCH_MULTIPLE = 5;
/** Maximum efficiency bonus granted by the assigned workforce. */
export const MAX_WORKFORCE_EFFICIENCY_BONUS = 0.5;
/** Efficiency granted per point of assigned employee productivity. */
export const WORKFORCE_EFFICIENCY_PER_PRODUCTIVITY = 0.002;

export function createInitialProductionState(): ProductionState {
  return {
    facilities: [],
    orders: [],
    sequence: 0,
    tick: 0,
  };
}

export function getFacilityDefinition(type: FacilityType): FacilityDefinition | undefined {
  return FACILITY_DEFINITIONS.find((definition) => definition.type === type);
}

export function findFacility(
  state: ProductionState,
  id: string,
): Facility | undefined {
  return state.facilities.find((facility) => facility.id === id);
}

export function findProductionOrder(
  state: ProductionState,
  id: string,
): ProductionOrder | undefined {
  return state.orders.find((order) => order.id === id);
}

/**
 * Whether a facility may manufacture a product category.
 */
export function facilitySupports(
  type: FacilityType,
  category: ProductCategory,
): boolean {
  const definition = getFacilityDefinition(type);
  return definition ? definition.capabilities.includes(category) : false;
}

export function isValidProductionState(state: ProductionState): boolean {
  if (!state || !Array.isArray(state.facilities)) return false;
  if (!Array.isArray(state.orders)) return false;
  if (state.orders.length > MAX_PRODUCTION_ORDERS) return false;
  if (!isFiniteNumber(state.sequence) || state.sequence < 0) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;

  const facilityIds = new Set<string>();
  for (const facility of state.facilities) {
    if (!facility || typeof facility.id !== 'string' || facility.id.length === 0) return false;
    if (facilityIds.has(facility.id)) return false;
    facilityIds.add(facility.id);
    if (!getFacilityDefinition(facility.type)) return false;
    if (!isFiniteNumber(facility.capacity) || facility.capacity <= 0) return false;
    if (!isFiniteNumber(facility.efficiency) || facility.efficiency <= 0) return false;
    if (!isFiniteNumber(facility.operatingCost) || facility.operatingCost < 0) return false;
    if (!Array.isArray(facility.assignedEmployeeIds)) return false;
    if (!['idle', 'producing', 'offline'].includes(facility.status)) return false;
  }

  const orderIds = new Set<string>();
  for (const order of state.orders) {
    if (!order || typeof order.id !== 'string' || order.id.length === 0) return false;
    if (orderIds.has(order.id)) return false;
    orderIds.add(order.id);
    if (!isFiniteNumber(order.quantity) || order.quantity <= 0) return false;
    if (!isFiniteNumber(order.produced) || order.produced < 0) return false;
    if (!isFiniteNumber(order.progress) || order.progress < 0 || order.progress > 1) return false;
    if (!isFiniteNumber(order.operatingCost) || order.operatingCost < 0) return false;
    if (!['queued', 'running', 'completed', 'cancelled'].includes(order.status)) return false;
  }

  return true;
}
