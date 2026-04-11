/**
 * WorldState — Loro CRDT document for persistent world state.
 *
 * Extends @holoscript/crdt-spatial beyond transform sync to full world state:
 *   - Scene objects (position, rotation, scale, traits, owner)
 *   - Terrain heightmap (persistent erosion via append deltas)
 *   - NPC memory (hierarchical knowledge tree)
 *   - Player inventories
 *   - Weather state
 *   - World metadata and versioning
 *
 * Two-Tier Sync (W.156):
 *   Tier 1: This class — CRDT for high-level state (~10Hz updates)
 *   Tier 2: Raw binary WebRTC — physics particles (~60Hz, NOT in CRDT)
 *
 * @module crdt-spatial
 */

import { Loro, _LoroMap, _LoroList, _LoroText, VersionVector } from 'loro-crdt';

// =============================================================================
// Types
// =============================================================================

/** Scene object state stored in CRDT */
export interface ObjectState {
  /** World-space position */
  position: [number, number, number];
  /** Quaternion rotation [x, y, z, w] */
  rotation: [number, number, number, number];
  /** Scale */
  scale: [number, number, number];
  /** Asset/mesh reference */
  mesh: string;
  /** Applied trait names */
  traits: string[];
  /** DID of the object creator */
  owner: string;
  /** Arbitrary properties */
  properties: Record<string, unknown>;
}

/** NPC memory entry for vector-searchable knowledge */
export interface NPCMemoryEntry {
  /** When this memory was formed */
  timestamp: number;
  /** Memory category */
  type: 'observation' | 'interaction' | 'emotion' | 'fact';
  /** Natural language content */
  content: string;
  /** Importance decay 0-1 (decreases over time) */
  decay: number;
  /** Source NPC or player ID */
  source: string;
}

/** Inventory item */
export interface InventoryItem {
  type: string;
  quantity: number;
  metadata: Record<string, unknown>;
}

/** Version entry for time-travel */
export interface VersionEntry {
  id: string;
  label: string;
  timestamp: number;
  peerId: string;
}

/** World metadata */
export interface WorldMetadata {
  name: string;
  description: string;
  creator: string;
  createdAt: number;
  version: string;
  terrainResolution: number;
}

// =============================================================================
// WorldState CRDT Document
// =============================================================================

/**
 * Persistent world state backed by Loro CRDT.
 *
 * Document structure:
 * ```
 * root (LoroMap)
 * ├── objects (LoroMap<objectId, JSON ObjectState>)
 * ├── terrain (LoroList<number>)  — flattened heightmap
 * ├── npc_memory (LoroMap<npcId, LoroList<JSON NPCMemoryEntry>>)
 * ├── inventory (LoroMap<playerId, LoroMap<slot, JSON InventoryItem>>)
 * ├── weather (LoroMap)
 * └── meta (LoroMap)
 * ```
 */
export class WorldState {
  private doc: Loro;
  private updateListeners: Array<() => void> = [];
  private versions: VersionEntry[] = [];
  private peerId: string;

  constructor(peerId?: string) {
    this.peerId = peerId ?? `peer_${Math.random().toString(36).slice(2, 10)}`;
    this.doc = new Loro();

    // Subscribe to changes
    this.doc.subscribe(() => {
      for (const listener of this.updateListeners) {
        listener();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Object Management (LWW Map)
  // ---------------------------------------------------------------------------

  /** Add or update an object in the world */
  setObject(id: string, state: ObjectState): void {
    const objects = this.doc.getMap('objects');
    objects.set(id, JSON.stringify(state));
    this.doc.commit();
  }

  /** Get a single object by ID */
  getObject(id: string): ObjectState | null {
    const objects = this.doc.getMap('objects');
    const raw = objects.get(id);
    if (!raw) return null;
    return JSON.parse(raw as string) as ObjectState;
  }

  /** Remove an object from the world */
  removeObject(id: string): void {
    const objects = this.doc.getMap('objects');
    objects.delete(id);
    this.doc.commit();
  }

  /** Get all objects as a Map */
  getAllObjects(): Map<string, ObjectState> {
    const objects = this.doc.getMap('objects');
    const result = new Map<string, ObjectState>();
    const entries = objects.toJSON() as Record<string, string>;
    for (const [id, raw] of Object.entries(entries)) {
      result.set(id, JSON.parse(raw) as ObjectState);
    }
    return result;
  }

  /** Get the count of objects in the world */
  getObjectCount(): number {
    const objects = this.doc.getMap('objects');
    return objects.size;
  }

  // ---------------------------------------------------------------------------
  // Terrain Heightmap (List of floats)
  // ---------------------------------------------------------------------------

  /**
   * Initialize terrain heightmap with given resolution.
   * Creates a flat terrain (all zeros) of resolution x resolution.
   */
  initTerrain(resolution: number): void {
    const terrain = this.doc.getList('terrain');
    // Store resolution as first element
    terrain.insert(0, resolution);
    // Fill with zeros
    for (let i = 0; i < resolution * resolution; i++) {
      terrain.insert(i + 1, 0);
    }
    this.doc.commit();
  }

  /** Get terrain height at grid coordinates */
  getTerrainHeight(x: number, z: number): number {
    const terrain = this.doc.getList('terrain');
    if (terrain.length === 0) return 0;
    const resolution = terrain.get(0) as number;
    const idx = 1 + x + z * resolution;
    if (idx >= terrain.length) return 0;
    return terrain.get(idx) as number;
  }

  /**
   * Apply an erosion delta to a terrain cell.
   * Used by @weather/@erosion to persistently modify terrain.
   */
  applyErosionDelta(x: number, z: number, delta: number): void {
    const terrain = this.doc.getList('terrain');
    if (terrain.length === 0) return;
    const resolution = terrain.get(0) as number;
    const idx = 1 + x + z * resolution;
    if (idx >= terrain.length) return;

    const current = terrain.get(idx) as number;
    terrain.delete(idx, 1);
    terrain.insert(idx, current + delta);
    this.doc.commit();
  }

  /** Get the full heightmap as a Float32Array */
  getHeightmap(): Float32Array {
    const terrain = this.doc.getList('terrain');
    if (terrain.length <= 1) return new Float32Array(0);
    const resolution = terrain.get(0) as number;
    const data = new Float32Array(resolution * resolution);
    for (let i = 0; i < data.length && i + 1 < terrain.length; i++) {
      data[i] = terrain.get(i + 1) as number;
    }
    return data;
  }

  // ---------------------------------------------------------------------------
  // NPC Memory (Map of Lists)
  // ---------------------------------------------------------------------------

  /** Add a memory entry for an NPC */
  addNPCMemory(npcId: string, memory: NPCMemoryEntry): void {
    const npcMemory = this.doc.getMap('npc_memory');
    const existing = npcMemory.get(npcId) as string | undefined;
    const entries: NPCMemoryEntry[] = existing ? JSON.parse(existing) : [];
    entries.push(memory);
    npcMemory.set(npcId, JSON.stringify(entries));
    this.doc.commit();
  }

  /** Query NPC memories, most recent first */
  queryNPCMemories(npcId: string, limit: number = 10): NPCMemoryEntry[] {
    const npcMemory = this.doc.getMap('npc_memory');
    const raw = npcMemory.get(npcId) as string | undefined;
    if (!raw) return [];
    const entries = JSON.parse(raw) as NPCMemoryEntry[];
    return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /** Get all NPC IDs that have memory entries */
  getNPCIds(): string[] {
    const npcMemory = this.doc.getMap('npc_memory');
    return Object.keys(npcMemory.toJSON() as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Inventory (Map of Maps)
  // ---------------------------------------------------------------------------

  /** Set an inventory item for a player */
  setInventoryItem(playerId: string, slot: string, item: InventoryItem): void {
    const inventory = this.doc.getMap('inventory');
    const existing = inventory.get(playerId) as string | undefined;
    const slots: Record<string, InventoryItem> = existing ? JSON.parse(existing) : {};
    slots[slot] = item;
    inventory.set(playerId, JSON.stringify(slots));
    this.doc.commit();
  }

  /** Get all inventory for a player */
  getInventory(playerId: string): Map<string, InventoryItem> {
    const inventory = this.doc.getMap('inventory');
    const raw = inventory.get(playerId) as string | undefined;
    if (!raw) return new Map();
    const slots = JSON.parse(raw) as Record<string, InventoryItem>;
    return new Map(Object.entries(slots));
  }

  /** Remove an inventory item */
  removeInventoryItem(playerId: string, slot: string): void {
    const inventory = this.doc.getMap('inventory');
    const existing = inventory.get(playerId) as string | undefined;
    if (!existing) return;
    const slots = JSON.parse(existing) as Record<string, InventoryItem>;
    delete slots[slot];
    inventory.set(playerId, JSON.stringify(slots));
    this.doc.commit();
  }

  // ---------------------------------------------------------------------------
  // Weather State
  // ---------------------------------------------------------------------------

  /** Set weather state (called by @weather hub trait) */
  setWeatherState(state: Record<string, unknown>): void {
    const weather = this.doc.getMap('weather');
    for (const [key, value] of Object.entries(state)) {
      weather.set(key, JSON.stringify(value));
    }
    this.doc.commit();
  }

  /** Get weather state */
  getWeatherState(): Record<string, unknown> {
    const weather = this.doc.getMap('weather');
    const result: Record<string, unknown> = {};
    const raw = weather.toJSON() as Record<string, string>;
    for (const [key, value] of Object.entries(raw)) {
      result[key] = JSON.parse(value);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  /** Set world metadata */
  setMetadata(meta: WorldMetadata): void {
    const metaMap = this.doc.getMap('meta');
    for (const [key, value] of Object.entries(meta)) {
      metaMap.set(key, JSON.stringify(value));
    }
    this.doc.commit();
  }

  /** Get world metadata */
  getMetadata(): Partial<WorldMetadata> {
    const metaMap = this.doc.getMap('meta');
    const raw = metaMap.toJSON() as Record<string, string>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      result[key] = JSON.parse(value);
    }
    return result as Partial<WorldMetadata>;
  }

  // ---------------------------------------------------------------------------
  // Persistence (Snapshot Import/Export)
  // ---------------------------------------------------------------------------

  /** Export the entire document as a binary snapshot */
  export(): Uint8Array {
    return this.doc.export({ mode: 'snapshot' });
  }

  /** Import a binary snapshot, replacing current state */
  import(data: Uint8Array): void {
    this.doc.import(data);
  }

  /** Export only updates since a previous version vector */
  exportUpdates(since?: VersionVector): Uint8Array {
    return this.doc.export({ mode: 'update', from: since });
  }

  // ---------------------------------------------------------------------------
  // Versioning / Time-Travel
  // ---------------------------------------------------------------------------

  /** Create a named checkpoint, returns version ID */
  checkpoint(label: string = ''): string {
    this.doc.commit();
    const frontiers = this.doc.frontiers();
    const versionId = JSON.stringify(frontiers);
    this.versions.push({
      id: versionId,
      label,
      timestamp: Date.now(),
      peerId: this.peerId,
    });
    return versionId;
  }

  /** Get version history */
  getHistory(): VersionEntry[] {
    return [...this.versions];
  }

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  /** Register a listener for document updates */
  onUpdate(callback: () => void): () => void {
    this.updateListeners.push(callback);
    return () => {
      const idx = this.updateListeners.indexOf(callback);
      if (idx >= 0) this.updateListeners.splice(idx, 1);
    };
  }

  /** Merge another WorldState document into this one */
  merge(other: WorldState): void {
    const otherData = other.export();
    this.doc.import(otherData);
  }

  /** Get the raw Loro document (for advanced operations) */
  getDoc(): Loro {
    return this.doc;
  }

  /** Get the peer ID */
  getPeerId(): string {
    return this.peerId;
  }
}
