/**
 * WoT Thing Trait
 *
 * Mark an object as a W3C Web of Things "Thing" for TD generation.
 * This trait enables automatic Thing Description generation from
 * HoloScript objects with @state blocks and event handlers.
 *
 * @version 1.0.0
 * @see https://www.w3.org/TR/wot-thing-description11/
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface WoTThingConfig {
  /** Thing title (required for TD) */
  title: string;
  /** Thing description */
  description?: string;
  /** Security scheme: nosec, basic, bearer, oauth2, apikey */
  security: 'nosec' | 'basic' | 'bearer' | 'oauth2' | 'apikey';
  /** Base URL for property/action/event endpoints */
  base?: string;
  /** Unique Thing ID (URN format recommended) */
  id?: string;
  /** Version string */
  version?: string;
  /** Enable automatic TD generation on startup */
  auto_generate?: boolean;
  /** Output path for generated TD file */
  output_path?: string;
}

export interface WoTThingState {
  /** Whether TD has been generated */
  tdGenerated: boolean;
  /** Last generation timestamp */
  lastGenerated: number;
  /** Generated TD JSON (cached) */
  cachedTD: string | null;
  /** Validation errors if any */
  validationErrors: string[];
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const defaultConfig: WoTThingConfig = {
  title: '',
  description: undefined,
  security: 'nosec',
  base: undefined,
  id: undefined,
  version: '1.0.0',
  auto_generate: false,
  output_path: undefined,
};

// =============================================================================
// HANDLER
// =============================================================================

export const wotThingHandler: TraitHandler<WoTThingConfig> = {
  name: 'wot_thing',

  defaultConfig,

  onAttach(node, config, context) {
    const state: WoTThingState = {
      tdGenerated: false,
      lastGenerated: 0,
      cachedTD: null,
      validationErrors: [],
    };
    node.__wotThingState = state;

    // Emit attach event for tracking
    context.emit('wot_thing_attached', {
      nodeId: node.name,
      config,
    });

    // Auto-generate TD if configured
    if (config.auto_generate) {
      // Defer generation to next tick to ensure node is fully initialized
      setTimeout(() => {
        context.emit('wot_thing_generate', { nodeId: node.name });
      }, 0);
    }
  },

  onDetach(node, _config, context) {
    const state = node.__wotThingState as WoTThingState | undefined;
    if (state) {
      context.emit('wot_thing_detached', {
        nodeId: node.name,
      });
    }
    delete node.__wotThingState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__wotThingState as WoTThingState | undefined;
    if (!state) return;

    // Check if state has changed and TD needs regeneration
    const nodeState = context.getState();
    const stateHash = JSON.stringify(nodeState);
    const cachedHash = node.__wotThingStateHash;
    const hadPreviousHash = cachedHash !== undefined;

    if (stateHash !== cachedHash) {
      node.__wotThingStateHash = stateHash;

      // Mark TD as stale only if we had a previous hash (not the first update)
      if (hadPreviousHash && state.tdGenerated) {
        state.cachedTD = null;
        context.emit('wot_thing_stale', {
          nodeId: node.name,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__wotThingState as WoTThingState | undefined;
    if (!state) return;

    // Handle generation request
    if (event.type === 'wot_generate_request') {
      context.emit('wot_thing_generate', {
        nodeId: node.name,
        config,
      });
    }

    // Handle TD generated event
    if (event.type === 'wot_td_generated') {
      state.tdGenerated = true;
      state.lastGenerated = Date.now();
      state.cachedTD = typeof (event as Record<string, unknown>).td === 'string' ? (event as Record<string, unknown>).td : null;
      state.validationErrors = Array.isArray((event as Record<string, unknown>).errors) ? (event as Record<string, unknown>).errors : [];
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a node has the @wot_thing trait
 */
export function hasWoTThingTrait(node: any): boolean {
  return !!node.__wotThingState;
}

/**
 * Get the WoT Thing state from a node
 */
export function getWoTThingState(node: any): WoTThingState | null {
  return node.__wotThingState || null;
}

/**
 * Get the cached TD from a node
 */
export function getCachedThingDescription(node: any): string | null {
  const state = getWoTThingState(node);
  return state?.cachedTD || null;
}

/**
 * Mark TD as needing regeneration
 */
export function invalidateThingDescription(node: any): void {
  const state = getWoTThingState(node);
  if (state) {
    state.cachedTD = null;
  }
}

export default wotThingHandler;
