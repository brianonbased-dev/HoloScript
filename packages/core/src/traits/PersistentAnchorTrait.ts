/**
 * PersistentAnchor Trait
 *
 * Anchor that survives session restarts via local or cloud storage.
 * Enables persistent AR content placement.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type StorageType = 'local' | 'cloud' | 'hybrid';
type AnchorState = 'unresolved' | 'resolving' | 'resolved' | 'tracking' | 'stale' | 'expired';

interface PersistentAnchorState {
  state: AnchorState;
  persistedId: string | null;
  isResolved: boolean;
  createdAt: number;
  lastResolvedAt: number;
  resolveAttempts: number;
  localPosition: { x: number; y: number; z: number };
  localRotation: { x: number; y: number; z: number; w: number };
  anchorHandle: unknown;
}

interface PersistentAnchorConfig {
  storage: StorageType;
  ttl: number; // milliseconds, 0 = forever
  auto_resolve: boolean;
  name: string;
  fallback_position: [number, number, number];
  max_resolve_attempts: number;
  resolve_timeout: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const persistentAnchorHandler: TraitHandler<PersistentAnchorConfig> = {
  name: 'persistent_anchor',

  defaultConfig: {
    storage: 'local',
    ttl: 86400000, // 24 hours
    auto_resolve: true,
    name: '',
    fallback_position: [0, 0, 0],
    max_resolve_attempts: 3,
    resolve_timeout: 10000,
  },

  onAttach(node, config, context) {
    const state: PersistentAnchorState = {
      state: 'unresolved',
      persistedId: null,
      isResolved: false,
      createdAt: Date.now(),
      lastResolvedAt: 0,
      resolveAttempts: 0,
      localPosition: { x: 0, y: 0, z: 0 },
      localRotation: { x: 0, y: 0, z: 0, w: 1 },
      anchorHandle: null,
    };
    (node as any).__persistentAnchorState = state;

    // Try to load existing anchor
    if (config.auto_resolve && config.name) {
      state.state = 'resolving';

      context.emit?.('persistent_anchor_load', {
        node,
        name: config.name,
        storage: config.storage,
      });
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__persistentAnchorState as PersistentAnchorState;

    // Save anchor before detaching if we have one
    if (state?.anchorHandle && config.name) {
      context.emit?.('persistent_anchor_save', {
        node,
        name: config.name,
        storage: config.storage,
        handle: state.anchorHandle,
        ttl: config.ttl,
      });
    }

    delete (node as any).__persistentAnchorState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__persistentAnchorState as PersistentAnchorState;
    if (!state) return;

    // Check TTL expiration
    if (config.ttl > 0 && state.isResolved) {
      const age = Date.now() - state.createdAt;
      if (age > config.ttl) {
        state.state = 'expired';
        state.isResolved = false;

        context.emit?.('on_persistent_anchor_expired', { node, name: config.name });
      } else if (age > config.ttl * 0.9) {
        state.state = 'stale';
      }
    }

    // Apply position from resolved anchor
    if (state.state === 'tracking' || state.state === 'resolved') {
      if ((node as any).position) {
        (node as any).position.x = state.localPosition.x;
        (node as any).position.y = state.localPosition.y;
        (node as any).position.z = state.localPosition.z;
      }
      if ((node as any).rotation) {
        (node as any).rotation.x = state.localRotation.x;
        (node as any).rotation.y = state.localRotation.y;
        (node as any).rotation.z = state.localRotation.z;
        if ((node as any).rotation.w !== undefined) {
          (node as any).rotation.w = state.localRotation.w;
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__persistentAnchorState as PersistentAnchorState;
    if (!state) return;

    if (event.type === 'persistent_anchor_loaded') {
      state.persistedId = event.id as string;
      state.anchorHandle = event.handle;
      state.isResolved = true;
      state.state = 'resolved';
      state.lastResolvedAt = Date.now();
      state.createdAt = (event.createdAt as number) || Date.now();

      context.emit?.('on_persistent_anchor_resolved', {
        node,
        name: config.name,
        id: state.persistedId,
      });
    } else if (event.type === 'persistent_anchor_not_found') {
      // No existing anchor - create new one
      state.resolveAttempts++;

      if (state.resolveAttempts >= config.max_resolve_attempts) {
        // Use fallback position
        state.localPosition = {
          x: config.fallback_position[0],
          y: config.fallback_position[1],
          z: config.fallback_position[2],
        };
        state.state = 'unresolved';

        context.emit?.('on_persistent_anchor_fallback', {
          node,
          fallbackPosition: config.fallback_position,
        });
      }
    } else if (event.type === 'persistent_anchor_pose_update') {
      state.localPosition = event.position as typeof state.localPosition;
      state.localRotation = event.rotation as typeof state.localRotation;
      state.state = 'tracking';
    } else if (event.type === 'persistent_anchor_create') {
      // Create new anchor at current position
      const pos = (node as any).position || { x: 0, y: 0, z: 0 };
      const rot = (node as any).rotation || { x: 0, y: 0, z: 0, w: 1 };

      context.emit?.('persistent_anchor_create_request', {
        node,
        name: config.name,
        storage: config.storage,
        position: pos,
        rotation: rot,
        ttl: config.ttl,
      });
    } else if (event.type === 'persistent_anchor_created') {
      state.persistedId = event.id as string;
      state.anchorHandle = event.handle;
      state.isResolved = true;
      state.state = 'resolved';
      state.createdAt = Date.now();
      state.lastResolvedAt = Date.now();

      context.emit?.('on_persistent_anchor_created', {
        node,
        name: config.name,
        id: state.persistedId,
      });
    } else if (event.type === 'persistent_anchor_delete') {
      context.emit?.('persistent_anchor_delete_request', {
        node,
        name: config.name,
        storage: config.storage,
        id: state.persistedId,
      });

      state.persistedId = null;
      state.isResolved = false;
      state.state = 'unresolved';
    } else if (event.type === 'persistent_anchor_query') {
      context.emit?.('persistent_anchor_info', {
        queryId: event.queryId,
        node,
        name: config.name,
        id: state.persistedId,
        state: state.state,
        createdAt: state.createdAt,
        lastResolvedAt: state.lastResolvedAt,
        ttlRemaining: config.ttl > 0 ? config.ttl - (Date.now() - state.createdAt) : Infinity,
      });
    }
  },
};

export default persistentAnchorHandler;
