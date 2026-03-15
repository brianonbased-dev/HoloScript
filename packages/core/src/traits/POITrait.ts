/**
 * POI Trait
 *
 * Point of Interest with proximity triggers and navigation.
 * Used for landmarks, markers, and interactive locations.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface POIState {
  isInRange: boolean;
  isVisible: boolean;
  distanceToUser: number;
  wasTriggered: boolean;
  lastTriggerTime: number;
  userInTriggerZone: boolean;
}

interface POIConfig {
  name: string;
  description: string;
  category: string;
  icon: string;
  trigger_radius: number; // meters
  visible_radius: number; // meters
  navigation_target: boolean;
  show_distance: boolean;
  show_label: boolean;
  trigger_once: boolean;
  cooldown: number; // ms between triggers
  metadata: Record<string, unknown>;
}

// =============================================================================
// HANDLER
// =============================================================================

export const poiHandler: TraitHandler<POIConfig> = {
  name: 'poi',

  defaultConfig: {
    name: '',
    description: '',
    category: '',
    icon: '',
    trigger_radius: 10,
    visible_radius: 100,
    navigation_target: false,
    show_distance: true,
    show_label: true,
    trigger_once: false,
    cooldown: 1000,
    metadata: {},
  },

  onAttach(node, config, context) {
    const state: POIState = {
      isInRange: false,
      isVisible: false,
      distanceToUser: Infinity,
      wasTriggered: false,
      lastTriggerTime: 0,
      userInTriggerZone: false,
    };
    (node as any).__poiState = state;

    // Register POI with navigation system
    if (config.navigation_target) {
      context.emit?.('poi_register', {
        node,
        name: config.name,
        category: config.category,
        icon: config.icon,
      });
    }

    // Create visual marker
    if (config.show_label) {
      context.emit?.('poi_create_label', {
        node,
        name: config.name,
        icon: config.icon,
      });
    }
  },

  onDetach(node, config, context) {
    if (config.navigation_target) {
      context.emit?.('poi_unregister', { node });
    }
    delete (node as any).__poiState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__poiState as POIState;
    if (!state) return;

    // Calculate distance to user
    const userPos = context.player?.position;
    const nodePos = (node as { position?: { x: number; y: number; z: number } }).position;

    if (userPos && nodePos) {
      const dx = userPos.x - nodePos.x;
      const dy = userPos.y - nodePos.y;
      const dz = userPos.z - nodePos.z;
      state.distanceToUser = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Update visibility
      const wasVisible = state.isVisible;
      state.isVisible = state.distanceToUser <= config.visible_radius;

      if (state.isVisible !== wasVisible) {
        context.emit?.('poi_visibility_change', {
          node,
          visible: state.isVisible,
        });
      }

      // Update trigger zone
      const wasInTrigger = state.userInTriggerZone;
      state.userInTriggerZone = state.distanceToUser <= config.trigger_radius;

      // Check trigger conditions
      if (state.userInTriggerZone && !wasInTrigger) {
        const now = Date.now();
        const canTrigger = !config.trigger_once || !state.wasTriggered;
        const offCooldown = now - state.lastTriggerTime >= config.cooldown;

        if (canTrigger && offCooldown) {
          state.wasTriggered = true;
          state.lastTriggerTime = now;
          state.isInRange = true;

          context.emit?.('on_poi_proximity', {
            node,
            name: config.name,
            category: config.category,
            distance: state.distanceToUser,
            metadata: config.metadata,
          });
        }
      } else if (!state.userInTriggerZone && wasInTrigger) {
        state.isInRange = false;

        context.emit?.('on_poi_exit', {
          node,
          name: config.name,
        });
      }

      // Update distance display
      if (config.show_distance && state.isVisible) {
        context.emit?.('poi_update_distance', {
          node,
          distance: state.distanceToUser,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__poiState as POIState;
    if (!state) return;

    if (event.type === 'poi_navigate_to') {
      if (config.navigation_target) {
        context.emit?.('navigation_set_destination', {
          node,
          name: config.name,
        });
      }
    } else if (event.type === 'poi_reset') {
      state.wasTriggered = false;
      state.lastTriggerTime = 0;
    } else if (event.type === 'poi_set_metadata') {
      const key = event.key as string;
      const value = event.value;
      config.metadata[key] = value;
    } else if (event.type === 'poi_highlight') {
      context.emit?.('poi_show_highlight', {
        node,
        duration: (event.duration as number) || 2000,
        color: (event.color as string) || '#ffff00',
      });
    } else if (event.type === 'poi_show_info') {
      context.emit?.('poi_display_info', {
        node,
        name: config.name,
        description: config.description,
        category: config.category,
        metadata: config.metadata,
        distance: state.distanceToUser,
      });
    } else if (event.type === 'poi_query') {
      context.emit?.('poi_info', {
        queryId: event.queryId,
        node,
        name: config.name,
        category: config.category,
        isVisible: state.isVisible,
        isInRange: state.isInRange,
        distanceToUser: state.distanceToUser,
        wasTriggered: state.wasTriggered,
        metadata: config.metadata,
      });
    }
  },
};

export default poiHandler;
