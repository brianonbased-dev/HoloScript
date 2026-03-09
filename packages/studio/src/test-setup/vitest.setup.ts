/**
 * vitest.setup.ts
 *
 * Global test setup for HoloScript Studio vitest suite.
 * Mocks browser-only APIs that don't exist in Node.js test environment.
 */

// ── IndexedDB mock ─────────────────────────────────────────────────────────────
// ShaderEditorService, MaterialLibrary use the `idb` library which wraps IndexedDB.
// In Node.js (test env) there is no IndexedDB — we provide a minimal in-memory mock.

import { vi } from 'vitest';

// -------------- IDBKeyRange stub (used by idb internals) ----------------------
class IDBKeyRangeStub {
  static only(v: unknown) {
    return { only: v };
  }
  static lowerBound(v: unknown, o?: boolean) {
    return { lower: v, lowerOpen: o };
  }
  static upperBound(v: unknown, o?: boolean) {
    return { upper: v, upperOpen: o };
  }
  static bound(l: unknown, u: unknown, lo?: boolean, uo?: boolean) {
    return { lower: l, upper: u, lowerOpen: lo, upperOpen: uo };
  }
}

// -------------- In-memory IDBObjectStore ----------------------------------------
class MemStore {
  private data: Map<string, unknown> = new Map();
  private indexes: Map<string, { keyPath: string; multiEntry: boolean }> = new Map();

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

  getAll(query?: unknown) {
    return Promise.resolve(Array.from(this.data.values()));
  }

  getAllKeys(query?: unknown) {
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
    this.indexes.set(name, { keyPath, multiEntry: opts?.multiEntry ?? false });
    return this.index(name);
  }

  index(name: string) {
    // Return a view that filters by the indexed keyPath
    const store = this;
    const indexDef = this.indexes.get(name);
    return {
      getAll: (query?: unknown) => {
        const all = Array.from(store.data.values()) as Record<string, unknown>[];
        if (!query || !indexDef) return Promise.resolve(all);
        const filtered = all.filter((v) => {
          const val = v?.[indexDef.keyPath];
          if (Array.isArray(val)) return val.includes(query);
          return String(val) === String(query);
        });
        return Promise.resolve(filtered);
      },
      getAllKeys: (query?: unknown) => {
        const all = Array.from(store.data.entries()) as [string, Record<string, unknown>][];
        if (!query || !indexDef) return Promise.resolve(all.map(([k]) => k));
        const filtered = all
          .filter(([, v]) => {
            const val = v?.[indexDef.keyPath];
            if (Array.isArray(val)) return val.includes(query);
            return String(val) === String(query);
          })
          .map(([k]) => k);
        return Promise.resolve(filtered);
      },
      get: (query?: unknown) => {
        const all = Array.from(store.data.values()) as Record<string, unknown>[];
        if (!query || !indexDef) return Promise.resolve(all[0] ?? null);
        const found = all.find((v) => String(v?.[indexDef.keyPath]) === String(query));
        return Promise.resolve(found ?? null);
      },
    };
  }
}

// -------------- In-memory IDBDatabase ------------------------------------------
class MemDatabase {
  private stores: Map<string, MemStore> = new Map();
  objectStoreNames = { contains: (name: string) => this.stores.has(name) };

  createObjectStore(name: string, opts?: { keyPath?: string }) {
    const store = new MemStore();
    this.stores.set(name, store);
    return store;
  }

  transaction(storeNames: string | string[], mode?: string) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx: Record<string, MemStore> & {
      done: Promise<void>;
      objectStore: (n: string) => MemStore;
    } = {
      done: Promise.resolve(),
      objectStore: (name: string) => {
        if (!this.stores.has(name)) this.stores.set(name, new MemStore());
        return this.stores.get(name)!;
      },
    };
    return tx;
  }

  // Direct store access (idb wraps these)
  get(storeName: string, key: string) {
    return this.stores.get(storeName)?.get(key) ?? Promise.resolve(null);
  }

  getAll(storeName: string) {
    return this.stores.get(storeName)?.getAll() ?? Promise.resolve([]);
  }

  add(storeName: string, value: Record<string, unknown>) {
    if (!this.stores.has(storeName)) this.stores.set(storeName, new MemStore());
    return this.stores.get(storeName)!.add(value);
  }

  put(storeName: string, value: Record<string, unknown>) {
    if (!this.stores.has(storeName)) this.stores.set(storeName, new MemStore());
    return this.stores.get(storeName)!.put(value);
  }

  delete(storeName: string, key: string) {
    return this.stores.get(storeName)?.delete(key) ?? Promise.resolve();
  }

  close() {}
}

// -------------- Mock `idb` openDB -----------------------------------------------
// The `idb` library wraps native IndexedDB. We mock the module entirely.
vi.mock('idb', () => ({
  openDB: vi.fn(
    async (
      name: string,
      version: number,
      { upgrade }: { upgrade?: (db: MemDatabase) => void } = {}
    ) => {
      const db = new MemDatabase();
      if (upgrade) upgrade(db);
      return db;
    }
  ),
}));

// ── @coinbase/agentkit mock ────────────────────────────────────────────────────
// @holoscript/core barrel exports AgentKitIntegration → AgentWalletService →
// @coinbase/agentkit → @privy-io/server-auth which throws
// "cannot be used in a browser environment" in jsdom/node test environments.
// We mock the entire module to prevent this transitive import error.
vi.mock('@coinbase/agentkit', () => ({
  AgentKit: vi.fn(),
  wethActionProvider: vi.fn(),
  walletActionProvider: vi.fn(),
  cdpApiActionProvider: vi.fn(),
  ActionProvider: vi.fn(),
}));

// ── localStorage mock ──────────────────────────────────────────────────────────
// Some stores (EditorStore, CharacterStore) reference localStorage.
// In Node there's no window, so we provide a Map-backed stub.

const localStorageData: Map<string, string> = new Map();

Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: (key: string) => localStorageData.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageData.set(key, value),
    removeItem: (key: string) => localStorageData.delete(key),
    clear: () => localStorageData.clear(),
    get length() {
      return localStorageData.size;
    },
    key: (index: number) => Array.from(localStorageData.keys())[index] ?? null,
  },
  writable: false,
});

// ── IndexedDB globals ─────────────────────────────────────────────────────────
Object.defineProperty(global, 'IDBKeyRange', { value: IDBKeyRangeStub, writable: true });
Object.defineProperty(global, 'indexedDB', {
  value: {
    open: vi.fn(),
    deleteDatabase: vi.fn(),
    databases: vi.fn().mockResolvedValue([]),
  },
  writable: true,
});

// ── Performance.memory stub ───────────────────────────────────────────────────
if (!(performance as any).memory) {
  Object.defineProperty(performance, 'memory', {
    value: { usedJSHeapSize: 50 * 1024 * 1024, totalJSHeapSize: 128 * 1024 * 1024 },
    writable: true,
  });
}
