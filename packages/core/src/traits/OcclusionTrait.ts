/**
 * Occlusion Trait
 *
 * Handle object occlusion by real-world geometry in AR/MR.
 * Supports environment mesh, depth API, and hand occlusion.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type OcclusionMode = 'environment' | 'depth' | 'hands' | 'all' | 'custom';

interface OcclusionState {
  isOccluded: boolean;
  occlusionAmount: number;
  depthAvailable: boolean;
  handOcclusionActive: boolean;
  lastOcclusionUpdate: number;
  occludingObjects: string[];
  fadeProgress: number;
}

interface OcclusionConfig {
  mode: OcclusionMode;
  depth_api: boolean;
  edge_smoothing: boolean;
  fade_distance: number;
  hand_occlusion: boolean;
  occlusion_bias: number;
  soft_edges: boolean;
  soft_edge_width: number;
  priority: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const occlusionHandler: TraitHandler<OcclusionConfig> = {
  name: 'occlusion',

  defaultConfig: {
    mode: 'environment',
    depth_api: true,
    edge_smoothing: true,
    fade_distance: 0.5,
    hand_occlusion: true,
    occlusion_bias: 0.001,
    soft_edges: true,
    soft_edge_width: 0.02,
    priority: 0,
  },

  onAttach(node, config, context) {
    const state: OcclusionState = {
      isOccluded: false,
      occlusionAmount: 0,
      depthAvailable: false,
      handOcclusionActive: false,
      lastOcclusionUpdate: 0,
      occludingObjects: [],
      fadeProgress: 0,
    };
    (node as any).__occlusionState = state;

    context.emit?.('occlusion_enable', {
      node,
      mode: config.mode,
      depthApi: config.depth_api,
      handOcclusion: config.hand_occlusion,
      bias: config.occlusion_bias,
      softEdges: config.soft_edges,
      priority: config.priority,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('occlusion_disable', { node });
    delete (node as any).__occlusionState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__occlusionState as OcclusionState;
    if (!state) return;

    const targetFade = state.isOccluded ? 1 : 0;
    const fadeSpeed = (1 / config.fade_distance) * delta;

    if (state.fadeProgress < targetFade) {
      state.fadeProgress = Math.min(state.fadeProgress + fadeSpeed, targetFade);
    } else if (state.fadeProgress > targetFade) {
      state.fadeProgress = Math.max(state.fadeProgress - fadeSpeed, targetFade);
    }

    if (config.edge_smoothing && state.fadeProgress > 0 && state.fadeProgress < 1) {
      context.emit?.('set_opacity', {
        node,
        opacity: 1 - state.fadeProgress * state.occlusionAmount,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__occlusionState as OcclusionState;
    if (!state) return;

    if (event.type === 'occlusion_update') {
      const prevOccluded = state.isOccluded;
      state.isOccluded = event.isOccluded as boolean;
      state.occlusionAmount = (event.amount as number) ?? (state.isOccluded ? 1 : 0);
      state.occludingObjects = (event.occludingObjects as string[]) ?? [];
      state.lastOcclusionUpdate = Date.now();

      if (state.isOccluded && !prevOccluded) {
        context.emit?.('occlusion_start', { node, amount: state.occlusionAmount });
      } else if (!state.isOccluded && prevOccluded) {
        context.emit?.('occlusion_end', { node });
      }
    } else if (event.type === 'depth_available') {
      state.depthAvailable = event.available as boolean;
    } else if (event.type === 'hand_occlusion_update') {
      if (!config.hand_occlusion) return;
      state.handOcclusionActive = event.isOccludedByHand as boolean;
      if (state.handOcclusionActive) {
        state.isOccluded = true;
        state.occlusionAmount = Math.max(state.occlusionAmount, 0.5);
      }
    }
  },
};

export default occlusionHandler;
