/**
 * SpatialAudioCue Trait
 *
 * Audio landmarks for accessible navigation and feedback.
 * Supports earcons, voice announcements, and spatial beacons.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type CueType = 'navigation' | 'alert' | 'confirmation' | 'information' | 'error' | 'custom';
type Priority = 'low' | 'medium' | 'high' | 'critical';

interface SpatialAudioCueState {
  isPlaying: boolean;
  repeatTimer: number;
  playCount: number;
  isActive: boolean;
  lastPlayTime: number;
  queuedMessage: string | null;
}

interface SpatialAudioCueConfig {
  cue_type: CueType;
  earcon: string; // Audio file URL
  spatial: boolean;
  repeat_interval: number; // 0 = no repeat
  volume: number;
  priority: Priority;
  max_distance: number;
  tts_message: string; // Text-to-speech message
  interrupt_lower_priority: boolean;
}

// =============================================================================
// PRIORITY VALUES
// =============================================================================

const PRIORITY_VALUES: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// =============================================================================
// HANDLER
// =============================================================================

export const spatialAudioCueHandler: TraitHandler<SpatialAudioCueConfig> = {
  name: 'spatial_audio_cue',

  defaultConfig: {
    cue_type: 'navigation',
    earcon: '',
    spatial: true,
    repeat_interval: 0,
    volume: 1.0,
    priority: 'medium',
    max_distance: 10,
    tts_message: '',
    interrupt_lower_priority: true,
  },

  onAttach(node, config, context) {
    const state: SpatialAudioCueState = {
      isPlaying: false,
      repeatTimer: 0,
      playCount: 0,
      isActive: true,
      lastPlayTime: 0,
      queuedMessage: null,
    };
    node.__spatialAudioCueState = state;

    // Register cue with audio system
    context.emit?.('audio_cue_register', {
      node,
      type: config.cue_type,
      priority: PRIORITY_VALUES[config.priority],
      spatial: config.spatial,
      maxDistance: config.max_distance,
    });

    // Preload earcon if specified
    if (config.earcon) {
      context.emit?.('audio_preload', {
        url: config.earcon,
        node,
      });
    }
  },

  onDetach(node, config, context) {
    context.emit?.('audio_cue_unregister', { node });
    delete node.__spatialAudioCueState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__spatialAudioCueState as SpatialAudioCueState;
    if (!state || !state.isActive) return;

    // Handle repeat interval
    if (config.repeat_interval > 0 && !state.isPlaying) {
      state.repeatTimer += delta;

      if (state.repeatTimer >= config.repeat_interval) {
        state.repeatTimer = 0;

        // Play earcon
        if (config.earcon) {
          state.isPlaying = true;
          context.emit?.('audio_cue_play', {
            node,
            url: config.earcon,
            volume: config.volume,
            spatial: config.spatial,
            priority: PRIORITY_VALUES[config.priority],
          });
        }

        state.playCount++;
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__spatialAudioCueState as SpatialAudioCueState;
    if (!state) return;

    if (event.type === 'audio_cue_trigger') {
      // Manual trigger of cue
      const now = Date.now();

      // Check if we should interrupt current audio
      if (state.isPlaying && !config.interrupt_lower_priority) {
        return;
      }

      state.isPlaying = true;
      state.lastPlayTime = now;
      state.repeatTimer = 0;

      if (config.earcon) {
        context.emit?.('audio_cue_play', {
          node,
          url: config.earcon,
          volume: config.volume,
          spatial: config.spatial,
          priority: PRIORITY_VALUES[config.priority],
        });
      }

      // TTS message
      if (config.tts_message || event.message) {
        const message = (event.message as string) || config.tts_message;
        context.emit?.('tts_speak', {
          node,
          message,
          priority: PRIORITY_VALUES[config.priority],
          spatial: config.spatial,
        });
      }

      state.playCount++;
    } else if (event.type === 'audio_cue_complete') {
      state.isPlaying = false;
    } else if (event.type === 'audio_cue_stop') {
      state.isPlaying = false;
      state.repeatTimer = 0;
      context.emit?.('audio_stop', { node });
    } else if (event.type === 'audio_cue_activate') {
      state.isActive = true;
    } else if (event.type === 'audio_cue_deactivate') {
      state.isActive = false;
      if (state.isPlaying) {
        context.emit?.('audio_stop', { node });
      }
    } else if (event.type === 'listener_distance_update') {
      const distance = event.distance as number;

      // Auto-trigger when listener enters range
      if (distance <= config.max_distance && !state.isPlaying) {
        context.emit?.('audio_cue_trigger', { node });
      }
    }
  },
};

export default spatialAudioCueHandler;
