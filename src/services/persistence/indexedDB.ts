/**
 * Persistence service using IndexedDB (via idb).
 * Used for save/archive of game state in future stages. Stage 01: foundation
 * only — schema defined, no gameplay data persisted yet.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface AethrionDB extends DBSchema {
  saves: {
    key: string;
    value: {
      id: string;
      name: string;
      data: unknown;
      savedAt: number;
    };
    indexes: { 'by-savedAt': number };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = 'aethrion';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AethrionDB>> | null = null;

function getDB(): Promise<IDBPDatabase<AethrionDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AethrionDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const saveStore = db.createObjectStore('saves', { keyPath: 'id' });
        saveStore.createIndex('by-savedAt', 'savedAt');
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export const persistence = {
  async save(name: string, data: unknown): Promise<void> {
    const db = await getDB();
    const id = `save_${Date.now()}`;
    await db.put('saves', { id, name, data, savedAt: Date.now() });
  },

  async listSaves(): Promise<Array<{ id: string; name: string; savedAt: number }>> {
    const db = await getDB();
    return db
      .getAllFromIndex('saves', 'by-savedAt')
      .then((saves: Array<{ id: string; name: string; savedAt: number }>) =>
        saves.map(({ id, name, savedAt }) => ({ id, name, savedAt })),
      );
  },

  async getSave(id: string) {
    const db = await getDB();
    return db.get('saves', id);
  },

  async deleteSave(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('saves', id);
  },

  async setSetting(key: string, value: unknown): Promise<void> {
    const db = await getDB();
    await db.put('settings', { key, value });
  },

  async getSetting(key: string) {
    const db = await getDB();
    return db.get('settings', key);
  },
};
