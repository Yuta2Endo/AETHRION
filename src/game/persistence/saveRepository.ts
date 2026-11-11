/**
 * Save repository �?" low-level CRUD over the IndexedDB stores.
 *
 * The repository performs no validation and no migration; it only reads and
 * writes records. Higher-level guarantees live in the service.
 */

import type { SaveDatabase } from './database';
import { BACKUP_STORE, SAVE_STORE, getDatabase } from './database';
import type { SaveMetadata, SaveRecord } from './saveTypes';

export interface SaveRepository {
  list(): Promise<SaveMetadata[]>;
  getBySlot(slotId: string): Promise<SaveRecord | undefined>;
  getById(saveId: string): Promise<SaveRecord | undefined>;
  put(record: SaveRecord): Promise<void>;
  delete(slotId: string): Promise<boolean>;
  putBackup(record: SaveRecord): Promise<void>;
  listBackups(): Promise<SaveMetadata[]>;
}

export function createRepository(db?: SaveDatabase): SaveRepository {
  const resolveDb = async (): Promise<SaveDatabase> => db ?? getDatabase();

  return {
    async list(): Promise<SaveMetadata[]> {
      const database = await resolveDb();
      const records = await database.getAllFromIndex(SAVE_STORE, 'by-updatedAt');
      return records.map((record) => record.metadata).reverse();
    },

    async getBySlot(slotId: string): Promise<SaveRecord | undefined> {
      const database = await resolveDb();
      return database.getFromIndex(SAVE_STORE, 'by-slot', slotId);
    },

    async getById(saveId: string): Promise<SaveRecord | undefined> {
      const database = await resolveDb();
      return database.get(SAVE_STORE, saveId);
    },

    async put(record: SaveRecord): Promise<void> {
      const database = await resolveDb();
      const tx = database.transaction(SAVE_STORE, 'readwrite');
      const store = tx.store;

      // Enforce one record per slot: remove any existing record of the slot
      // that has a different saveId before writing the new one.
      const existing = await store.index('by-slot').get(record.metadata.slotId);
      if (existing && existing.metadata.saveId !== record.metadata.saveId) {
        await store.delete(existing.metadata.saveId);
      }

      await store.put(record);
      await tx.done;
    },

    async delete(slotId: string): Promise<boolean> {
      const database = await resolveDb();
      const tx = database.transaction(SAVE_STORE, 'readwrite');
      const existing = await tx.store.index('by-slot').get(slotId);
      if (!existing) {
        await tx.done;
        return false;
      }
      await tx.store.delete(existing.metadata.saveId);
      await tx.done;
      return true;
    },

    async putBackup(record: SaveRecord): Promise<void> {
      const database = await resolveDb();
      await database.put(BACKUP_STORE, record);
    },

    async listBackups(): Promise<SaveMetadata[]> {
      const database = await resolveDb();
      const records = await database.getAllFromIndex(BACKUP_STORE, 'by-updatedAt');
      return records.map((record) => record.metadata).reverse();
    },
  };
}