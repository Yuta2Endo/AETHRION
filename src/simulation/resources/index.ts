/**
 * Resource & Supply Chain — public surface.
 * Stage 04 implementation.
 */

export {
  MAX_RESOURCE_TRANSACTIONS,
  RESOURCES,
  createInitialResourceState,
  findResourceBalance,
  getResourceDefinition,
  isValidResourceState,
  normalizeRequirement,
} from './resourceState';
export type {
  ResourceBalance,
  ResourceCategory,
  ResourceDefinition,
  ResourceState,
  ResourceTransaction,
  ResourceTransactionType,
} from './resourceState';

export {
  addResource,
  advanceResources,
  consumeResources,
  getAvailableQuantity,
  getRequirementCost,
  getResourcePrices,
  getResourceUnitPrice,
  purchaseResource,
  releaseResources,
  removeResource,
  reserveResources,
} from './resourceRules';
