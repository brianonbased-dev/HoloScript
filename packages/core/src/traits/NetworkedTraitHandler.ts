/**
 * Networked Trait Handler
 *
 * TraitHandler wrapper that bridges the NetworkedTrait class into the
 * VRTraitRegistry lifecycle (onAttach/onDetach/onUpdate/onEvent).
 *
 * This enables `@networked` to work in HoloScript+ compositions:
 *
 * ```hsplus
 * object "Player" {
 *   @networked {
 *     mode: "owner",
 *     syncProperties: ["position", "rotation", "health"],
 *     syncRate: 20,
 *     interpolation: true
 *   }
 *   position: [0, 1.6, 0]
 * }
 * ```
 *
 * The handler emits events that platform runtimes (e.g. Hololand's
 * NetworkedRuntime) listen to for actual network transport.
 *
 * P.NET.01: syncTier auto-configures mode, frequency, and delivery.
 * P.NET.03: Priority accumulator for proximity-weighted sync rates.
 * W.NET.05: Separate agent_state event for AI agent sync.
 *
 * @version 2.0.0
 */

import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';
import { NetworkedTrait, type NetworkedConfig } from './NetworkedTrait';
import type { SyncTier } from '../network/NetworkTypes';
import { SYNC_TIER_RATES } from '../network/NetworkTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Runtime state stored per node */
interface HandlerState {
  trait: NetworkedTrait;
  syncAccumulator: number;
  registered: boolean;
  /** P.NET.03: Priority weight (0-1) based on proximity to nearest player */
  priorityWeight: number;
  /** W.NET.05: Whether this is an AI agent entity */
  isAgent: boolean;
}

// Internal state map
const handlerStates = new Map<string, HandlerState>();

function getNodeKey(node: HSPlusNode): string {
  return node.id || `__anon_${Math.random().toString(36).slice(2, 8)}`;
}

function nodePosition(node: HSPlusNode): [number, number, number] {
  const p = node.properties?.position;
  if (!p) return [0, 0, 0];
  if (Array.isArray(p)) return [p[0] || 0, p[1] || 0, p[2] || 0];
  const v = p as { x: number; y: number; z: number };
  return [v.x || 0, v.y || 0, v.z || 0];
}

function nodeRotation(node: HSPlusNode): [number, number, number] {
  const r = node.properties?.rotation;
  if (!r) return [0, 0, 0];
  if (Array.isArray(r)) return [r[0] || 0, r[1] || 0, r[2] || 0];
  const v = r as { x: number; y: number; z: number };
  return [v.x || 0, v.y || 0, v.z || 0];
}

// =============================================================================
// Default Config (matches NetworkedConfig)
// =============================================================================

interface NetworkedHandlerConfig {
  /** Sync mode: 'owner' | 'shared' | 'server' */
  mode: 'owner' | 'shared' | 'server';
  /** Properties to sync */
  syncProperties: string[];
  /** Updates per second */
  syncRate: number;
  /** Network channel */
  channel: 'reliable' | 'unreliable' | 'ordered';
  /** Enable interpolation for smooth remote movement */
  interpolation: boolean;
  /** Interpolation delay in ms */
  interpolation_delay: number;
  /** Can ownership be transferred */
  transferable: boolean;
  /** Auto-claim authority on grab */
  auto_claim_on_interact: boolean;
  /** Room/channel ID */
  room: string;
  /** Persistence */
  persistence: boolean;
  /** P.NET.01: Sync tier — auto-configures defaults */
  syncTier: SyncTier;
  /** W.NET.05: Whether this entity is an AI agent */
  isAgent: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const networkedHandler: TraitHandler<NetworkedHandlerConfig> = {
  name: 'networked' as any,

  defaultConfig: {
    mode: 'owner',
    syncProperties: ['position', 'rotation'],
    syncRate: 20,
    channel: 'unreliable',
    interpolation: true,
    interpolation_delay: 100,
    transferable: true,
    auto_claim_on_interact: true,
    room: 'default',
    persistence: false,
    syncTier: 'movement',
    isAgent: false,
  },

  // ===========================================================================
  // onAttach
  // ===========================================================================
  onAttach(node: HSPlusNode, config: NetworkedHandlerConfig, context: TraitContext): void {
    const key = getNodeKey(node);

    // Create NetworkedTrait instance with merged config
    const trait = new NetworkedTrait({
      mode: config.mode,
      syncProperties: config.syncProperties,
      syncRate: config.syncRate,
      channel: config.channel,
      interpolation: config.interpolation
        ? {
            enabled: true,
            delay: config.interpolation_delay,
            mode: 'linear',
            maxExtrapolation: 200,
            snapThreshold: 5,
          }
        : false,
      authority: {
        transferable: config.transferable,
        autoClaimOnInteract: config.auto_claim_on_interact,
      },
      room: config.room,
      persistence: config.persistence ? { enabled: true, saveOnDisconnect: true } : undefined,
    });

    const state: HandlerState = {
      trait,
      syncAccumulator: 0,
      registered: true,
      priorityWeight: 1.0,
      isAgent: config.isAgent,
    };

    handlerStates.set(key, state);

    // Emit registration event for platform runtime to pick up
    context.emit('networked:register', {
      nodeId: node.id,
      entityId: trait.getEntityId(),
      config: {
        mode: config.mode,
        syncProperties: config.syncProperties,
        syncRate: config.syncRate,
        channel: config.channel,
        interpolation: config.interpolation,
        transferable: config.transferable,
        room: config.room,
      },
    });

    // Store network metadata in node state
    context.setState({
      __networkId: trait.getEntityId(),
      __networked: true,
      __networkMode: config.mode,
    });
  },

  // ===========================================================================
  // onDetach
  // ===========================================================================
  onDetach(node: HSPlusNode, _config: NetworkedHandlerConfig, context: TraitContext): void {
    const key = getNodeKey(node);
    const state = handlerStates.get(key);

    if (state) {
      state.trait.disconnect();
      state.registered = false;

      context.emit('networked:unregister', {
        nodeId: node.id,
        entityId: state.trait.getEntityId(),
      });

      context.setState({
        __networkId: null,
        __networked: false,
        __networkMode: null,
      });

      handlerStates.delete(key);
    }
  },

  // ===========================================================================
  // onUpdate — per-frame sync
  // ===========================================================================
  onUpdate(
    node: HSPlusNode,
    config: NetworkedHandlerConfig,
    context: TraitContext,
    delta: number
  ): void {
    const key = getNodeKey(node);
    const state = handlerStates.get(key);
    if (!state || !state.registered) return;

    const trait = state.trait;

    // P.NET.01: Use tier-based sync rate if syncTier is set
    const baseSyncRate = SYNC_TIER_RATES[config.syncTier] ?? config.syncRate;
    // P.NET.03: Priority-weighted effective sync rate
    const effectiveRate = baseSyncRate * state.priorityWeight;
    const syncIntervalMs = effectiveRate > 0 ? 1000 / effectiveRate : Infinity;

    // If local owner, push current position/rotation into the trait
    if (trait.isLocalOwner()) {
      const pos = nodePosition(node);
      const rot = nodeRotation(node);

      trait.setProperty('position', pos);
      trait.setProperty('rotation', rot);

      // Sync custom properties from node state
      const nodeState = context.getState();
      for (const prop of config.syncProperties) {
        if (prop !== 'position' && prop !== 'rotation' && prop !== 'scale') {
          if (nodeState[prop] !== undefined) {
            trait.setProperty(prop, nodeState[prop]);
          }
        }
      }

      // Rate-limited sync with priority-weighted interval
      state.syncAccumulator += delta * 1000;
      if (state.syncAccumulator >= syncIntervalMs) {
        state.syncAccumulator = 0;
        trait.syncToNetwork();
      }
    } else {
      // Remote object: apply interpolated state
      const interpolated = trait.getInterpolatedState(config.interpolation_delay);
      if (interpolated && node.properties) {
        node.properties.position = interpolated.position;
        node.properties.rotation = [
          interpolated.rotation[0],
          interpolated.rotation[1],
          interpolated.rotation[2],
        ];

        // Apply custom properties
        for (const [propKey, val] of Object.entries(interpolated.properties)) {
          if (propKey !== 'position' && propKey !== 'rotation' && propKey !== 'scale') {
            context.setState({ [propKey]: val });
          }
        }
      }
    }
  },

  // ===========================================================================
  // onEvent — handle grab/release/network events
  // ===========================================================================
  onEvent(
    node: HSPlusNode,
    config: NetworkedHandlerConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const key = getNodeKey(node);
    const state = handlerStates.get(key);
    if (!state) return;

    const trait = state.trait;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      // Auto-claim ownership on grab (shared mode)
      case 'grab_start': {
        if (config.auto_claim_on_interact && config.mode === 'shared') {
          trait.requestOwnership().then((granted) => {
            if (granted) {
              context.emit('networked:authority_claimed', {
                nodeId: node.id,
                entityId: trait.getEntityId(),
              });
            }
          });
        }
        break;
      }

      // Release ownership signal on throw (optional)
      case 'grab_end': {
        // Final high-priority sync on release
        const pos = nodePosition(node);
        const rot = nodeRotation(node);
        trait.setProperty('position', pos);
        trait.setProperty('rotation', rot);
        trait.syncToNetwork();
        break;
      }

      // Remote state received from platform runtime
      // W.NET.05: Separate event type for AI agent state
      case 'networked:remote_state':
      case 'networked:agent_state': {
        const data = (event as any).data || (event as any);
        if (!trait.isLocalOwner()) {
          trait.applyState(data);
        }
        break;
      }

      // Ownership granted by server/host
      case 'networked:authority_granted': {
        trait.setOwner(true, (event as any).peerId);
        break;
      }

      // Ownership revoked
      case 'networked:authority_revoked': {
        trait.setOwner(false, (event as any).peerId);
        break;
      }
    }
  },
};

export default networkedHandler;
