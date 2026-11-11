/**
 * Corporation Engine — public surface.
 * Stage 03 implementation.
 */

export {
  CORPORATION_TIERS,
  INITIAL_CORPORATION_BALANCE,
  INITIAL_CORPORATION_REPUTATION,
  MAX_FINANCIAL_HISTORY,
  MAX_TRANSACTIONS,
  createInitialCorporationState,
  findCorporation,
  getCorporationTier,
  getPlayerCorporation,
  isValidCorporation,
  isValidCorporationState,
} from './corporationState';
export type {
  Corporation,
  CorporationFinances,
  CorporationId,
  CorporationState,
  CorporationStatus,
  CorporationTier,
  CorporationTierId,
  CorporationTransaction,
  FinancialSnapshot,
  TransactionType,
} from './corporationState';

export {
  BASE_OPERATING_COST_PER_HOUR,
  HIRING_FLAT_FEE,
  MAX_CORPORATION_NAME_LENGTH,
  MIN_CORPORATION_NAME_LENGTH,
  OPERATING_COST_PER_EMPLOYEE_PER_HOUR,
  REPUTATION_DRIFT,
  REPUTATION_PROFIT_UNIT,
  REPUTATION_REVENUE_UNIT,
  REVENUE_PER_PRODUCTIVITY_POINT,
  accrueFinances,
  applyTransaction,
  closeFinancialPeriod,
  createCorporation,
  createInitialFinances,
  getCorporationStatistics,
  getNetProfit,
  getPeriodNetProfit,
  isValidCorporationName,
  resolveStatus,
  resolveTier,
  updateProgression,
} from './corporationRules';
export type {
  CorporationContext,
  CorporationStatistics,
  CreateCorporationInput,
  TransactionInput,
  WorkforceMember,
} from './corporationRules';
