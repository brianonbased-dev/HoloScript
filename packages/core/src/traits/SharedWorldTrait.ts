/**
 * SharedWorld Trait
 *
 * Synchronized world state across devices for multiplayer XR.
 * Manages object ownership, state sync, and conflict resolution.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AuthorityModel = 'server' | 'host' | 'distributed' | 'owner';
type ConflictResolution = 'server_wins' | 'last_write_wins' | 'merge' | 'reject';

interface SyncedObject {
  nodeId: string;
  ownerId: string | null;
  lastSync: number;
  version: number;
}

interface SharedWorldState {
  isSynced: boolean;
  isHost: boolean;
  objectCount: number;
  syncedObjects: Map<string, SyncedObject>;
  lastSyncTime: number;
  syncAccumulator: number;
  connectedPeers: Set<string>;
  pendingUpdates: Array<{ nodeId: string; state: unknown; version: number }>;
  // V43 Tier 2: Spatial Persona State
  spatialPersonas?: Map<
    string,
    { position: [number, number, number]; rotation: number; feature: string }
  >;
  activeActivity?: string;
}

interface SharedWorldConfig {
  authority_model: AuthorityModel;
  sync_rate: number; // Hz
  conflict_resolution: ConflictResolution;
  object_ownership: boolean;
  late_join_sync: boolean;
  state_persistence: boolean;
  max_objects: number;
  interpolation: boolean;
  // V43 Tier 2: visionOS Spatial Persona & SharePlay
  persona_count?: number;
  persona_feature?:
    | 'spatial_audio'
    | 'eye_contact'
    | 'hand_gestures'
    | 'body_language'
    | 'spatial_presence';
  avatar_style?: 'realistic' | 'stylized' | 'minimal';
  spatial_audio_enabled?: boolean;
  activity_type?:
    | 'collaborative_design'
    | 'shared_viewing'
    | 'multiplayer_game'
    | 'co_browsing'
    | 'spatial_presentation';
  sync_mode?: 'realtime' | 'eventual' | 'optimistic';
  latency_compensation?: boolean;
  persona_radius?: number;
  height_offset?: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const sharedWorldHandler: TraitHandler<SharedWorldConfig> = {
  name: 'shared_world',

  defaultConfig: {
    authority_model: 'server',
    sync_rate: 20,
    conflict_resolution: 'server_wins',
    object_ownership: true,
    late_join_sync: true,
    state_persistence: false,
    max_objects: 1000,
    interpolation: true,
    // V43 Tier 2: visionOS defaults
    persona_count: 4,
    persona_feature: 'spatial_audio',
    avatar_style: 'realistic',
    spatial_audio_enabled: true,
    activity_type: 'collaborative_design',
    sync_mode: 'realtime',
    latency_compensation: true,
    persona_radius: 2.0,
    height_offset: 1.6,
  },

  onAttach(node, config, context) {
    const state: SharedWorldState = {
      isSynced: false,
      isHost: false,
      objectCount: 0,
      syncedObjects: new Map(),
      lastSyncTime: 0,
      syncAccumulator: 0,
      connectedPeers: new Set(),
      pendingUpdates: [],
      // V43 Tier 2: Initialize spatial persona state
      spatialPersonas: config.persona_count ? new Map() : undefined,
      activeActivity: config.activity_type,
    };
    (node as any).__sharedWorldState = state;

    context.emit?.('shared_world_init', {
      node,
      authorityModel: config.authority_model,
      syncRate: config.sync_rate,
      // V43: visionOS metadata
      personaCount: config.persona_count,
      activityType: config.activity_type,
    });

    // V43: Initialize spatial personas in circular arrangement
    if (config.persona_count && state.spatialPersonas) {
      const radius = config.persona_radius || 2.0;
      const heightOffset = config.height_offset || 1.6;
      for (let i = 0; i < config.persona_count; i++) {
        const angle = (i / config.persona_count) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        state.spatialPersonas.set(`persona_${i}`, {
          position: [x, heightOffset, z],
          rotation: angle + Math.PI, // Face center
          feature: config.persona_feature || 'spatial_audio',
        });
      }
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__sharedWorldState as SharedWorldState;

    if (state?.isSynced) {
      context.emit?.('shared_world_leave', { node });

      if (config.state_persistence) {
        context.emit?.('shared_world_persist', {
          node,
          objects: Array.from(state.syncedObjects.entries()),
        });
      }
    }

    delete (node as any).__sharedWorldState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__sharedWorldState as SharedWorldState;
    if (!state || !state.isSynced) return;

    const syncInterval = 1 / config.sync_rate;
    state.syncAccumulator += delta;

    if (state.syncAccumulator >= syncInterval) {
      state.syncAccumulator = 0;
      state.lastSyncTime = Date.now();

      // Send pending updates
      if (state.pendingUpdates.length > 0) {
        context.emit?.('shared_world_send_updates', {
          node,
          updates: state.pendingUpdates,
          isHost: state.isHost,
        });

        state.pendingUpdates = [];
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__sharedWorldState as SharedWorldState;
    if (!state) return;

    if (event.type === 'shared_world_connected') {
      state.isSynced = true;
      state.isHost = event.isHost as boolean;

      context.emit?.('on_world_connected', {
        node,
        isHost: state.isHost,
      });

      // Request full state if late join
      if (config.late_join_sync && !state.isHost) {
        context.emit?.('shared_world_request_state', { node });
      }
    } else if (event.type === 'shared_world_full_state') {
      // Receive full world state
      const objects = event.objects as Array<{
        nodeId: string;
        ownerId: string | null;
        state: unknown;
        version: number;
      }>;

      for (const obj of objects) {
        state.syncedObjects.set(obj.nodeId, {
          nodeId: obj.nodeId,
          ownerId: obj.ownerId,
          lastSync: Date.now(),
          version: obj.version,
        });

        context.emit?.('shared_world_apply_state', {
          node,
          targetNodeId: obj.nodeId,
          state: obj.state,
          interpolate: config.interpolation,
        });
      }

      state.objectCount = state.syncedObjects.size;
    } else if (event.type === 'shared_world_register_object') {
      const targetNodeId = event.nodeId as string;
      const ownerId = event.ownerId as string | null;

      if (state.syncedObjects.size < config.max_objects) {
        state.syncedObjects.set(targetNodeId, {
          nodeId: targetNodeId,
          ownerId: config.object_ownership ? ownerId : null,
          lastSync: Date.now(),
          version: 0,
        });

        state.objectCount = state.syncedObjects.size;

        context.emit?.('shared_world_object_registered', {
          node,
          nodeId: targetNodeId,
          ownerId,
        });
      }
    } else if (event.type === 'shared_world_update_object') {
      const targetNodeId = event.nodeId as string;
      const newState = event.state;
      const senderId = event.senderId as string;

      const obj = state.syncedObjects.get(targetNodeId);
      if (!obj) return;

      // Check ownership
      if (config.object_ownership && obj.ownerId && obj.ownerId !== senderId) {
        if (config.conflict_resolution === 'reject') {
          return; // Reject non-owner updates
        }
      }

      // Handle conflict resolution
      const incomingVersion = (event.version as number) || 0;

      if (config.conflict_resolution === 'last_write_wins' || incomingVersion > obj.version) {
        obj.version = incomingVersion;
        obj.lastSync = Date.now();

        context.emit?.('shared_world_apply_state', {
          node,
          targetNodeId,
          state: newState,
          interpolate: config.interpolation,
        });
      }
    } else if (event.type === 'shared_world_queue_update') {
      const targetNodeId = event.nodeId as string;
      const newState = event.state;

      const obj = state.syncedObjects.get(targetNodeId);
      if (obj) {
        obj.version++;

        state.pendingUpdates.push({
          nodeId: targetNodeId,
          state: newState,
          version: obj.version,
        });
      }
    } else if (event.type === 'shared_world_peer_joined') {
      const peerId = event.peerId as string;
      state.connectedPeers.add(peerId);

      context.emit?.('on_peer_joined', {
        node,
        peerId,
        peerCount: state.connectedPeers.size,
      });

      // Send full state to new peer if we're host
      if (state.isHost && config.late_join_sync) {
        context.emit?.('shared_world_send_full_state', {
          node,
          targetPeerId: peerId,
          objects: Array.from(state.syncedObjects.entries()),
        });
      }
    } else if (event.type === 'shared_world_peer_left') {
      const peerId = event.peerId as string;
      state.connectedPeers.delete(peerId);

      // Remove ownership from objects owned by leaving peer
      if (config.object_ownership) {
        for (const obj of state.syncedObjects.values()) {
          if (obj.ownerId === peerId) {
            obj.ownerId = null;
          }
        }
      }

      context.emit?.('on_peer_left', {
        node,
        peerId,
        peerCount: state.connectedPeers.size,
      });
    } else if (event.type === 'shared_world_claim_ownership') {
      const targetNodeId = event.nodeId as string;
      const newOwnerId = event.ownerId as string;

      const obj = state.syncedObjects.get(targetNodeId);
      if (obj && (!obj.ownerId || config.authority_model === 'distributed')) {
        obj.ownerId = newOwnerId;

        context.emit?.('shared_world_ownership_changed', {
          node,
          nodeId: targetNodeId,
          ownerId: newOwnerId,
        });
      }
    } else if (event.type === 'shared_world_query') {
      context.emit?.('shared_world_info', {
        queryId: event.queryId,
        node,
        isSynced: state.isSynced,
        isHost: state.isHost,
        objectCount: state.objectCount,
        peerCount: state.connectedPeers.size,
        lastSyncTime: state.lastSyncTime,
      });
    }
  },
};

export default sharedWorldHandler;
