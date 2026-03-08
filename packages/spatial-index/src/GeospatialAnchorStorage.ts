/**
 * @holoscript/spatial-index - Geospatial Anchor Storage
 *
 * IndexedDB-backed storage with R-Tree spatial indexing for efficient
 * geospatial queries. Provides persistent storage with in-memory index.
 *
 * @version 1.0.0
 */

import type { GeospatialAnchor, Point, QueryResult, BBox } from './types';
import { RTree } from './RTree';

export interface StorageOptions {
  dbName?: string;
  storeName?: string;
  maxEntries?: number;
  enableCache?: boolean;
}

/**
 * Persistent geospatial anchor storage with spatial indexing
 */
export class GeospatialAnchorStorage {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;
  private rtree: RTree;
  private enableCache: boolean;
  private initialized = false;

  constructor(options: StorageOptions = {}) {
    this.dbName = options.dbName ?? 'holoscript-geospatial';
    this.storeName = options.storeName ?? 'anchors';
    this.enableCache = options.enableCache ?? true;
    this.rtree = new RTree({
      maxEntries: options.maxEntries ?? 9,
      bulkLoadingEnabled: true,
    });
  }

  /**
   * Initialize IndexedDB and load existing anchors into R-Tree
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await this.openDB();

    // Load all existing anchors into R-Tree
    const anchors = await this.getAllFromDB();
    if (anchors.length > 0) {
      this.rtree.load(anchors);
    }

    this.initialized = true;
  }

  /**
   * Insert or update a geospatial anchor
   */
  async set(anchor: GeospatialAnchor): Promise<void> {
    await this.ensureInitialized();

    // Update IndexedDB
    await this.putToDB(anchor);

    // Update R-Tree index
    // Remove old entry if exists, then insert new
    this.rtree.remove(anchor.id);
    this.rtree.insert(anchor);
  }

  /**
   * Insert or update multiple anchors efficiently
   */
  async setMany(anchors: GeospatialAnchor[]): Promise<void> {
    await this.ensureInitialized();

    if (anchors.length === 0) return;

    // Batch write to IndexedDB
    await this.putManyToDB(anchors);

    // Update R-Tree index
    for (const anchor of anchors) {
      this.rtree.remove(anchor.id);
    }
    this.rtree.load(anchors);
  }

  /**
   * Get anchor by ID
   */
  async get(id: string): Promise<GeospatialAnchor | null> {
    await this.ensureInitialized();
    return this.getFromDB(id);
  }

  /**
   * Remove anchor by ID
   */
  async remove(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const removed = await this.removeFromDB(id);
    if (removed) {
      this.rtree.remove(id);
    }
    return removed;
  }

  /**
   * Search anchors within a bounding box (fast, O(log n))
   */
  async searchBBox(bbox: BBox): Promise<GeospatialAnchor[]> {
    await this.ensureInitialized();
    return this.rtree.search(bbox);
  }

  /**
   * Search anchors within radius of a point (fast, O(log n))
   */
  async searchRadius(center: Point, radiusMeters: number): Promise<QueryResult[]> {
    await this.ensureInitialized();
    return this.rtree.searchRadius(center, radiusMeters);
  }

  /**
   * Find K nearest neighbors (fast, O(k log n))
   */
  async knn(center: Point, k: number): Promise<QueryResult[]> {
    await this.ensureInitialized();
    return this.rtree.knn(center, k);
  }

  /**
   * Get all anchors
   */
  async getAll(): Promise<GeospatialAnchor[]> {
    await this.ensureInitialized();
    return this.rtree.all();
  }

  /**
   * Get count of anchors
   */
  async count(): Promise<number> {
    await this.ensureInitialized();
    const stats = this.rtree.getStats();
    return stats.totalAnchors;
  }

  /**
   * Clear all anchors
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    await this.clearDB();
    this.rtree.clear();
  }

  /**
   * Get R-Tree statistics for performance monitoring
   */
  getStats() {
    return this.rtree.getStats();
  }

  /**
   * Export all anchors to JSON
   */
  async export(): Promise<string> {
    const anchors = await this.getAll();
    return JSON.stringify(anchors, null, 2);
  }

  /**
   * Import anchors from JSON
   */
  async import(json: string): Promise<void> {
    const anchors = JSON.parse(json) as GeospatialAnchor[];
    await this.setMany(anchors);
  }

  // =============================================================================
  // PRIVATE METHODS - IndexedDB Operations
  // =============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async openDB(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });

          // Create indexes for lat/lon for fallback queries
          store.createIndex('lat', 'lat', { unique: false });
          store.createIndex('lon', 'lon', { unique: false });
        }
      };
    });
  }

  private async getFromDB(id: string): Promise<GeospatialAnchor | null> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(new Error(`Failed to get anchor: ${request.error?.message}`));
      request.onsuccess = () => resolve(request.result ?? null);
    });
  }

  private async getAllFromDB(): Promise<GeospatialAnchor[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(new Error(`Failed to get all anchors: ${request.error?.message}`));
      request.onsuccess = () => resolve(request.result ?? []);
    });
  }

  private async putToDB(anchor: GeospatialAnchor): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(anchor);

      request.onerror = () => reject(new Error(`Failed to put anchor: ${request.error?.message}`));
      request.onsuccess = () => resolve();
    });
  }

  private async putManyToDB(anchors: GeospatialAnchor[]): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);

      let completed = 0;
      let hasError = false;

      for (const anchor of anchors) {
        const request = store.put(anchor);

        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(new Error(`Failed to put anchor: ${request.error?.message}`));
          }
        };

        request.onsuccess = () => {
          completed++;
          if (completed === anchors.length && !hasError) {
            resolve();
          }
        };
      }

      if (anchors.length === 0) {
        resolve();
      }
    });
  }

  private async removeFromDB(id: string): Promise<boolean> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);

      // Check if exists first
      const getRequest = store.get(id);

      getRequest.onerror = () => reject(new Error(`Failed to check anchor: ${getRequest.error?.message}`));

      getRequest.onsuccess = () => {
        if (!getRequest.result) {
          resolve(false);
          return;
        }

        const deleteRequest = store.delete(id);

        deleteRequest.onerror = () => reject(new Error(`Failed to delete anchor: ${deleteRequest.error?.message}`));
        deleteRequest.onsuccess = () => resolve(true);
      };
    });
  }

  private async clearDB(): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(new Error(`Failed to clear store: ${request.error?.message}`));
      request.onsuccess = () => resolve();
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.openDB();
    }
    return this.db!;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
