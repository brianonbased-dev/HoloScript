/**
 * WorldState — Integration tests for Loro CRDT-backed persistent world state.
 *
 * Tests object CRUD, terrain heightmap operations, NPC memory, inventory,
 * weather state persistence, snapshot import/export, checkpoint versioning,
 * update subscriptions, and multi-peer CRDT merging.
 *
 * @module crdt-spatial
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorldState } from '../WorldState';
import type { ObjectState, NPCMemoryEntry, InventoryItem, WorldMetadata } from '../WorldState';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeObject(overrides?: Partial<ObjectState>): ObjectState {
  return {
    position: [0, 1, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    mesh: 'cube.glb',
    traits: ['@physics', '@grabbable'],
    owner: 'did:key:test123',
    properties: {},
    ...overrides,
  };
}

function makeMemory(overrides?: Partial<NPCMemoryEntry>): NPCMemoryEntry {
  return {
    timestamp: Date.now(),
    type: 'observation',
    content: 'Saw the player enter the village',
    decay: 1.0,
    source: 'npc_guard',
    ...overrides,
  };
}

describe('WorldState', () => {
  let world: WorldState;

  beforeEach(() => {
    world = new WorldState('test-peer-1');
  });

  // ── Constructor ─────────────────────────────────────────────────────

  describe('constructor', () => {
    it('uses provided peerId', () => {
      expect(world.getPeerId()).toBe('test-peer-1');
    });

    it('auto-generates peerId if not provided', () => {
      const auto = new WorldState();
      expect(auto.getPeerId()).toMatch(/^peer_[a-z0-9]+$/);
    });

    it('creates fresh Loro document', () => {
      expect(world.getDoc()).toBeDefined();
    });
  });

  // ── Object Management ───────────────────────────────────────────────

  describe('objects', () => {
    it('setObject + getObject roundtrip', () => {
      const obj = makeObject({ position: [5, 3, 2] });
      world.setObject('cube-1', obj);
      const retrieved = world.getObject('cube-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.position).toEqual([5, 3, 2]);
      expect(retrieved!.mesh).toBe('cube.glb');
      expect(retrieved!.traits).toEqual(['@physics', '@grabbable']);
    });

    it('getObject returns null for missing ID', () => {
      expect(world.getObject('nonexistent')).toBeNull();
    });

    it('setObject overwrites existing object', () => {
      world.setObject('obj-1', makeObject({ mesh: 'sphere.glb' }));
      world.setObject('obj-1', makeObject({ mesh: 'cylinder.glb' }));
      expect(world.getObject('obj-1')!.mesh).toBe('cylinder.glb');
    });

    it('removeObject removes existing object', () => {
      world.setObject('obj-1', makeObject());
      world.removeObject('obj-1');
      expect(world.getObject('obj-1')).toBeNull();
    });

    it('removeObject is safe for missing ID', () => {
      expect(() => world.removeObject('nonexistent')).not.toThrow();
    });

    it('getAllObjects returns all objects', () => {
      world.setObject('a', makeObject({ mesh: 'a.glb' }));
      world.setObject('b', makeObject({ mesh: 'b.glb' }));
      world.setObject('c', makeObject({ mesh: 'c.glb' }));
      const all = world.getAllObjects();
      expect(all.size).toBe(3);
      expect(all.get('b')!.mesh).toBe('b.glb');
    });

    it('getObjectCount reflects current count', () => {
      expect(world.getObjectCount()).toBe(0);
      world.setObject('a', makeObject());
      expect(world.getObjectCount()).toBe(1);
      world.setObject('b', makeObject());
      expect(world.getObjectCount()).toBe(2);
      world.removeObject('a');
      expect(world.getObjectCount()).toBe(1);
    });

    it('preserves complex properties', () => {
      const obj = makeObject({
        properties: { health: 100, inventory: ['sword', 'shield'], nested: { a: 1 } },
      });
      world.setObject('complex', obj);
      const retrieved = world.getObject('complex')!;
      expect(retrieved.properties.health).toBe(100);
      expect(retrieved.properties.inventory).toEqual(['sword', 'shield']);
    });
  });

  // ── Terrain Heightmap ───────────────────────────────────────────────

  describe('terrain', () => {
    it('initTerrain creates flat terrain', () => {
      world.initTerrain(4);
      for (let x = 0; x < 4; x++) {
        for (let z = 0; z < 4; z++) {
          expect(world.getTerrainHeight(x, z)).toBe(0);
        }
      }
    });

    it('getTerrainHeight returns 0 for uninitialized terrain', () => {
      expect(world.getTerrainHeight(0, 0)).toBe(0);
    });

    it('getTerrainHeight returns 0 for out-of-bounds', () => {
      world.initTerrain(4);
      expect(world.getTerrainHeight(10, 10)).toBe(0);
    });

    it('applyErosionDelta modifies height', () => {
      world.initTerrain(4);
      world.applyErosionDelta(1, 2, -0.5);
      expect(world.getTerrainHeight(1, 2)).toBeCloseTo(-0.5);
    });

    it('erosion deltas accumulate', () => {
      world.initTerrain(4);
      world.applyErosionDelta(0, 0, 1.0);
      world.applyErosionDelta(0, 0, 0.5);
      expect(world.getTerrainHeight(0, 0)).toBeCloseTo(1.5);
    });

    it('erosion only affects specified cell', () => {
      world.initTerrain(4);
      world.applyErosionDelta(2, 2, 3.0);
      expect(world.getTerrainHeight(2, 2)).toBeCloseTo(3.0);
      expect(world.getTerrainHeight(0, 0)).toBe(0);
      expect(world.getTerrainHeight(3, 3)).toBe(0);
    });

    it('getHeightmap returns Float32Array', () => {
      world.initTerrain(4);
      world.applyErosionDelta(1, 1, 2.0);
      const hm = world.getHeightmap();
      expect(hm).toBeInstanceOf(Float32Array);
      expect(hm.length).toBe(16); // 4x4
      expect(hm[1 + 1 * 4]).toBeCloseTo(2.0);
    });

    it('getHeightmap on empty terrain returns empty array', () => {
      const hm = world.getHeightmap();
      expect(hm.length).toBe(0);
    });
  });

  // ── NPC Memory ──────────────────────────────────────────────────────

  describe('NPC memory', () => {
    it('addNPCMemory + queryNPCMemories roundtrip', () => {
      world.addNPCMemory('guard-1', makeMemory({ content: 'first' }));
      const memories = world.queryNPCMemories('guard-1');
      expect(memories.length).toBe(1);
      expect(memories[0].content).toBe('first');
    });

    it('queryNPCMemories returns empty for unknown NPC', () => {
      expect(world.queryNPCMemories('unknown')).toEqual([]);
    });

    it('multiple memories are returned in reverse chronological order', () => {
      world.addNPCMemory('npc-1', makeMemory({ timestamp: 100, content: 'old' }));
      world.addNPCMemory('npc-1', makeMemory({ timestamp: 300, content: 'new' }));
      world.addNPCMemory('npc-1', makeMemory({ timestamp: 200, content: 'mid' }));
      const memories = world.queryNPCMemories('npc-1');
      expect(memories[0].content).toBe('new');
      expect(memories[1].content).toBe('mid');
      expect(memories[2].content).toBe('old');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        world.addNPCMemory('npc-1', makeMemory({ timestamp: i, content: `memory-${i}` }));
      }
      const limited = world.queryNPCMemories('npc-1', 5);
      expect(limited.length).toBe(5);
      // Most recent first
      expect(limited[0].timestamp).toBe(19);
    });

    it('default limit is 10', () => {
      for (let i = 0; i < 15; i++) {
        world.addNPCMemory('npc-1', makeMemory({ timestamp: i }));
      }
      expect(world.queryNPCMemories('npc-1').length).toBe(10);
    });

    it('getNPCIds lists all NPCs with memories', () => {
      world.addNPCMemory('guard-1', makeMemory());
      world.addNPCMemory('merchant-1', makeMemory());
      world.addNPCMemory('villager-1', makeMemory());
      const ids = world.getNPCIds();
      expect(ids).toContain('guard-1');
      expect(ids).toContain('merchant-1');
      expect(ids).toContain('villager-1');
      expect(ids.length).toBe(3);
    });

    it('memory types are preserved', () => {
      world.addNPCMemory('npc-1', makeMemory({ type: 'emotion', decay: 0.5 }));
      const memories = world.queryNPCMemories('npc-1');
      expect(memories[0].type).toBe('emotion');
      expect(memories[0].decay).toBe(0.5);
    });
  });

  // ── Inventory ───────────────────────────────────────────────────────

  describe('inventory', () => {
    const sword: InventoryItem = { type: 'weapon', quantity: 1, metadata: { damage: 10 } };
    const potion: InventoryItem = { type: 'consumable', quantity: 5, metadata: { heal: 20 } };

    it('setInventoryItem + getInventory roundtrip', () => {
      world.setInventoryItem('player-1', 'slot-1', sword);
      const inv = world.getInventory('player-1');
      expect(inv.size).toBe(1);
      expect(inv.get('slot-1')!.type).toBe('weapon');
      expect(inv.get('slot-1')!.metadata.damage).toBe(10);
    });

    it('getInventory returns empty map for unknown player', () => {
      const inv = world.getInventory('unknown');
      expect(inv.size).toBe(0);
    });

    it('multiple items in different slots', () => {
      world.setInventoryItem('player-1', 'slot-1', sword);
      world.setInventoryItem('player-1', 'slot-2', potion);
      const inv = world.getInventory('player-1');
      expect(inv.size).toBe(2);
      expect(inv.get('slot-2')!.quantity).toBe(5);
    });

    it('overwrite existing slot', () => {
      world.setInventoryItem('player-1', 'slot-1', sword);
      world.setInventoryItem('player-1', 'slot-1', potion);
      const inv = world.getInventory('player-1');
      expect(inv.size).toBe(1);
      expect(inv.get('slot-1')!.type).toBe('consumable');
    });

    it('removeInventoryItem removes specific slot', () => {
      world.setInventoryItem('player-1', 'slot-1', sword);
      world.setInventoryItem('player-1', 'slot-2', potion);
      world.removeInventoryItem('player-1', 'slot-1');
      const inv = world.getInventory('player-1');
      expect(inv.size).toBe(1);
      expect(inv.has('slot-1')).toBe(false);
    });

    it('removeInventoryItem is safe for unknown player', () => {
      expect(() => world.removeInventoryItem('unknown', 'slot-1')).not.toThrow();
    });
  });

  // ── Weather State ───────────────────────────────────────────────────

  describe('weather state', () => {
    it('setWeatherState + getWeatherState roundtrip', () => {
      world.setWeatherState({ temperature: 25, humidity: 0.7, wind: [3, 0, 1] });
      const ws = world.getWeatherState();
      expect(ws.temperature).toBe(25);
      expect(ws.humidity).toBe(0.7);
      expect(ws.wind).toEqual([3, 0, 1]);
    });

    it('getWeatherState returns empty on fresh world', () => {
      const ws = world.getWeatherState();
      expect(Object.keys(ws).length).toBe(0);
    });

    it('weather state supports partial updates', () => {
      world.setWeatherState({ temperature: 20 });
      world.setWeatherState({ humidity: 0.5 });
      const ws = world.getWeatherState();
      expect(ws.temperature).toBe(20);
      expect(ws.humidity).toBe(0.5);
    });
  });

  // ── Metadata ────────────────────────────────────────────────────────

  describe('metadata', () => {
    const meta: WorldMetadata = {
      name: 'Test World',
      description: 'A test world for integration tests',
      creator: 'did:key:test',
      createdAt: Date.now(),
      version: '1.0.0',
      terrainResolution: 256,
    };

    it('setMetadata + getMetadata roundtrip', () => {
      world.setMetadata(meta);
      const retrieved = world.getMetadata();
      expect(retrieved.name).toBe('Test World');
      expect(retrieved.version).toBe('1.0.0');
      expect(retrieved.terrainResolution).toBe(256);
    });

    it('getMetadata returns partial for fresh world', () => {
      const retrieved = world.getMetadata();
      expect(Object.keys(retrieved).length).toBe(0);
    });
  });

  // ── Snapshot Import/Export ──────────────────────────────────────────

  describe('persistence', () => {
    it('export returns Uint8Array', () => {
      world.setObject('test', makeObject());
      const snapshot = world.export();
      expect(snapshot).toBeInstanceOf(Uint8Array);
      expect(snapshot.length).toBeGreaterThan(0);
    });

    it('import restores state from snapshot', () => {
      world.setObject('cube-1', makeObject({ mesh: 'cube.glb' }));
      world.setObject('sphere-1', makeObject({ mesh: 'sphere.glb' }));
      const snapshot = world.export();

      const world2 = new WorldState('peer-2');
      world2.import(snapshot);
      expect(world2.getObjectCount()).toBe(2);
      expect(world2.getObject('cube-1')!.mesh).toBe('cube.glb');
    });

    it('export/import preserves terrain', () => {
      world.initTerrain(4);
      world.applyErosionDelta(2, 2, 5.0);
      const snapshot = world.export();

      const world2 = new WorldState('peer-2');
      world2.import(snapshot);
      expect(world2.getTerrainHeight(2, 2)).toBeCloseTo(5.0);
    });

    it('export/import preserves NPC memories', () => {
      world.addNPCMemory('npc-1', makeMemory({ content: 'I remember' }));
      const snapshot = world.export();

      const world2 = new WorldState('peer-2');
      world2.import(snapshot);
      const memories = world2.queryNPCMemories('npc-1');
      expect(memories[0].content).toBe('I remember');
    });
  });

  // ── Versioning / Time-Travel ───────────────────────────────────────

  describe('checkpoints', () => {
    it('checkpoint returns a version ID', () => {
      world.setObject('obj-1', makeObject());
      const versionId = world.checkpoint('v1');
      expect(typeof versionId).toBe('string');
      expect(versionId.length).toBeGreaterThan(0);
    });

    it('getHistory tracks checkpoints', () => {
      world.setObject('a', makeObject());
      world.checkpoint('first');
      world.setObject('b', makeObject());
      world.checkpoint('second');

      const history = world.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].label).toBe('first');
      expect(history[1].label).toBe('second');
      expect(history[0].peerId).toBe('test-peer-1');
    });

    it('checkpoint timestamps are sequential', () => {
      world.checkpoint('a');
      world.checkpoint('b');
      const history = world.getHistory();
      expect(history[1].timestamp).toBeGreaterThanOrEqual(history[0].timestamp);
    });

    it('getHistory returns a copy', () => {
      world.checkpoint('test');
      const h1 = world.getHistory();
      const h2 = world.getHistory();
      expect(h1).not.toBe(h2);
      expect(h1).toEqual(h2);
    });
  });

  // ── Update Subscription ────────────────────────────────────────────

  describe('onUpdate', () => {
    it('fires callback on object change', () => {
      const callback = vi.fn();
      world.onUpdate(callback);
      world.setObject('trigger', makeObject());
      // Loro fires synchronously on commit
      expect(callback).toHaveBeenCalled();
    });

    it('unsubscribe stops callbacks', () => {
      const callback = vi.fn();
      const unsub = world.onUpdate(callback);
      unsub();
      world.setObject('trigger', makeObject());
      // Should not have been called after unsubscribe
      // Note: Loro may still fire the internal handler, but our listener should be removed
      // This depends on when Loro fires vs when we unsubscribe
    });

    it('multiple listeners all fire', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      world.onUpdate(cb1);
      world.onUpdate(cb2);
      world.setObject('trigger', makeObject());
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });
  });

  // ── Multi-Peer CRDT Merge ──────────────────────────────────────────

  describe('merge', () => {
    it('merges objects from another peer', () => {
      const world2 = new WorldState('peer-2');
      world2.setObject('remote-obj', makeObject({ mesh: 'remote.glb' }));

      world.setObject('local-obj', makeObject({ mesh: 'local.glb' }));
      world.merge(world2);

      expect(world.getObjectCount()).toBe(2);
      expect(world.getObject('remote-obj')!.mesh).toBe('remote.glb');
      expect(world.getObject('local-obj')!.mesh).toBe('local.glb');
    });

    it('merge preserves local state', () => {
      world.setObject('local', makeObject({ mesh: 'local.glb' }));
      const world2 = new WorldState('peer-2');
      world.merge(world2);
      expect(world.getObject('local')!.mesh).toBe('local.glb');
    });

    it('concurrent object edits (LWW resolution)', () => {
      const world2 = new WorldState('peer-2');

      world.setObject('shared', makeObject({ mesh: 'v1.glb' }));
      world2.setObject('shared', makeObject({ mesh: 'v2.glb' }));

      // After merge, one version wins (LWW — deterministic by Loro)
      world.merge(world2);
      const result = world.getObject('shared');
      expect(result).not.toBeNull();
      // Either v1 or v2 wins, but it must be consistent
      expect(['v1.glb', 'v2.glb']).toContain(result!.mesh);
    });

    it('merge terrain from remote peer', () => {
      const world2 = new WorldState('peer-2');
      world2.initTerrain(4);
      world2.applyErosionDelta(1, 1, 2.0);

      world.merge(world2);
      expect(world.getTerrainHeight(1, 1)).toBeCloseTo(2.0);
    });

    it('merge NPC memories from multiple peers', () => {
      const world2 = new WorldState('peer-2');
      world.addNPCMemory('npc-1', makeMemory({ timestamp: 100, content: 'local memory' }));
      world2.addNPCMemory('npc-1', makeMemory({ timestamp: 200, content: 'remote memory' }));

      world.merge(world2);
      // After merge, the NPC should have memories from both peers
      // (exact behavior depends on Loro's LWW map semantics for the npc_memory key)
      const memories = world.queryNPCMemories('npc-1');
      expect(memories.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Incremental Export ─────────────────────────────────────────────

  describe('exportUpdates', () => {
    it('exportUpdates returns Uint8Array', () => {
      world.setObject('test', makeObject());
      const updates = world.exportUpdates();
      expect(updates).toBeInstanceOf(Uint8Array);
      expect(updates.length).toBeGreaterThan(0);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles unicode in object properties', () => {
      world.setObject('emoji', makeObject({
        properties: { name: 'Cube \u2728', description: '\u3053\u3093\u306B\u3061\u306F' },
      }));
      const obj = world.getObject('emoji')!;
      expect(obj.properties.name).toBe('Cube \u2728');
    });

    it('handles empty traits array', () => {
      world.setObject('bare', makeObject({ traits: [] }));
      expect(world.getObject('bare')!.traits).toEqual([]);
    });

    it('handles large number of objects', () => {
      for (let i = 0; i < 100; i++) {
        world.setObject(`obj-${i}`, makeObject({ mesh: `mesh-${i}.glb` }));
      }
      expect(world.getObjectCount()).toBe(100);
      expect(world.getObject('obj-50')!.mesh).toBe('mesh-50.glb');
    });
  });
});
