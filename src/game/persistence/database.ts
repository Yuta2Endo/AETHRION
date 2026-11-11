/**
 * Persistence database.
 *
 * Owns the IndexedDB connection, the schema and the version upgrades. The
 * database is opened lazily and the handle is cached; callers must treat a
 * failure as recoverable (the game remains playable without persistence).
 */

import { openDB, type IDBPDatabase } from 'idb';
import { SaveError } from './saveErrors';
import type { SaveRecord } from './saveTypes';

export const SAVE_DB_NAME = 'aethrion-save';
export const SAVE_DB_VERSION = 1;

export const SAVE_STORE = 'saves';
export const BACKUP_STORE = 'backups';

export interface SaveDBSchema {
  [SAVE_STORE]: {
    key: string;
    value: SaveRecord;
    indexes: { 'by-slot': string; 'by-updatedAt': number };
  };
  [BACKUP_STORE]: {
    key: string;
    value: SaveRecord;
    indexes: { 'by-updatedAt': number };
  };
}

export type SaveDatabase = IDBPDatabase<SaveDBSchema>;

let dbPromise: Promise<SaveDatabase> | null = null;

/**
 * Opens (or returns) the persistence database.
 */
export function getDatabase(): Promise<SaveDatabase> {
  if (!dbPromise) {
    dbPromise = openDB<SaveDBSchema>(SAVE_DB_NAME, SAVE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SAVE_STORE)) {
          const store = db.createObjectStore(SAVE_STORE, { keyPath: 'metadata.saveId' });
          store.createIndex('by-slot', 'metadata.slotId', { unique: true });
          store.createIndex('by-updatedAt', 'metadata.updatedAt');
        }

        if (!db.objectStoreNames.contains(BACKUP_STORE)) {
          const store = db.createObjectStore(BACKUP_STORE, { keyPath: 'metadata.saveId' });
          store.createIndex('by-updatedAt', 'metadata.updatedAt');
        }
      },
      blocked() {
        // Another tab holds an older version open — the request will wait.
      },
    }).catch((error) => {
      dbPromise = null;
      const name = error instanceof Error ? error.name : '';
      if (name === 'QuotaExceededError') {
        throw new SaveError('SAVE_QUOTA_EXCEEDED', 'Storage quota exceeded.');
      }
      throw new SaveError(
        'SAVE_DB_UNAVAILABLE',
        error instanceof Error ? error.message : 'The save database could not be opened.',
      );
    });
  }

  return dbPromise;
}

/**
 * Whether IndexedDB is available in the current environment.
 */
export function isDatabaseAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Clears the cached connection (used by tests).
 */
export function resetDatabaseForTests(): void {
  dbPromise = null;
}