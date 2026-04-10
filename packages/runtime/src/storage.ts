/**
 * @holoscript/runtime - Storage Adapter
 *
 * Unified storage API supporting localStorage, IndexedDB, and in-memory fallback.
 * All methods are async for consistency across storage backends.
 */

export interface StorageAdapter {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  has(key: string): Promise<boolean>;
}

/**
 * LocalStorage adapter
 */
class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix = 'holoscript:') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const value = localStorage.getItem(this.getKey(key));
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(this.getKey(key), JSON.stringify(value));
    } catch (err) {
      console.error('[HoloScript] Storage set error:', err);
    }
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(this.getKey(key));
  }

  async clear(): Promise<void> {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  async keys(): Promise<string[]> {
    const result: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        result.push(key.slice(this.prefix.length));
      }
    }
    return result;
  }

  async has(key: string): Promise<boolean> {
    return localStorage.getItem(this.getKey(key)) !== null;
  }
}

/**
 * In-memory storage adapter (fallback when localStorage unavailable)
 */
class MemoryStorageAdapter implements StorageAdapter {
  private data: Map<string, unknown> = new Map();

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = this.data.get(key);
    return (value as T) ?? null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }
}

/**
 * IndexedDB storage adapter for larger data
 */
class IndexedDBStorageAdapter implements StorageAdapter {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;

  constructor(dbName = 'holoscript', storeName = 'storage') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(value, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async keys(): Promise<string[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }
}

/**
 * Create appropriate storage adapter based on environment
 */
function createStorageAdapter(): StorageAdapter {
  // Check if localStorage is available
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      // Test if localStorage is actually usable
      const testKey = '__holoscript_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return new LocalStorageAdapter();
    } catch {
      // localStorage blocked (private browsing, etc.)
    }
  }

  // Fallback to memory storage
  return new MemoryStorageAdapter();
}

// Default storage instance
export const storage = createStorageAdapter();

// Factory functions for specific storage types
export function createLocalStorage(prefix?: string): StorageAdapter {
  return new LocalStorageAdapter(prefix);
}

export function createMemoryStorage(): StorageAdapter {
  return new MemoryStorageAdapter();
}

export function createIndexedDBStorage(dbName?: string, storeName?: string): StorageAdapter {
  return new IndexedDBStorageAdapter(dbName, storeName);
}

// Convenience functions using default storage
export const get = storage.get.bind(storage);
export const set = storage.set.bind(storage);
export const remove = storage.remove.bind(storage);
export const clear = storage.clear.bind(storage);
export const keys = storage.keys.bind(storage);
export const has = storage.has.bind(storage);

export default storage;
