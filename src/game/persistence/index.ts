/**
 * Save & Archive Engine �?" public surface.
 */

import { simulation } from '@/game/simulationRunner';
import { SaveService } from './saveService';

export { SaveService } from './saveService';
export { SaveError } from './saveErrors';
export type { SaveErrorCode } from './saveErrors';
export { createRepository } from './saveRepository';
export type { SaveRepository } from './saveRepository';
export {
  AUTOSAVE_SLOT_ID,
  DEFAULT_AUTOSAVE_INTERVAL_SIM_MS,
  DEFAULT_MAX_SAVE_SLOTS,
  SAVE_FORMAT_VERSION,
} from './saveTypes';
export type {
  AutosaveConfig,
  LoadOperationResult,
  PersistedClockState,
  PersistedSimulationMeta,
  PersistedSimulationState,
  SaveArchive,
  SaveMetadata,
  SaveOperationResult,
  SavePayload,
  SaveRecord,
  SaveSlotInfo,
  SaveSlotKind,
  SaveStatus,
} from './saveTypes';
export { buildSavePayload, applyPersistedState, capturePersistedState } from './saveSerialization';
export { validatePayload, validateSaveRecord, validateArchive } from './saveValidation';
export { migratePayload } from './saveMigration';
export { computeChecksum, verifyChecksum, stableStringify } from './saveIntegrity';
export { exportArchive, importArchive, parseArchive, stringifyArchive } from './saveBackup';
export { getDatabase, isDatabaseAvailable, resetDatabaseForTests, SAVE_DB_NAME, SAVE_DB_VERSION } from './database';

/**
 * The application-wide save service, bound to the singleton simulation runner.
 */
export const saveService = new SaveService({ runner: simulation });
saveService.attachToEngine(simulation.getEngine());