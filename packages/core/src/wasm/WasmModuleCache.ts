/**
 * WASM Module Cache
 *
 * Caches compiled WebAssembly modules in IndexedDB for instant subsequent loads.
 * Uses streaming compilation for efficient first-load performance.
 *
 * @version 3.3.0
 * @Sprint Sprint 2: Performance Optimization
 */

import { logger } from '../logger';

const CACHE_DB_NAME = 'holoscript-wasm-cache';
const CACHE_STORE_NAME = 'modules';
const CACHE_VERSION = 1;

export interface CachedModule {
  version: string;
  compiledAt: number;
  module: WebAssembly.Module;
  checksum: string;
}

export interface WasmModuleCacheConfig {
  /** Maximum number of modules to cache */
  maxModules?: number;
  /** TTL in milliseconds (default: 7 days) */
  ttlMs?: number;
  /** Enable compression */
  enableCompression?: boolean;
}

/**
 * WasmModuleCache - IndexedDB-backed WASM module cache
 */
export class WasmModuleCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private memoryCache: Map<string, CachedModule> = new Map();
  private config: Required<WasmModuleCacheConfig>;

  constructor(config: WasmModuleCacheConfig = {}) {
    this.config = {
      maxModules: config.maxModules ?? 10,
      ttlMs: config.ttlMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      enableCompression: config.enableCompression ?? false,
    };
  }

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        logger.warn('[WasmModuleCache] IndexedDB not available, using memory-only cache');
        resolve();
        return;
      }

      const request = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);

      request.onerror = () => {
        logger.error('[WasmModuleCache] Failed to open IndexedDB:', {
          error: String(request.error),
        });
        resolve(); // Fallback to memory cache
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.info('[WasmModuleCache] IndexedDB cache initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
          const store = db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
          store.createIndex('compiledAt', 'compiledAt', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Calculate a fast checksum for WASM bytes
   */
  private async calculateChecksum(bytes: Uint8Array): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Create a copy to ensure it's a regular ArrayBuffer
      const buffer = new ArrayBuffer(bytes.length);
      new Uint8Array(buffer).set(bytes);
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hash));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback: simple checksum
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 100) {
      sum = (sum * 31 + bytes[i]) >>> 0;
    }
    return sum.toString(16) + '-' + bytes.length;
  }

  /**
   * Get a cached WASM module
   */
  async get(key: string, version: string): Promise<WebAssembly.Module | null> {
    await this.init();

    // Check memory cache first
    const memCached = this.memoryCache.get(key);
    if (memCached && memCached.version === version) {
      if (Date.now() - memCached.compiledAt < this.config.ttlMs) {
        logger.debug(`[WasmModuleCache] Memory cache hit: ${key}`);
        return memCached.module;
      }
    }

    // Check IndexedDB
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const data = request.result;
        if (!data || data.version !== version) {
          resolve(null);
          return;
        }

        if (Date.now() - data.compiledAt > this.config.ttlMs) {
          logger.debug(`[WasmModuleCache] Cache expired: ${key}`);
          resolve(null);
          return;
        }

        // Reconstruct module from serialized bytes
        try {
          const module = new WebAssembly.Module(data.bytes);
          this.memoryCache.set(key, {
            version,
            compiledAt: data.compiledAt,
            module,
            checksum: data.checksum,
          });
          logger.debug(`[WasmModuleCache] IndexedDB cache hit: ${key}`);
          resolve(module);
        } catch (err) {
          logger.warn(`[WasmModuleCache] Failed to deserialize module:`, { error: String(err) });
          resolve(null);
        }
      };

      request.onerror = () => {
        logger.warn(`[WasmModuleCache] IndexedDB read error:`, { error: String(request.error) });
        resolve(null);
      };
    });
  }

  /**
   * Store a compiled WASM module
   */
  async set(
    key: string,
    version: string,
    module: WebAssembly.Module,
    bytes: Uint8Array
  ): Promise<void> {
    await this.init();

    const checksum = await this.calculateChecksum(bytes);
    const cached: CachedModule = {
      version,
      compiledAt: Date.now(),
      module,
      checksum,
    };

    // Always store in memory
    this.memoryCache.set(key, cached);

    // Store in IndexedDB if available
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);

      const data = {
        key,
        version,
        compiledAt: cached.compiledAt,
        checksum,
        bytes: bytes,
      };

      const request = store.put(data);

      request.onsuccess = () => {
        logger.debug(`[WasmModuleCache] Cached module: ${key}`);
        this.evictOldEntries();
        resolve();
      };

      request.onerror = () => {
        logger.warn(`[WasmModuleCache] Failed to cache module:`, { error: String(request.error) });
        resolve();
      };
    });
  }

  /**
   * Evict old entries to stay under maxModules limit
   */
  private async evictOldEntries(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction([CACHE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CACHE_STORE_NAME);
    const index = store.index('compiledAt');
    const request = index.openCursor();
    const toDelete: string[] = [];
    let count = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        count++;
        if (count > this.config.maxModules) {
          toDelete.push(cursor.value.key);
        }
        cursor.continue();
      } else {
        // Delete old entries
        toDelete.forEach((key) => store.delete(key));
      }
    };
  }

  /**
   * Clear the entire cache
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): { memoryEntries: number; dbAvailable: boolean } {
    return {
      memoryEntries: this.memoryCache.size,
      dbAvailable: this.db !== null,
    };
  }
}

// Singleton instance
export const wasmModuleCache = new WasmModuleCache();
