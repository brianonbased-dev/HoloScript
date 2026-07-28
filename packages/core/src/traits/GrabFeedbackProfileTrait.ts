/**
 * GrabFeedbackProfile Trait
 *
 * Composite VR-interaction trait that bundles haptic, spatial audio, and
 * bloom feedback into a single declaration per grabbable object. Replaces
 * the manual trio of @haptic_cue + @spatial_audio_cue + @bloom_reactive
 * that must otherwise be kept in sync by hand.
 *
 * Proposed API (from vr-interactions.refreshed.hsplus A-009 wish):
 *
 *   @grab_feedback_profile {
 *     haptic: { grab: "soft_pulse", throw: "sharp_snap", intensity: 0.7 }
 *     audio:  { grab: "pickup.wav", release: "release.wav", volume: 0.6 }
 *     bloom:  { held_intensity: 2.5, idle_intensity: 0.8, ramp_ms: 80 }
 *   }
 *
 * At runtime the trait synthesises:
 *   - A haptic burst on grab / throw / release using the named presets.
 *   - Positional audio playback at grab and release events.
 *   - Smooth bloom (emissive) ramp from idle_intensity → held_intensity
 *     while the object is gripped, and back again when released.
 *
 * Event contract (emitted):
 *   grab_feedback_profile_attached   — on attach
 *   grab_feedback_profile_haptic     — haptic burst description: { event, preset, intensity }
 *   grab_feedback_profile_audio      — audio play request:       { event, url, volume, spatial }
 *   grab_feedback_profile_bloom      — bloom intensity sample:   { emissive, t, holding }
 *   grab_feedback_profile_detached   — on detach
 *
 * Event contract (listened):
 *   grab   / grabbed   — object picked up
 *   throw  / thrown    — object released with velocity
 *   release / released — object set down without throw
 *
 * Determinism contract:
 *   Bloom ramp is a linear lerp parameterised by wall-clock elapsed ms; same
 *   inputs produce byte-for-byte identical output across runtimes.
 *
 * Trait name: grab_feedback_profile
 * Category:   core-vr-interaction (composite)
 * Compile targets: all
 *
 * @version 1.0.0
 * @cites task_1780979310274_xi4g (A-009 example-driven request),
 *        examples/vr-interactions.refreshed.hsplus,
 *        HapticCueTrait, SpatialAudioCueTrait, BloomReactiveTrait
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Named haptic preset labels understood by the trait.
 * Names match the free-text patterns used in vr-interactions.refreshed.hsplus.
 */
export type GrabHapticPreset =
  | 'soft_pulse'
  | 'sharp_snap'
  | 'click'
  | 'rumble'
  | 'double_click'
  | 'buzz'
  | 'none';

export interface GrabFeedbackHapticConfig {
  /** Pattern fired on grab event. Default: 'soft_pulse'. */
  grab: GrabHapticPreset;
  /** Pattern fired on throw event. Default: 'sharp_snap'. */
  throw: GrabHapticPreset;
  /** Pattern fired on release (non-throw). Default: 'click'. */
  release: GrabHapticPreset;
  /** Haptic output intensity 0–1. Default: 0.7. */
  intensity: number;
  /** Duration in ms for each burst. Default: 100. */
  duration_ms: number;
}

export interface GrabFeedbackAudioConfig {
  /** Sound URL played on grab. Default: ''. */
  grab: string;
  /** Sound URL played on release (and throw). Default: ''. */
  release: string;
  /** Playback volume 0–1. Default: 0.6. */
  volume: number;
  /** Whether to spatialise the audio to the object position. Default: true. */
  spatial: boolean;
  /** Maximum audible distance (metres). Default: 6. */
  max_distance: number;
}

export interface GrabFeedbackBloomConfig {
  /** Emissive intensity while the object is NOT held. Default: 0.8. */
  idle_intensity: number;
  /** Emissive intensity while the object IS held. Default: 2.5. */
  held_intensity: number;
  /** Ramp time in ms for the lerp in both directions. Default: 80. */
  ramp_ms: number;
}

export interface GrabFeedbackProfileConfig {
  haptic: GrabFeedbackHapticConfig;
  audio: GrabFeedbackAudioConfig;
  bloom: GrabFeedbackBloomConfig;
}

interface GrabFeedbackProfileState {
  /** Whether the object is currently held. */
  holding: boolean;
  /** Wall-clock ms accumulated since the last state change (grab / release). */
  rampElapsedMs: number;
  /** Emissive intensity at the start of the current ramp (for lerp from). */
  rampFromEmissive: number;
  /** Emissive intensity at the end of the current ramp (for lerp to). */
  rampToEmissive: number;
  /** Current emissive value (updated each tick). */
  currentEmissive: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Linear interpolation, clamped to [0,1] in t.
 * Pure function — exposed for determinism tests.
 */
export function lerp(a: number, b: number, t: number): number {
  const tc = Math.min(1, Math.max(0, t));
  return a + (b - a) * tc;
}

/**
 * Derive the emissive intensity for a single tick.
 *
 * Pure function: same (rampElapsedMs, rampMs, from, to) → same output.
 */
export function deriveBloomEmissive(
  rampElapsedMs: number,
  rampMs: number,
  fromEmissive: number,
  toEmissive: number
): number {
  if (rampMs <= 0) return toEmissive;
  return lerp(fromEmissive, toEmissive, rampElapsedMs / rampMs);
}

// =============================================================================
// HANDLER
// =============================================================================

export const grabFeedbackProfileHandler: TraitHandler<GrabFeedbackProfileConfig> = {
  name: 'grab_feedback_profile',

  defaultConfig: {
    haptic: {
      grab: 'soft_pulse',
      throw: 'sharp_snap',
      release: 'click',
      intensity: 0.7,
      duration_ms: 100,
    },
    audio: {
      grab: '',
      release: '',
      volume: 0.6,
      spatial: true,
      max_distance: 6,
    },
    bloom: {
      idle_intensity: 0.8,
      held_intensity: 2.5,
      ramp_ms: 80,
    },
  },

  onAttach(node, config, context) {
    const state: GrabFeedbackProfileState = {
      holding: false,
      rampElapsedMs: 0,
      rampFromEmissive: config.bloom.idle_intensity,
      rampToEmissive: config.bloom.idle_intensity,
      currentEmissive: config.bloom.idle_intensity,
    };
    (node as unknown as Record<string, unknown>).__grabFeedbackProfileState = state;

    // Preload audio if supplied
    if (config.audio.grab) {
      context.emit?.('audio_preload', { url: config.audio.grab, node });
    }
    if (config.audio.release && config.audio.release !== config.audio.grab) {
      context.emit?.('audio_preload', { url: config.audio.release, node });
    }

    context.emit?.('grab_feedback_profile_attached', {
      node,
      haptic: config.haptic,
      audio: config.audio,
      bloom: config.bloom,
    });
  },

  onDetach(node, _config, context) {
    delete (node as unknown as Record<string, unknown>).__grabFeedbackProfileState;
    context.emit?.('grab_feedback_profile_detached', { node });
  },

  onUpdate(node, config, context, delta) {
    const state = (node as unknown as Record<string, unknown>).__grabFeedbackProfileState as
      | GrabFeedbackProfileState
      | undefined;
    if (!state) return;

    const rampMs = config.bloom.ramp_ms;

    // Advance ramp timer
    if (state.rampElapsedMs < rampMs || state.currentEmissive !== state.rampToEmissive) {
      state.rampElapsedMs += delta * 1000; // delta is seconds; rampMs is ms
      state.currentEmissive = deriveBloomEmissive(
        state.rampElapsedMs,
        rampMs,
        state.rampFromEmissive,
        state.rampToEmissive
      );
      context.emit?.('grab_feedback_profile_bloom', {
        node,
        emissive: state.currentEmissive,
        t: state.rampElapsedMs,
        holding: state.holding,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__grabFeedbackProfileState as
      | GrabFeedbackProfileState
      | undefined;
    if (!state) return;

    const isGrab = event.type === 'grab' || event.type === 'grabbed';
    const isThrow = event.type === 'throw' || event.type === 'thrown';
    const isRelease = event.type === 'release' || event.type === 'released';

    // ── Grab ─────────────────────────────────────────────────────────────────
    if (isGrab && !state.holding) {
      state.holding = true;
      state.rampFromEmissive = state.currentEmissive;
      state.rampToEmissive = config.bloom.held_intensity;
      state.rampElapsedMs = 0;

      if (config.haptic.grab !== 'none') {
        context.emit?.('grab_feedback_profile_haptic', {
          node,
          event: 'grab',
          preset: config.haptic.grab,
          intensity: config.haptic.intensity,
          duration_ms: config.haptic.duration_ms,
        });
        context.emit?.('haptic_play', {
          node,
          pattern: config.haptic.grab,
          intensity: config.haptic.intensity,
          duration: config.haptic.duration_ms,
        });
      }

      if (config.audio.grab) {
        context.emit?.('grab_feedback_profile_audio', {
          node,
          event: 'grab',
          url: config.audio.grab,
          volume: config.audio.volume,
          spatial: config.audio.spatial,
        });
        context.emit?.('audio_cue_play', {
          node,
          url: config.audio.grab,
          volume: config.audio.volume,
          spatial: config.audio.spatial,
        });
      }
      return;
    }

    // ── Throw / Release ───────────────────────────────────────────────────────
    if ((isThrow || isRelease) && state.holding) {
      state.holding = false;
      state.rampFromEmissive = state.currentEmissive;
      state.rampToEmissive = config.bloom.idle_intensity;
      state.rampElapsedMs = 0;

      const hapticPreset = isThrow ? config.haptic.throw : config.haptic.release;
      if (hapticPreset !== 'none') {
        context.emit?.('grab_feedback_profile_haptic', {
          node,
          event: isThrow ? 'throw' : 'release',
          preset: hapticPreset,
          intensity: config.haptic.intensity,
          duration_ms: config.haptic.duration_ms,
        });
        context.emit?.('haptic_play', {
          node,
          pattern: hapticPreset,
          intensity: config.haptic.intensity,
          duration: config.haptic.duration_ms,
        });
      }

      if (config.audio.release) {
        context.emit?.('grab_feedback_profile_audio', {
          node,
          event: isThrow ? 'throw' : 'release',
          url: config.audio.release,
          volume: config.audio.volume,
          spatial: config.audio.spatial,
        });
        context.emit?.('audio_cue_play', {
          node,
          url: config.audio.release,
          volume: config.audio.volume,
          spatial: config.audio.spatial,
        });
      }
      return;
    }
  },
};

export default grabFeedbackProfileHandler;
