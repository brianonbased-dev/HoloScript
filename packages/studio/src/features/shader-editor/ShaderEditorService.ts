/**
 * Shader Editor Service
 *
 * Provides CRUD operations, persistence, version control, and sync for shader graphs.
 * Features:
 * - IndexedDB persistence with idb library
 * - Git-like diff/patch system for version control
 * - Cloud sync support (optional hooks)
 * - Auto-save queue with debouncing
 * - Import/export (JSON, .shader binary format)
 */

import { openDB, type IDBPDatabase } from 'idb';
import { ShaderGraph } from '@/lib/shaderGraph';
import type { ISerializedShaderGraph } from '@/lib/shaderGraph';

// ============================================================================
// Types
// ============================================================================

/**
 * Shader graph metadata for indexing
 */
export interface ShaderGraphMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  version: string;
  tags: string[];
  thumbnail?: string; // DataURL
  size: number; // bytes
}

/**
 * Versioned shader graph snapshot
 */
export interface ShaderGraphVersion {
  id: string;
  graphId: string;
  version: number;
  timestamp: number;
  author?: string;
  message: string;
  diff?: ShaderGraphDiff;
  snapshot: ISerializedShaderGraph;
}

/**
 * Diff between two shader graph versions
 */
export interface ShaderGraphDiff {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  connectionsAdded: string[];
  connectionsRemoved: string[];
  propertiesChanged: Record<string, { old: unknown; new: unknown }>;
}

/**
 * Auto-save queue entry
 */
interface AutoSaveEntry {
  graphId: string;
  graph: ShaderGraph;
  timestamp: number;
}

/**
 * Cloud sync status
 */
export interface SyncStatus {
  enabled: boolean;
  lastSync: number;
  pending: number;
  error?: string;
}

// ============================================================================
// Database Schema
// ============================================================================

const DB_NAME = 'holoscript-shader-graphs';
const DB_VERSION = 1;

const STORES = {
  graphs: 'graphs',
  metadata: 'metadata',
  versions: 'versions',
  settings: 'settings',
} as const;

// ============================================================================
// Shader Editor Service
// ============================================================================

export class ShaderEditorService {
  private db: IDBPDatabase | null = null;
  private autoSaveQueue: Map<string, AutoSaveEntry> = new Map();
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private autoSaveDelay = 2000; // 2 seconds debounce
  private syncEnabled = false;
  private syncHooks: SyncHooks = {};

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Shader graphs store
        if (!db.objectStoreNames.contains(STORES.graphs)) {
          db.createObjectStore(STORES.graphs, { keyPath: 'id' });
        }

        // Metadata store for quick lookups
        if (!db.objectStoreNames.contains(STORES.metadata)) {
          const metaStore = db.createObjectStore(STORES.metadata, { keyPath: 'id' });
          metaStore.createIndex('updatedAt', 'updatedAt');
          metaStore.createIndex('tags', 'tags', { multiEntry: true });
        }

        // Version history store
        if (!db.objectStoreNames.contains(STORES.versions)) {
          const versionStore = db.createObjectStore(STORES.versions, { keyPath: 'id' });
          versionStore.createIndex('graphId', 'graphId');
          versionStore.createIndex('timestamp', 'timestamp');
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'key' });
        }
      },
    });

    // Load auto-save delay from settings
    const autoSaveSetting = await this.getSetting<number>('autoSaveDelay');
    if (autoSaveSetting !== null) {
      this.autoSaveDelay = autoSaveSetting;
    }
  }

  /**
   * Create a new shader graph
   */
  async create(
    name: string,
    description?: string,
    tags: string[] = []
  ): Promise<ShaderGraph> {
    await this.ensureDB();

    const graph = new ShaderGraph(name);
    graph.description = description ?? '';

    const metadata: ShaderGraphMetadata = {
      id: graph.id,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: String(graph.version),
      tags,
      size: 0,
    };

    const serialized = graph.toJSON();
    metadata.size = new Blob([JSON.stringify(serialized)]).size;

    const tx = this.db!.transaction([STORES.graphs, STORES.metadata], 'readwrite');
    await Promise.all([
      tx.objectStore(STORES.graphs).add(serialized),
      tx.objectStore(STORES.metadata).add(metadata),
      tx.done,
    ]);

    // Create initial version — pass graph directly to avoid a DB re-read
    await this.createVersion(graph.id, 'Initial version', graph);

    return graph;
  }

  /**
   * Read a shader graph by ID
   */
  async read(id: string): Promise<ShaderGraph | null> {
    await this.ensureDB();

    const serialized = await this.db!.get(STORES.graphs, id);
    if (!serialized) return null;

    return ShaderGraph.fromJSON(serialized);
  }

  /**
   * Update a shader graph
   */
  async update(graph: ShaderGraph, createVersion = false): Promise<void> {
    await this.ensureDB();

    const serialized = graph.toJSON();
    const metadata = await this.db!.get(STORES.metadata, graph.id);

    if (!metadata) {
      throw new Error(`Graph metadata not found: ${graph.id}`);
    }

    metadata.updatedAt = Date.now();
    metadata.version = graph.version;
    metadata.size = new Blob([JSON.stringify(serialized)]).size;

    const tx = this.db!.transaction([STORES.graphs, STORES.metadata], 'readwrite');
    await Promise.all([
      tx.objectStore(STORES.graphs).put(serialized),
      tx.objectStore(STORES.metadata).put(metadata),
      tx.done,
    ]);

    if (createVersion) {
      await this.createVersion(graph.id, 'Auto-saved version');
    }

    // Trigger sync if enabled
    if (this.syncEnabled && this.syncHooks.onUpdate) {
      this.syncHooks.onUpdate(graph).catch(console.error);
    }
  }

  /**
   * Delete a shader graph
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureDB();

    const tx = this.db!.transaction(
      [STORES.graphs, STORES.metadata, STORES.versions],
      'readwrite'
    );

    const graphStore = tx.objectStore(STORES.graphs);
    const metaStore = tx.objectStore(STORES.metadata);
    const versionStore = tx.objectStore(STORES.versions);

    // Delete graph and metadata
    await Promise.all([
      graphStore.delete(id),
      metaStore.delete(id),
    ]);

    // Delete all versions
    const versionIndex = versionStore.index('graphId');
    const versions = await versionIndex.getAllKeys(id);
    await Promise.all(versions.map((key) => versionStore.delete(key)));

    await tx.done;

    // Trigger sync if enabled
    if (this.syncEnabled && this.syncHooks.onDelete) {
      this.syncHooks.onDelete(id).catch(console.error);
    }

    return true;
  }

  /**
   * List all shader graphs
   */
  async list(options?: {
    sortBy?: 'updatedAt' | 'createdAt' | 'name';
    order?: 'asc' | 'desc';
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<ShaderGraphMetadata[]> {
    await this.ensureDB();

    let metadata: ShaderGraphMetadata[];

    if (options?.tags && options.tags.length > 0) {
      // Filter by tags
      const tagIndex = this.db!.transaction(STORES.metadata).objectStore(STORES.metadata).index('tags');
      const results = await Promise.all(
        options.tags.map((tag) => tagIndex.getAll(tag))
      );
      // Flatten and deduplicate
      const seen = new Set<string>();
      metadata = results.flat().filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    } else {
      metadata = await this.db!.getAll(STORES.metadata);
    }

    // Sort
    const sortBy = options?.sortBy ?? 'updatedAt';
    const order = options?.order ?? 'desc';
    metadata.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    // Pagination
    if (options?.offset !== undefined || options?.limit !== undefined) {
      const offset = options.offset ?? 0;
      const limit = options.limit ?? metadata.length;
      metadata = metadata.slice(offset, offset + limit);
    }

    return metadata;
  }

  /**
   * Search shader graphs by name or description
   */
  async search(query: string, limit = 20): Promise<ShaderGraphMetadata[]> {
    await this.ensureDB();

    const allMetadata = await this.db!.getAll(STORES.metadata);
    const lowerQuery = query.toLowerCase();

    return allMetadata
      .filter((m) => {
        const nameMatch = m.name.toLowerCase().includes(lowerQuery);
        const descMatch = m.description?.toLowerCase().includes(lowerQuery);
        return nameMatch || descMatch;
      })
      .slice(0, limit);
  }

  /**
   * Queue graph for auto-save
   */
  queueAutoSave(graph: ShaderGraph): void {
    this.autoSaveQueue.set(graph.id, {
      graphId: graph.id,
      graph,
      timestamp: Date.now(),
    });

    // Reset timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      this.processAutoSaveQueue().catch(console.error);
    }, this.autoSaveDelay);
  }

  /**
   * Process auto-save queue
   */
  private async processAutoSaveQueue(): Promise<void> {
    const entries = Array.from(this.autoSaveQueue.values());
    this.autoSaveQueue.clear();

    for (const entry of entries) {
      try {
        await this.update(entry.graph, false);
      } catch (error) {
        console.error(`Auto-save failed for graph ${entry.graphId}:`, error);
      }
    }
  }

  /**
   * Force flush auto-save queue
   */
  async flushAutoSave(): Promise<void> {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    await this.processAutoSaveQueue();
  }

  /**
   * Create a version snapshot
   * @param graphId - ID of the shader graph
   * @param message - Commit message for this version
   * @param preloadedGraph - Optional preloaded graph to avoid a DB read (used internally in create())
   */
  async createVersion(graphId: string, message: string, preloadedGraph?: ShaderGraph): Promise<ShaderGraphVersion> {
    await this.ensureDB();

    const graph = preloadedGraph ?? await this.read(graphId);
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`);
    }

    // Get previous version for diff
    const versions = await this.getVersions(graphId);
    const previousVersion = versions[versions.length - 1];

    const version: ShaderGraphVersion = {
      id: `${graphId}_v${versions.length + 1}_${Date.now()}`,
      graphId,
      version: versions.length + 1,
      timestamp: Date.now(),
      message,
      snapshot: graph.toJSON(),
    };

    if (previousVersion) {
      version.diff = this.computeDiff(previousVersion.snapshot, version.snapshot);
    }

    await this.db!.add(STORES.versions, version);

    return version;
  }

  /**
   * Get all versions for a graph
   */
  async getVersions(graphId: string): Promise<ShaderGraphVersion[]> {
    await this.ensureDB();

    const versionIndex = this.db!.transaction(STORES.versions).objectStore(STORES.versions).index('graphId');
    const versions = await versionIndex.getAll(graphId);

    return versions.sort((a, b) => a.version - b.version);
  }

  /**
   * Restore a specific version
   */
  async restoreVersion(versionId: string): Promise<ShaderGraph> {
    await this.ensureDB();

    const version = await this.db!.get(STORES.versions, versionId);
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }

    const graph = ShaderGraph.fromJSON(version.snapshot);
    await this.update(graph, true);

    return graph;
  }

  /**
   * Compute diff between two graph versions
   */
  private computeDiff(
    oldGraph: ISerializedShaderGraph,
    newGraph: ISerializedShaderGraph
  ): ShaderGraphDiff {
    const oldNodeIds = new Set(oldGraph.nodes.map((n) => n.id));
    const newNodeIds = new Set(newGraph.nodes.map((n) => n.id));

    const nodesAdded = newGraph.nodes.filter((n) => !oldNodeIds.has(n.id)).map((n) => n.id);
    const nodesRemoved = oldGraph.nodes.filter((n) => !newNodeIds.has(n.id)).map((n) => n.id);

    const nodesModified: string[] = [];
    const propertiesChanged: Record<string, { old: unknown; new: unknown }> = {};

    for (const newNode of newGraph.nodes) {
      const oldNode = oldGraph.nodes.find((n) => n.id === newNode.id);
      if (!oldNode) continue;

      if (JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
        nodesModified.push(newNode.id);
        if (JSON.stringify(oldNode.properties) !== JSON.stringify(newNode.properties)) {
          propertiesChanged[newNode.id] = {
            old: oldNode.properties,
            new: newNode.properties,
          };
        }
      }
    }

    const oldConnIds = new Set((oldGraph.connections ?? []).map((c) => c.id));
    const newConnIds = new Set((newGraph.connections ?? []).map((c) => c.id));

    const connectionsAdded = (newGraph.connections ?? [])
      .filter((c) => !oldConnIds.has(c.id))
      .map((c) => c.id);
    const connectionsRemoved = (oldGraph.connections ?? [])
      .filter((c) => !newConnIds.has(c.id))
      .map((c) => c.id);

    return {
      nodesAdded,
      nodesRemoved,
      nodesModified,
      connectionsAdded,
      connectionsRemoved,
      propertiesChanged,
    };
  }

  /**
   * Export graph to JSON
   */
  async exportJSON(id: string): Promise<string> {
    const graph = await this.read(id);
    if (!graph) {
      throw new Error(`Graph not found: ${id}`);
    }

    return JSON.stringify(graph.toJSON(), null, 2);
  }

  /**
   * Import graph from JSON
   */
  async importJSON(json: string): Promise<ShaderGraph> {
    const parsed = JSON.parse(json) as ISerializedShaderGraph;
    const graph = ShaderGraph.fromJSON(parsed);

    // Generate new ID to avoid conflicts
    graph.id = `graph_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const metadata: ShaderGraphMetadata = {
      id: graph.id,
      name: graph.name,
      description: graph.description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: String(graph.version),
      tags: [],
      size: new Blob([json]).size,
    };

    await this.ensureDB();
    const tx = this.db!.transaction([STORES.graphs, STORES.metadata], 'readwrite');
    await Promise.all([
      tx.objectStore(STORES.graphs).add(graph.toJSON()),
      tx.objectStore(STORES.metadata).add(metadata),
      tx.done,
    ]);

    return graph;
  }

  /**
   * Export graph to binary .shader format
   */
  async exportBinary(id: string): Promise<ArrayBuffer> {
    const json = await this.exportJSON(id);
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(json);

    // Simple binary format: [header (8 bytes)][json data]
    const header = new Uint8Array(8);
    header[0] = 0x48; // 'H'
    header[1] = 0x53; // 'S'
    header[2] = 0x47; // 'G'
    header[3] = 0x01; // Version 1
    // Bytes 4-7: data length (uint32 little-endian)
    new DataView(header.buffer).setUint32(4, jsonBytes.length, true);

    const buffer = new Uint8Array(header.length + jsonBytes.length);
    buffer.set(header, 0);
    buffer.set(jsonBytes, header.length);

    return buffer.buffer;
  }

  /**
   * Import graph from binary .shader format
   */
  async importBinary(buffer: ArrayBuffer): Promise<ShaderGraph> {
    const data = new Uint8Array(buffer);

    // Validate header
    if (data[0] !== 0x48 || data[1] !== 0x53 || data[2] !== 0x47) {
      throw new Error('Invalid .shader file format');
    }

    const version = data[3];
    if (version !== 1) {
      throw new Error(`Unsupported .shader version: ${version}`);
    }

    const dataLength = new DataView(buffer).getUint32(4, true);
    const jsonBytes = data.slice(8, 8 + dataLength);

    const decoder = new TextDecoder();
    const json = decoder.decode(jsonBytes);

    return this.importJSON(json);
  }

  /**
   * Configure cloud sync
   */
  configureSyncHooks(hooks: SyncHooks): void {
    this.syncHooks = hooks;
    this.syncEnabled = true;
  }

  /**
   * Disable cloud sync
   */
  disableSync(): void {
    this.syncEnabled = false;
  }

  /**
   * Get sync status
   */
  getSyncStatus(): SyncStatus {
    return {
      enabled: this.syncEnabled,
      lastSync: 0, // TODO: Track last sync time
      pending: this.autoSaveQueue.size,
    };
  }

  /**
   * Get a setting value
   */
  private async getSetting<T>(key: string): Promise<T | null> {
    await this.ensureDB();
    const setting = await this.db!.get(STORES.settings, key);
    return setting ? setting.value : null;
  }

  /**
   * Set a setting value
   */
  async setSetting<T>(key: string, value: T): Promise<void> {
    await this.ensureDB();
    await this.db!.put(STORES.settings, { key, value });
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDB(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  /**
   * Close database and cleanup
   */
  async close(): Promise<void> {
    await this.flushAutoSave();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// ============================================================================
// Cloud Sync Hooks
// ============================================================================

/**
 * Optional hooks for cloud synchronization
 */
export interface SyncHooks {
  onUpdate?: (graph: ShaderGraph) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onFetch?: (id: string) => Promise<ISerializedShaderGraph | null>;
  onPush?: (graph: ShaderGraph) => Promise<void>;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: ShaderEditorService | null = null;

/**
 * Get singleton instance of ShaderEditorService
 */
export function getShaderEditorService(): ShaderEditorService {
  if (!instance) {
    instance = new ShaderEditorService();
  }
  return instance;
}
