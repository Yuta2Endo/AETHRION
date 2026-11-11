/**
 * Production Engine — public surface.
 * Stage 04 implementation.
 */

export {
  FACILITY_DEFINITIONS,
  MAX_BATCH_MULTIPLE,
  MAX_PRODUCTION_ORDERS,
  MAX_WORKFORCE_EFFICIENCY_BONUS,
  WORKFORCE_EFFICIENCY_PER_PRODUCTIVITY,
  createInitialProductionState,
  facilitySupports,
  findFacility,
  findProductionOrder,
  getFacilityDefinition,
  isValidProductionState,
} from './productionState';
export type {
  Facility,
  FacilityDefinition,
  FacilityStatus,
  FacilityType,
  ProductionOrder,
  ProductionOrderStatus,
  ProductionState,
} from './productionState';

export {
  advanceProduction,
  assignFacilityEmployees,
  cancelProduction,
  createFacility,
  getEffectiveEfficiency,
  getOrderResourceRequirement,
  getProductionDurationMs,
  getTotalCapacity,
  startProduction,
  unassignFacilityEmployee,
} from './productionRules';
export type { CreateFacilityInput, ProductionContext, StartProductionInput } from './productionRules';
