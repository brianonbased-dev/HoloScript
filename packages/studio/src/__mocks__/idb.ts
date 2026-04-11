/**
 * __mocks__/idb.ts
 *
 * Manual mock for the `idb` npm package.
 * Vitest/Jest will use this instead of the real idb when tests call vi.mock('idb').
 *
 * Provides a fully functional in-memory IndexedDB backed by Maps.
 * Supports all methods used by ShaderEditorService, MaterialLibrary, etc.
 */

import { vi } from 'vitest';

// ── In-memory store ────────────────────────────────────────────────────────────

class MemStore {
  private data: Map<string, unknown> = new Map();
  private indexDefs: Map<string, { keyPath: string; multiEntry?: boolean }> = new Map();

  add(value: Record<string, unknown>, key?: string) {
    const k = String(key ?? value?.id ?? value?.key ?? Date.now());
    this.data.set(k, value);
    return Promise.resolve(k);
  }

  put(value: Record<string, unknown>, key?: string) {
    const k = String(key ?? value?.id ?? value?.key ?? Date.now());
    this.data.set(k, value);
    return Promise.resolve(k);
  }

  get(key: string) {
    return Promise.resolve(this.data.get(String(key)) ?? null);
  }

  getAll(_query?: unknown) {
    return Promise.resolve(Array.from(this.data.values()));
  }

  getAllKeys(_query?: unknown) {
    return Promise.resolve(Array.from(this.data.keys()));
  }

  delete(key: string) {
    this.data.delete(String(key));
    return Promise.resolve();
  }

  clear() {
    this.data.clear();
    return Promise.resolve();
  }

  createIndex(name: string, keyPath: string, opts?: { multiEntry?: boolean }) {
    this.indexDefs.set(name, { keyPath, multiEntry: opts?.multiEntry ?? false });
    return this.makeIndex(name);
  }

  index(name: string) {
    return this.makeIndex(name);
  }

  private makeIndex(name: string) {
    const store = this;
    const def = this.indexDefs.get(name);
    return {
      getAll: (query?: unknown) => {
        const all = Array.from(store.data.values()) as Record<string, unknown>[];
        if (!query || !def) return Promise.resolve(all);
        return Promise.resolve(
          all.filter((v) => {
            const val = v?.[def.keyPath];
            return Array.isArray(val) ? val.includes(query) : String(val) === String(query);
          })
        );
      },
      getAllKeys: (query?: unknown) => {
        const all = Array.from(store.data.entries()) as [string, Record<string, unknown>][];
        if (!query || !def) return Promise.resolve(all.map(([k]) => k));
        return Promise.resolve(
          all
            .filter(([, v]) => {
              const val = v?.[def.keyPath];
              return Array.isArray(val) ? val.includes(query) : String(val) === String(query);
            })
            .map(([k]) => k)
        );
      },
      get: (query?: unknown) => {
        const all = Array.from(store.data.values()) as Record<string, unknown>[];
        if (!query || !def) return Promise.resolve(all[0] ?? null);
        return Promise.resolve(all.find((v) => String(v?.[def.keyPath]) === String(query)) ?? null);
      },
    };
  }
}

// ── In-memory database ─────────────────────────────────────────────────────────

class MemDatabase {
  private stores: Map<string, MemStore> = new Map();
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string, _opts?: { keyPath?: string }) {
    const store = new MemStore();
    this.stores.set(name, store);
    return store;
  }

  store(name: string): MemStore {
    if (!this.stores.has(name)) this.stores.set(name, new MemStore());
    return this.stores.get(name)!;
  }

  transaction(_storeNames: string | string[], _mode?: string) {
    const self = this;
    return {
      done: Promise.resolve(),
      objectStore: (name: string) => self.store(name),
    };
  }

  // idb's convenience methods (db.get, db.getAll, db.add, db.put, db.delete)
  get(storeName: string, key: string) {
    return this.store(storeName).get(key);
  }
  getAll(storeName: string) {
    return this.store(storeName).getAll();
  }
  add(storeName: string, value: Record<string, unknown>) {
    return this.store(storeName).add(value);
  }
  put(storeName: string, value: Record<string, unknown>) {
    return this.store(storeName).put(value);
  }
  delete(storeName: string, key: string) {
    return this.store(storeName).delete(key);
  }

  close() {}
}

// ── Exported mock ─────────────────────────────────────────────────────────────

export const openDB = vi.fn(
  async (_name: string, _version: number, callbacks?: { upgrade?: (db: MemDatabase) => void }) => {
    const db = new MemDatabase();
    if (callbacks?.upgrade) callbacks.upgrade(db);
    return db;
  }
);

export const deleteDB = vi.fn(async () => {});
