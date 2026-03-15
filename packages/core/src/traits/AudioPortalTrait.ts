/**
 * AudioPortal Trait
 *
 * Sound transmission through openings like doors, windows, and corridors.
 * Models diffraction and transmission loss between acoustic zones.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface AudioPortalState {
  isOpen: boolean;
  openAmount: number; // 0-1
  currentTransmission: number;
  sourceZone: string;
  targetZone: string;
  activeConnections: Set<string>; // Audio sources passing through
}

interface AudioPortalConfig {
  opening_size: number; // meters
  connected_zones: [string, string];
  transmission_loss: number; // dB
  diffraction: boolean;
  frequency_filtering: boolean;
  low_pass_frequency: number;
  open_by_default: boolean;
  max_sources: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const audioPortalHandler: TraitHandler<AudioPortalConfig> = {
  name: 'audio_portal',

  defaultConfig: {
    opening_size: 1,
    connected_zones: ['', ''],
    transmission_loss: 6,
    diffraction: true,
    frequency_filtering: true,
    low_pass_frequency: 8000,
    open_by_default: true,
    max_sources: 8,
  },

  onAttach(node, config, context) {
    const state: AudioPortalState = {
      isOpen: config.open_by_default,
      openAmount: config.open_by_default ? 1 : 0,
      currentTransmission: config.open_by_default ? 1 : 0,
      sourceZone: config.connected_zones[0],
      targetZone: config.connected_zones[1],
      activeConnections: new Set(),
    };
    (node as any).__audioPortalState = state;

    context.emit?.('audio_portal_register', {
      node,
      zones: config.connected_zones,
      openingSize: config.opening_size,
      transmissionLoss: config.transmission_loss,
      diffraction: config.diffraction,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('audio_portal_unregister', { node });
    delete (node as any).__audioPortalState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__audioPortalState as AudioPortalState;
    if (!state) return;

    // Smooth open/close transition
    const targetOpen = state.isOpen ? 1 : 0;
    const speed = delta * 3;

    if (state.openAmount < targetOpen) {
      state.openAmount = Math.min(state.openAmount + speed, targetOpen);
    } else if (state.openAmount > targetOpen) {
      state.openAmount = Math.max(state.openAmount - speed, targetOpen);
    }

    // Calculate transmission based on openness
    const dbLoss = config.transmission_loss * (1 - state.openAmount);
    state.currentTransmission = Math.pow(10, -dbLoss / 20);

    // Update portal audio processing
    if (state.activeConnections.size > 0) {
      context.emit?.('audio_portal_update', {
        node,
        transmission: state.currentTransmission,
        lowPassFreq: config.frequency_filtering
          ? config.low_pass_frequency * state.openAmount
          : 22000,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__audioPortalState as AudioPortalState;
    if (!state) return;

    if (event.type === 'audio_portal_open') {
      state.isOpen = true;
      context.emit?.('audio_portal_state_change', { node, isOpen: true });
    } else if (event.type === 'audio_portal_close') {
      state.isOpen = false;
      context.emit?.('audio_portal_state_change', { node, isOpen: false });
    } else if (event.type === 'audio_portal_set_openness') {
      state.openAmount = event.amount as number;
      state.isOpen = state.openAmount > 0;
    } else if (event.type === 'audio_source_route') {
      const sourceId = event.sourceId as string;
      const fromZone = event.fromZone as string;
      const toZone = event.toZone as string;

      // Check if source should pass through this portal
      if (
        (fromZone === state.sourceZone && toZone === state.targetZone) ||
        (fromZone === state.targetZone && toZone === state.sourceZone)
      ) {
        if (state.activeConnections.size < config.max_sources) {
          state.activeConnections.add(sourceId);

          context.emit?.('audio_portal_route_source', {
            node,
            sourceId,
            transmission: state.currentTransmission,
            diffraction: config.diffraction,
          });
        }
      }
    } else if (event.type === 'audio_source_unroute') {
      const sourceId = event.sourceId as string;
      state.activeConnections.delete(sourceId);
    } else if (event.type === 'audio_portal_query') {
      context.emit?.('audio_portal_info', {
        queryId: event.queryId,
        node,
        isOpen: state.isOpen,
        openAmount: state.openAmount,
        transmission: state.currentTransmission,
        zones: [state.sourceZone, state.targetZone],
        activeConnections: state.activeConnections.size,
      });
    }
  },
};

export default audioPortalHandler;
