/**
 * Save migrations.
 *
 * Migrations transform an older save payload into the current format. They are
 * sequential, typed and validated before and after — the original stored record
 * is never mutated.
 */

import { SaveError } from './saveErrors';
import { SAVE_FORMAT_VERSION, type SavePayload } from './saveTypes';
import { validatePayload } from './saveValidation';

export type Migration = (payload: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registered migrations, keyed by the source format version they upgrade from.
 *
 * There is no historical save format prior to v1 yet, so the registry is empty.
 * The pipeline is in place for future schema evolution.
 */
const MIGRATIONS: Record<number, Migration> = {
  // Example (not active): 0: (payload) => ({ ...payload, formatVersion: 1 })
};

export interface MigrationResult {
  payload: SavePayload;
  migrated: boolean;
  fromVersion: number;
}

/**
 * Migrates a payload to the current save format.
 */
export function migratePayload(input: unknown): MigrationResult {
  if (typeof input !== 'object' || input === null) {
    throw new SaveError('SAVE_VALIDATION_FAILED', 'The save payload is not an object.');
  }

  let current = structuredClone(input) as Record<string, unknown>;
  const rawVersion = current.formatVersion;
  const fromVersion = typeof rawVersion === 'number' && Number.isInteger(rawVersion) ? rawVersion : 0;

  if (fromVersion > SAVE_FORMAT_VERSION) {
    throw new SaveError(
      'SAVE_INCOMPATIBLE_VERSION',
      `Save format version ${fromVersion} is newer than supported (${SAVE_FORMAT_VERSION}).`,
    );
  }

  let migrated = false;

  for (let version = fromVersion; version < SAVE_FORMAT_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new SaveError(
        'SAVE_INCOMPATIBLE_VERSION',
        `No migration is available from save format version ${version} to ${SAVE_FORMAT_VERSION}.`,
      );
    }

    try {
      current = migrate(current);
      current.formatVersion = version + 1;
      migrated = true;
    } catch (error) {
      if (error instanceof SaveError) throw error;
      throw new SaveError(
        'SAVE_MIGRATION_FAILED',
        `Failed to migrate the save from format version ${version}.`,
      );
    }
  }

  validatePayload(current);
  return { payload: current, migrated, fromVersion };
}