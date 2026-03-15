/**
 * Spectator Trait
 *
 * View-only participant mode for observers.
 * Supports different camera modes and streaming delay.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type CameraMode = 'free' | 'follow' | 'orbit' | 'fixed' | 'cinematic';

interface SpectatorState {
  isSpectating: boolean;
  spectatorCount: number;
  spectators: Map<string, { joinTime: number; cameraMode: CameraMode }>;
  activeCamera: CameraMode;
  followTarget: string | null;
  streamDelay: number;
}

interface SpectatorConfig {
  camera_mode: CameraMode;
  follow_target: string;
  can_interact: boolean;
  visible_to_participants: boolean;
  max_spectators: number;
  delay: number; // ms stream delay
  allowed_camera_modes: CameraMode[];
  broadcast_events: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const spectatorHandler: TraitHandler<SpectatorConfig> = {
  name: 'spectator',

  defaultConfig: {
    camera_mode: 'free',
    follow_target: '',
    can_interact: false,
    visible_to_participants: false,
    max_spectators: 50,
    delay: 0,
    allowed_camera_modes: ['free', 'follow', 'orbit'],
    broadcast_events: true,
  },

  onAttach(node, config, context) {
    const state: SpectatorState = {
      isSpectating: false,
      spectatorCount: 0,
      spectators: new Map(),
      activeCamera: config.camera_mode,
      followTarget: config.follow_target || null,
      streamDelay: config.delay,
    };
    (node as any).__spectatorState = state;

    // Initialize spectator system
    context.emit?.('spectator_init', {
      node,
      maxSpectators: config.max_spectators,
      delay: config.delay,
      visibleToParticipants: config.visible_to_participants,
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__spectatorState as SpectatorState;
    if (state?.spectatorCount > 0) {
      context.emit?.('spectator_end_all', { node });
    }
    delete (node as any).__spectatorState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__spectatorState as SpectatorState;
    if (!state) return;

    // Update follow camera if active
    if (state.activeCamera === 'follow' && state.followTarget) {
      context.emit?.('spectator_update_follow', {
        node,
        targetId: state.followTarget,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__spectatorState as SpectatorState;
    if (!state) return;

    if (event.type === 'spectator_join') {
      const spectatorId = event.spectatorId as string;

      if (state.spectatorCount >= config.max_spectators) {
        context.emit?.('spectator_rejected', {
          node,
          spectatorId,
          reason: 'max_capacity',
        });
        return;
      }

      state.spectators.set(spectatorId, {
        joinTime: Date.now(),
        cameraMode: config.camera_mode,
      });
      state.spectatorCount++;

      context.emit?.('spectator_setup', {
        node,
        spectatorId,
        cameraMode: config.camera_mode,
        canInteract: config.can_interact,
        delay: config.delay,
      });

      context.emit?.('on_spectator_join', {
        node,
        spectatorId,
        spectatorCount: state.spectatorCount,
      });
    } else if (event.type === 'spectator_leave') {
      const spectatorId = event.spectatorId as string;

      if (state.spectators.has(spectatorId)) {
        state.spectators.delete(spectatorId);
        state.spectatorCount--;

        context.emit?.('on_spectator_leave', {
          node,
          spectatorId,
          spectatorCount: state.spectatorCount,
        });
      }
    } else if (event.type === 'spectator_set_camera') {
      const spectatorId = event.spectatorId as string;
      const newMode = event.mode as CameraMode;

      if (!config.allowed_camera_modes.includes(newMode)) {
        return;
      }

      const spectator = state.spectators.get(spectatorId);
      if (spectator) {
        spectator.cameraMode = newMode;

        context.emit?.('spectator_camera_change', {
          node,
          spectatorId,
          mode: newMode,
          followTarget: newMode === 'follow' ? state.followTarget : undefined,
        });
      }
    } else if (event.type === 'spectator_set_follow') {
      const targetId = event.targetId as string;
      state.followTarget = targetId;

      // Update all spectators in follow mode
      for (const [spectatorId, spectator] of state.spectators) {
        if (spectator.cameraMode === 'follow') {
          context.emit?.('spectator_update_target', {
            node,
            spectatorId,
            targetId,
          });
        }
      }
    } else if (event.type === 'spectator_broadcast') {
      if (!config.broadcast_events) return;

      const eventData = event.data;

      // Broadcast to all spectators with optional delay
      if (state.streamDelay > 0) {
        setTimeout(() => {
          context.emit?.('spectator_event_broadcast', {
            node,
            data: eventData,
            spectatorCount: state.spectatorCount,
          });
        }, state.streamDelay);
      } else {
        context.emit?.('spectator_event_broadcast', {
          node,
          data: eventData,
          spectatorCount: state.spectatorCount,
        });
      }
    } else if (event.type === 'spectator_set_delay') {
      state.streamDelay = event.delay as number;
    } else if (event.type === 'spectator_toggle_visibility') {
      const visible = event.visible as boolean;

      context.emit?.('spectator_visibility_change', {
        node,
        visible,
      });
    } else if (event.type === 'spectator_query') {
      context.emit?.('spectator_info', {
        queryId: event.queryId,
        node,
        spectatorCount: state.spectatorCount,
        maxSpectators: config.max_spectators,
        activeCamera: state.activeCamera,
        followTarget: state.followTarget,
        delay: state.streamDelay,
        spectatorIds: Array.from(state.spectators.keys()),
      });
    }
  },
};

export default spectatorHandler;
