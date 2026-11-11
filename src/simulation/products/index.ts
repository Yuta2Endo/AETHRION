/**
 * Product Development Engine — public surface.
 * Stage 04 implementation.
 */

export {
  PRODUCT_CATEGORIES,
  PRODUCT_DEFINITIONS,
  createInitialProductState,
  findProductInstance,
  getProductDefinition,
  isValidProductDefinition,
  isValidProductState,
} from './productState';
export type {
  ProductCategory,
  ProductDefinition,
  ProductDefinitionId,
  ProductInstance,
  ProductState,
  ProductStatus,
} from './productState';

export {
  BASE_PRODUCT_QUALITY,
  QUALITY_COMPLEXITY_PENALTY,
  QUALITY_EFFORT_BONUS,
  QUALITY_SKILL_WEIGHT,
  advanceDevelopment,
  assignDevelopmentEmployees,
  calculateInnovation,
  calculateMarketReadiness,
  calculateQuality,
  canStartDevelopment,
  getDevelopmentContribution,
  getEmployeeContribution,
  getTechnologyDepth,
  setProductPrice,
  setProductSalesActive,
  startDevelopment,
} from './productRules';
export type { ProductContext, StartDevelopmentInput } from './productRules';
