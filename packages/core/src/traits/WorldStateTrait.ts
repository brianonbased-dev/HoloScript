/**
 * @world_state Trait — Loro CRDT Persistent World State
 *
 * Bridges the WorldState CRDT document to the trait system.
 * Manages scene objects, terrain, NPC memory, inventory, and weather
 * persistence via Loro CRDT with automatic sync.
 *
 * Two-Tier Sync (W.156):
 *   Tier 1: CRDT for high-level state (~10Hz)
 *   Tier 2: Raw binary for physics particles (~60Hz, NOT in CRDT)
 *
 * @module traits
 */

import type { TraitHandler, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, WorldStateTraitState>();

interface WorldStateConfig {
  /** Sync interval in seconds (default: 0.1 = 10Hz) */
  sync_interval: number;
  /** Auto-save interval in seconds (default: 30) */
  autosave_interval: number;
  /** Max objects tracked (default: 10000) */
  max_objects: number;
  /** Enable terrain persistence (default: true) */
  persist_terrain: boolean;
  /** Enable NPC memory persistence (default: true) */
  persist_npc_memory: boolean;
  /** Enable inventory persistence (default: true) */
  persist_inventory: boolean;
  /** World ID for multi-world support */
  world_id: string;
}

interface WorldStateTraitState {
  active: boolean;
  syncTimer: number;
  autosaveTimer: number;
  objectCount: number;
  lastSyncTime: number;
  version: number;
}

export const worldStateHandler: TraitHandler<WorldStateConfig> = {
  name: 'world_state',
  defaultConfig: {
    sync_interval: 0.1,
    autosave_interval: 30,
    max_objects: 10000,
    persist_terrain: true,
    persist_npc_memory: true,
    persist_inventory: true,
    world_id: 'default',
  },

  onAttach(node, config, context) {
    const state: WorldStateTraitState = {
      active: true,
      syncTimer: 0,
      autosaveTimer: 0,
      objectCount: 0,
      lastSyncTime: 0,
      version: 0,
    };
    traitState.set(node, state);
    node.__worldStateTraitState = state;

    context.emit('world_state_create', {
      worldId: config.world_id,
      maxObjects: config.max_objects,
      persistTerrain: config.persist_terrain,
      persistNPCMemory: config.persist_npc_memory,
      persistInventory: config.persist_inventory,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      // Trigger final save before detach
      context.emit('world_state_save', { reason: 'detach' });
      context.emit('world_state_destroy', { nodeId: node.id });
      traitState.delete(node);
      delete node.__worldStateTraitState;
    }
  },

  onUpdate(node, config, context, delta) {
    const state = traitState.get(node);
    if (!state?.active) return;

    // Sync timer (~10Hz CRDT sync)
    state.syncTimer += delta;
    if (state.syncTimer >= config.sync_interval) {
      state.syncTimer = 0;
      state.lastSyncTime = Date.now();
      context.emit('world_state_sync', {
        worldId: config.world_id,
        version: state.version,
      });
    }

    // Auto-save timer
    state.autosaveTimer += delta;
    if (state.autosaveTimer >= config.autosave_interval) {
      state.autosaveTimer = 0;
      state.version++;
      context.emit('world_state_save', {
        reason: 'autosave',
        version: state.version,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    switch (event.type) {
      case 'world_state_object_added':
        state.objectCount = Math.min(state.objectCount + 1, config.max_objects);
        context.emit('world_state_update', {
          action: 'add_object',
          objectId: event.objectId,
          data: event.data,
        });
        break;
      case 'world_state_object_removed':
        state.objectCount = Math.max(0, state.objectCount - 1);
        context.emit('world_state_update', {
          action: 'remove_object',
          objectId: event.objectId,
        });
        break;
      case 'world_state_terrain_update':
        if (config.persist_terrain) {
          context.emit('world_state_update', {
            action: 'terrain',
            position: event.position,
            delta: event.delta,
          });
        }
        break;
      case 'world_state_npc_memory':
        if (config.persist_npc_memory) {
          context.emit('world_state_update', {
            action: 'npc_memory',
            npcId: event.npcId,
            memory: event.memory,
          });
        }
        break;
      case 'world_state_inventory_update':
        if (config.persist_inventory) {
          context.emit('world_state_update', {
            action: 'inventory',
            playerId: event.playerId,
            item: event.item,
          });
        }
        break;
      case 'world_state_force_save':
        state.version++;
        context.emit('world_state_save', {
          reason: 'manual',
          version: state.version,
        });
        break;
      case 'world_state_load':
        context.emit('world_state_load', {
          worldId: event.worldId ?? config.world_id,
          snapshot: event.snapshot,
        });
        break;
      case 'world_state_merge':
        context.emit('world_state_merge', {
          updates: event.updates,
        });
        break;
    }
  },
};
