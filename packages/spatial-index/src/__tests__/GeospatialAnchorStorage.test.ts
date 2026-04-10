import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeospatialAnchorStorage } from '../GeospatialAnchorStorage';
import type { GeospatialAnchor } from '../types';

// Mock IndexedDB
const mockIDB = () => {
  const databases = new Map<string, Map<string, any>>();

  const mockIndexedDB = {
    open: vi.fn((dbName: string) => {
      const request: any = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: null,
      };

      setTimeout(() => {
        if (!databases.has(dbName)) {
          databases.set(dbName, new Map());
          if (request.onupgradeneeded) {
            const db = createMockDB(dbName);
            request.onupgradeneeded({ target: { result: db } });
          }
        }

        request.result = createMockDB(dbName);
        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);

      return request;
    }),
  };

  const createMockDB = (dbName: string) => {
    const db: any = {
      objectStoreNames: {
        contains: (name: string) => databases.get(dbName)?.has(name) ?? false,
      },
      createObjectStore: (name: string, options: any) => {
        const store = new Map();
        databases.get(dbName)!.set(name, store);
        return {
          createIndex: vi.fn(),
        };
      },
      transaction: (storeName: string, _mode: string) => {
        const store = databases.get(dbName)?.get(storeName) || new Map();

        // Creates a request object whose onsuccess fires (via setTimeout) when assigned,
        // matching the real IndexedDB callback pattern used by GeospatialAnchorStorage.
        const makeRequest = (result: any) => {
          const req: any = { onerror: null, result };
          Object.defineProperty(req, 'onsuccess', {
            enumerable: true,
            configurable: true,
            get() {
              return null;
            },
            set(fn: any) {
              setTimeout(() => fn?.call(req), 0);
            },
          });
          return req;
        };

        return {
          objectStore: () => ({
            get: (key: string) => makeRequest(store.get(key) ?? null),
            getAll: () => makeRequest(Array.from(store.values())),
            getAllKeys: () => makeRequest(Array.from(store.keys())),
            put: (value: any, key?: string) => {
              const k = key || value.id;
              store.set(k, value);
              return makeRequest(k);
            },
            delete: (key: string) => {
              store.delete(key);
              return makeRequest(undefined);
            },
            clear: () => {
              store.clear();
              return makeRequest(undefined);
            },
          }),
        };
      },
      close: vi.fn(),
    };

    return db;
  };

  return mockIndexedDB;
};

describe('GeospatialAnchorStorage', () => {
  let storage: GeospatialAnchorStorage;

  beforeEach(() => {
    // @ts-ignore
    global.indexedDB = mockIDB();
    storage = new GeospatialAnchorStorage();
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await storage.init();
      const count = await storage.count();
      expect(count).toBe(0);
    });

    it('should only initialize once', async () => {
      await storage.init();
      await storage.init(); // Should not throw
      const count = await storage.count();
      expect(count).toBe(0);
    });
  });

  describe('Set and Get', () => {
    it('should set and get a single anchor', async () => {
      await storage.init();

      const anchor: GeospatialAnchor = {
        id: 'anchor-1',
        lat: 37.7749,
        lon: -122.4194,
      };

      await storage.set(anchor);
      const retrieved = await storage.get('anchor-1');

      expect(retrieved).toBeTruthy();
      expect(retrieved?.id).toBe('anchor-1');
      expect(retrieved?.lat).toBe(37.7749);
    });

    it('should update existing anchor', async () => {
      await storage.init();

      const anchor: GeospatialAnchor = {
        id: 'anchor-1',
        lat: 37.7749,
        lon: -122.4194,
      };

      await storage.set(anchor);

      const updated: GeospatialAnchor = {
        id: 'anchor-1',
        lat: 37.7849,
        lon: -122.4094,
      };

      await storage.set(updated);
      const retrieved = await storage.get('anchor-1');

      expect(retrieved?.lat).toBe(37.7849);
    });

    it('should return null for non-existent anchor', async () => {
      await storage.init();
      const retrieved = await storage.get('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Set Many', () => {
    it('should set multiple anchors efficiently', async () => {
      await storage.init();

      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
        { id: 'a3', lat: 37.7649, lon: -122.4294 },
      ];

      await storage.setMany(anchors);

      const count = await storage.count();
      expect(count).toBe(3);
    });

    it('should handle empty array', async () => {
      await storage.init();
      await storage.setMany([]);
      const count = await storage.count();
      expect(count).toBe(0);
    });
  });

  describe('Remove', () => {
    it('should remove an anchor', async () => {
      await storage.init();

      const anchor: GeospatialAnchor = {
        id: 'anchor-1',
        lat: 37.7749,
        lon: -122.4194,
      };

      await storage.set(anchor);
      const removed = await storage.remove('anchor-1');

      expect(removed).toBe(true);

      const retrieved = await storage.get('anchor-1');
      expect(retrieved).toBeNull();
    });

    it('should return false when removing non-existent anchor', async () => {
      await storage.init();
      const removed = await storage.remove('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Spatial Queries', () => {
    beforeEach(async () => {
      await storage.init();

      const anchors: GeospatialAnchor[] = [
        { id: 'sf', lat: 37.7749, lon: -122.4194 },
        { id: 'oakland', lat: 37.8044, lon: -122.2712 },
        { id: 'san-jose', lat: 37.3382, lon: -121.8863 },
        { id: 'berkeley', lat: 37.8715, lon: -122.273 },
      ];

      await storage.setMany(anchors);
    });

    it('should search by bounding box', async () => {
      const results = await storage.searchBBox({
        minLat: 37.7,
        minLon: -122.5,
        maxLat: 37.9,
        maxLon: -122.2,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain('sf');
      expect(ids).toContain('oakland');
    });

    it('should search by radius', async () => {
      const results = await storage.searchRadius(
        { lat: 37.7749, lon: -122.4194 },
        20000 // 20km
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].anchor.id).toBe('sf'); // Closest
      expect(results[0].distance).toBeLessThan(100); // Almost exact
    });

    it('should find k nearest neighbors', async () => {
      const results = await storage.knn({ lat: 37.7749, lon: -122.4194 }, 2);

      expect(results).toHaveLength(2);
      expect(results[0].anchor.id).toBe('sf');
      expect(results[0].distance).toBeLessThan(results[1].distance);
    });
  });

  describe('Get All and Count', () => {
    it('should get all anchors', async () => {
      await storage.init();

      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
      ];

      await storage.setMany(anchors);

      const all = await storage.getAll();
      expect(all).toHaveLength(2);
    });

    it('should get accurate count', async () => {
      await storage.init();

      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
        { id: 'a3', lat: 37.7649, lon: -122.4294 },
      ];

      await storage.setMany(anchors);

      const count = await storage.count();
      expect(count).toBe(3);
    });
  });

  describe('Clear', () => {
    it('should clear all anchors', async () => {
      await storage.init();

      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
      ];

      await storage.setMany(anchors);
      await storage.clear();

      const count = await storage.count();
      expect(count).toBe(0);
    });
  });

  describe('Import and Export', () => {
    it('should export anchors to JSON', async () => {
      await storage.init();

      const anchors: GeospatialAnchor[] = [
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
      ];

      await storage.setMany(anchors);

      const json = await storage.export();
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBeTruthy();
    });

    it('should import anchors from JSON', async () => {
      await storage.init();

      const json = JSON.stringify([
        { id: 'a1', lat: 37.7749, lon: -122.4194 },
        { id: 'a2', lat: 37.7849, lon: -122.4094 },
      ]);

      await storage.import(json);

      const count = await storage.count();
      expect(count).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should provide tree statistics', async () => {
      await storage.init();

      const anchors: GeospatialAnchor[] = [];
      for (let i = 0; i < 100; i++) {
        anchors.push({
          id: `anchor-${i}`,
          lat: 37.7 + Math.random() * 0.1,
          lon: -122.5 + Math.random() * 0.1,
        });
      }

      await storage.setMany(anchors);

      const stats = storage.getStats();

      expect(stats.totalAnchors).toBe(100);
      expect(stats.height).toBeGreaterThan(0);
      expect(stats.totalNodes).toBeGreaterThan(0);
    });
  });
});
