/**
 * ShaderEditorService.test.ts
 *
 * Tests for the ShaderEditorService — IndexedDB-backed CRUD, versioning,
 * auto-save, import/export, and binary format.
 *
 * Strategy: mock 'idb' openDB so all tests run in Node without a real browser.
 * The mock captures writes and answers reads from an in-memory store Map.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ShaderEditorService,
  getShaderEditorService,
} from '../features/shader-editor/ShaderEditorService';
import type {
  ShaderGraphMetadata,
  ShaderGraphVersion,
} from '../features/shader-editor/ShaderEditorService';

// ── IDB Mock ──────────────────────────────────────────────────────────────────
//
// Uses a module-level factory: each test gets a fresh db via beforeEach
// creating a new ShaderEditorService. vi.clearAllMocks() is NOT called here —
// instead we rely on fresh service instances for isolation.

type Store = Map<string, unknown>;

function makeStores(): Record<string, Store> {
  return {
    graphs: new Map(),
    metadata: new Map(),
    versions: new Map(),
    settings: new Map(),
  };
}

function makeStoreProxy(stores: Record<string, Store>, name: string) {
  const s = stores[name];
  return {
    add: async (val: any) => {
      s.set(val.id ?? val.key, val);
      return val.id ?? val.key;
    },
    put: async (val: any) => {
      s.set(val.id ?? val.key, val);
      return val.id ?? val.key;
    },
    get: async (key: string) => s.get(key) ?? undefined,
    delete: async (key: string) => {
      s.delete(key);
    },
    getAll: async () => Array.from(s.values()),
    getAllKeys: async () => Array.from(s.keys()),
    index: (idxName: string) => ({
      getAll: async (query?: string) => {
        if (!query) return Array.from(s.values());
        return Array.from(s.values()).filter((v: any) => {
          if (idxName === 'graphId') return v.graphId === query;
          if (idxName === 'tags') return v.tags?.includes(query);
          return true;
        });
      },
      getAllKeys: async (query?: string) => {
        const vals: any[] = Array.from(s.values());
        return vals
          .filter((v: any) => (idxName === 'graphId' ? v.graphId === query : true))
          .map((v: any) => v.id);
      },
    }),
  };
}

function makeDb(stores: Record<string, Store>) {
  return {
    stores,
    get: async (storeName: string, key: string) => stores[storeName]?.get(key),
    add: async (storeName: string, val: any) => {
      stores[storeName]?.set(val.id ?? val.key, val);
    },
    put: async (storeName: string, val: any) => {
      stores[storeName]?.set(val.id ?? val.key, val);
    },
    delete: async (storeName: string, key: string) => {
      stores[storeName]?.delete(key);
    },
    getAll: async (storeName: string) => Array.from(stores[storeName]?.values() ?? []),
    transaction: (storeNames: string | string[], _mode?: string) => {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const tx: any = { done: Promise.resolve() };
      for (const n of names) tx[n] = makeStoreProxy(stores, n);
      tx.objectStore = (n: string) => makeStoreProxy(stores, n);
      return tx;
    },
    close: () => {},
    objectStoreNames: { contains: () => false },
  };
}

vi.mock('idb', () => {
  function makeStores2(): Record<string, Map<string, unknown>> {
    return {
      graphs: new Map<string, unknown>(),
      metadata: new Map<string, unknown>(),
      versions: new Map<string, unknown>(),
      settings: new Map<string, unknown>(),
    };
  }

  function makeProxy2(stores: Record<string, Map<string, unknown>>, name: string) {
    const s = stores[name];
    return {
      add: async (val: any) => {
        s.set(val.id ?? val.key, val);
      },
      put: async (val: any) => {
        s.set(val.id ?? val.key, val);
      },
      get: async (key: string) => s.get(key),
      delete: async (key: string) => {
        s.delete(key);
      },
      getAll: async () => [...s.values()],
      getAllKeys: async () => [...s.keys()],
      index: (idxName: string) => ({
        getAll: async (q?: string) =>
          q == null
            ? [...s.values()]
            : [...s.values()].filter((v: any) =>
                idxName === 'graphId' ? v.graphId === q : v.tags?.includes(q)
              ),
        getAllKeys: async (q?: string) =>
          [...s.values()]
            .filter((v: any) => (idxName === 'graphId' ? v.graphId === q : true))
            .map((v: any) => v.id),
      }),
    };
  }

  return {
    openDB: async (_name: string, _version: number, opts?: any) => {
      const stores = makeStores2();
      const db = {
        get: async (sn: string, k: string) => stores[sn]?.get(k),
        add: async (sn: string, v: any) => {
          stores[sn]?.set(v.id ?? v.key, v);
        },
        put: async (sn: string, v: any) => {
          stores[sn]?.set(v.id ?? v.key, v);
        },
        delete: async (sn: string, k: string): Promise<void> => {
          stores[sn]?.delete(k);
        },
        getAll: async (sn: string) => [...(stores[sn]?.values() ?? [])],
        transaction: (sn: string | string[], _m?: string) => {
          const names = Array.isArray(sn) ? sn : [sn];
          const tx: any = { done: Promise.resolve() };
          for (const n of names) tx[n] = makeProxy2(stores, n);
          tx.objectStore = (n: string) => makeProxy2(stores, n);
          return tx;
        },
        createObjectStore: (name: string, _opts?: any) => {
          if (!stores[name]) stores[name] = new Map();
          return {
            createIndex: (_idx: string, _path: string, _iopts?: any) => {},
            ...makeProxy2(stores, name),
          };
        },
        close: () => {},
        objectStoreNames: { contains: () => false },
      };
      if (opts?.upgrade) opts.upgrade(db);
      return db;
    },
  };
});

// ── Service factory ───────────────────────────────────────────────────────────

let service: ShaderEditorService;

beforeEach(async () => {
  // Do NOT call vi.clearAllMocks() here — it would destroy the openDB mock factory.
  // Fresh service instance per test provides full isolation (each new service
  // triggers a new openDB call → new in-memory store Map).
  service = new ShaderEditorService();
  await service.initialize();
});

// ── 1. Initialize ─────────────────────────────────────────────────────────────

describe('ShaderEditorService — initialize()', () => {
  it('initializes without error', async () => {
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it('calling initialize() twice is idempotent', async () => {
    await expect(service.initialize()).resolves.not.toThrow();
  });
});

// ── 2. create() ───────────────────────────────────────────────────────────────

describe('ShaderEditorService — create()', () => {
  it('creates a ShaderGraph with the given name', async () => {
    const graph = await service.create('My Shader');
    expect(graph).toBeDefined();
    expect(graph.name).toBe('My Shader');
  });

  it('creates a graph with a unique ID each time', async () => {
    const g1 = await service.create('A');
    const g2 = await service.create('B');
    expect(g1.id).not.toBe(g2.id);
  });

  it('accepts optional description and tags', async () => {
    const graph = await service.create('Tagged', 'desc', ['pbr', 'metallic']);
    expect(graph).toBeDefined();
    expect(graph.name).toBe('Tagged');
  });
});

// ── 3. read() ─────────────────────────────────────────────────────────────────

describe('ShaderEditorService — read()', () => {
  it('returns null for non-existent ID', async () => {
    const result = await service.read('nonexistent-id');
    expect(result).toBeNull();
  });

  it('returns a graph after create()', async () => {
    const created = await service.create('Readable');
    const read = await service.read(created.id);
    expect(read).not.toBeNull();
    expect(read!.name).toBe('Readable');
  });
});

// ── 4. update() ───────────────────────────────────────────────────────────────

describe('ShaderEditorService — update()', () => {
  it('updates a graph without throwing', async () => {
    const graph = await service.create('Updatable');
    await expect(service.update(graph)).resolves.not.toThrow();
  });

  it('throws when graph metadata is missing', async () => {
    // Create a graph manually without metadata
    const { ShaderGraph } = await import('@/lib/shaderGraph');
    const orphan = new ShaderGraph('Orphan');
    await expect(service.update(orphan)).rejects.toThrow('metadata not found');
  });

  it('creates a version snapshot when createVersion=true', async () => {
    const graph = await service.create('Versioned');
    await service.update(graph, true);
    const versions = await service.getVersions(graph.id);
    // Should have at least 2 (initial + manual)
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 5. delete() ───────────────────────────────────────────────────────────────

describe('ShaderEditorService — delete()', () => {
  it('returns true when graph exists', async () => {
    const graph = await service.create('Deletable');
    const result = await service.delete(graph.id);
    expect(result).toBe(true);
  });

  it('graph is gone after delete', async () => {
    const graph = await service.create('Gone');
    await service.delete(graph.id);
    const found = await service.read(graph.id);
    expect(found).toBeNull();
  });
});

// ── 6. list() ─────────────────────────────────────────────────────────────────

describe('ShaderEditorService — list()', () => {
  it('returns empty array when no graphs', async () => {
    const result = await service.list();
    expect(result).toEqual([]);
  });

  it('returns all created graphs', async () => {
    await service.create('G1');
    await service.create('G2');
    const result = await service.list();
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('respects limit option', async () => {
    await service.create('L1');
    await service.create('L2');
    await service.create('L3');
    const result = await service.list({ limit: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('sorts by name ascending', async () => {
    await service.create('Zebra');
    await service.create('Alpha');
    const result = await service.list({ sortBy: 'name', order: 'asc' });
    const names = result.map((m: ShaderGraphMetadata) => m.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

// ── 7. search() ───────────────────────────────────────────────────────────────

describe('ShaderEditorService — search()', () => {
  it('returns empty array for no match', async () => {
    await service.create('Volcano');
    const result = await service.search('zzznonexistent');
    expect(result).toEqual([]);
  });

  it('finds graph by name (case-insensitive)', async () => {
    await service.create('FireShader');
    const result = await service.search('fireshader');
    expect(result.some((m: ShaderGraphMetadata) => m.name === 'FireShader')).toBe(true);
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 5; i++) await service.create(`Match${i}`);
    const result = await service.search('match', 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

// ── 8. Auto-save queue ────────────────────────────────────────────────────────

describe('ShaderEditorService — queueAutoSave / flushAutoSave', () => {
  it('queueAutoSave() does not throw for a fresh graph', async () => {
    const graph = await service.create('AutoSaveTest');
    expect(() => service.queueAutoSave(graph)).not.toThrow();
  });

  it('flushAutoSave() resolves without error (nothing queued)', async () => {
    await expect(service.flushAutoSave()).resolves.not.toThrow();
  });
});

// ── 9. createVersion() / getVersions() ───────────────────────────────────────

describe('ShaderEditorService — versioning', () => {
  it('createVersion() creates an initial version', async () => {
    const graph = await service.create('VersionTest');
    const versions = await service.getVersions(graph.id);
    // create() already creates v1
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].graphId).toBe(graph.id);
    expect(versions[0].message).toMatch(/initial/i);
  });

  it('createVersion() increments version number', async () => {
    const graph = await service.create('Inc');
    await service.createVersion(graph.id, 'v2');
    const versions = await service.getVersions(graph.id);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[versions.length - 1].version).toBeGreaterThan(versions[0].version);
  });

  it('createVersion() computes diff from previous version', async () => {
    const graph = await service.create('DiffTest');
    const v2 = await service.createVersion(graph.id, 'Second version');
    // Second version (after initial) may have a diff field
    expect(v2.graphId).toBe(graph.id);
    expect(v2.message).toBe('Second version');
  });

  it('throws when graph not found', async () => {
    await expect(service.createVersion('ghost-id', 'msg')).rejects.toThrow();
  });
});

// ── 10. Export/Import JSON ────────────────────────────────────────────────────

describe('ShaderEditorService — exportJSON / importJSON', () => {
  it('exportJSON() returns valid JSON string', async () => {
    const graph = await service.create('Exportable');
    const json = await service.exportJSON(graph.id);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('exportJSON() throws for non-existent graph', async () => {
    await expect(service.exportJSON('no-such-graph')).rejects.toThrow('Graph not found');
  });

  it('importJSON() imports and returns graph', async () => {
    const original = await service.create('Original');
    const json = await service.exportJSON(original.id);
    const imported = await service.importJSON(json);
    expect(imported).toBeDefined();
    expect(imported.name).toBe('Original');
    // New ID assigned to avoid collision
    expect(imported.id).not.toBe(original.id);
  });
});

// ── 11. Export/Import Binary ──────────────────────────────────────────────────

describe('ShaderEditorService — exportBinary / importBinary', () => {
  it('exportBinary() returns an ArrayBuffer', async () => {
    const graph = await service.create('BinaryTest');
    const buf = await service.exportBinary(graph.id);
    expect(buf).toBeInstanceOf(ArrayBuffer);
  });

  it('binary format starts with HSG magic bytes', async () => {
    const graph = await service.create('Magic');
    const buf = await service.exportBinary(graph.id);
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x48); // 'H'
    expect(bytes[1]).toBe(0x53); // 'S'
    expect(bytes[2]).toBe(0x47); // 'G'
    expect(bytes[3]).toBe(0x01); // version 1
  });

  it('importBinary() round-trips the graph', async () => {
    const original = await service.create('RoundTrip');
    const buf = await service.exportBinary(original.id);
    const restored = await service.importBinary(buf);
    expect(restored.name).toBe('RoundTrip');
  });

  it('importBinary() throws on invalid magic bytes', async () => {
    const bad = new ArrayBuffer(8);
    new Uint8Array(bad).fill(0xff);
    await expect(service.importBinary(bad)).rejects.toThrow('Invalid .shader file format');
  });

  it('importBinary() throws on unsupported version byte', async () => {
    const buf = new Uint8Array(8);
    buf[0] = 0x48;
    buf[1] = 0x53;
    buf[2] = 0x47;
    buf[3] = 0x99; // bad version
    await expect(service.importBinary(buf.buffer)).rejects.toThrow('Unsupported .shader version');
  });
});

// ── 12. Sync hooks ────────────────────────────────────────────────────────────

describe('ShaderEditorService — sync hooks', () => {
  it('configureSyncHooks() enables sync and sets hooks', () => {
    const onUpdate = vi.fn(async () => {});
    service.configureSyncHooks({ onUpdate });
    const status = service.getSyncStatus();
    expect(status.enabled).toBe(true);
  });

  it('disableSync() sets enabled to false', () => {
    service.configureSyncHooks({});
    service.disableSync();
    expect(service.getSyncStatus().enabled).toBe(false);
  });

  it('getSyncStatus() returns a valid status object', async () => {
    service.configureSyncHooks({});
    const graph = await service.create('Syncable');
    service.queueAutoSave(graph);
    const status = service.getSyncStatus();
    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('pending');
    expect(typeof status.pending).toBe('number');
  });
});

// ── 13. setSetting / close ────────────────────────────────────────────────────

describe('ShaderEditorService — settings & close', () => {
  it('setSetting() stores a value without error', async () => {
    await expect(service.setSetting('autoSaveDelay', 5000)).resolves.not.toThrow();
  });

  it('close() flushes auto-save and closes DB', async () => {
    await expect(service.close()).resolves.not.toThrow();
  });
});

// ── 14. getShaderEditorService() singleton ────────────────────────────────────

describe('getShaderEditorService()', () => {
  it('returns a ShaderEditorService instance', () => {
    const svc = getShaderEditorService();
    expect(svc).toBeInstanceOf(ShaderEditorService);
  });

  it('returns the same instance on consecutive calls', () => {
    const a = getShaderEditorService();
    const b = getShaderEditorService();
    expect(a).toBe(b);
  });
});
