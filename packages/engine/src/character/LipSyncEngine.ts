/**
 * LipSyncEngine.ts
 *
 * Audio-driven viseme engine for character lip sync.
 * Maps audio phonemes → 15 visemes → FACS AU weights per frame.
 * Supports emotion overlay blending (30/70 emotion/viseme).
 *
 * @see W.243: 15 visemes cover all English phonemes
 * @see Characters as Code vision, Stage 7
 * @module character
 */

import { VISEME_15, EXPRESSION_PRESETS, type VisemeDefinition } from './FACSSystem';

// =============================================================================
// Types
// =============================================================================

export type AudioAnalysisMethod = 'rhubarb' | 'oculus_lipsync' | 'manual';

export interface LipSyncConfig {
  /** Audio analysis method */
  method: AudioAnalysisMethod;
  /** Blend speed between visemes (seconds). Default 0.08 */
  blendSpeed: number;
  /** Enable emotion overlay on top of visemes */
  emotionOverlay: boolean;
  /** Emotion blend ratio (0-1). 0.3 = 30% emotion, 70% viseme. Default 0.3 */
  emotionBlend: number;
  /** Smoothing factor for viseme transitions (0-1). Default 0.4 */
  smoothing: number;
}

export const DEFAULT_LIP_SYNC_CONFIG: LipSyncConfig = {
  method: 'rhubarb',
  blendSpeed: 0.08,
  emotionOverlay: true,
  emotionBlend: 0.3,
  smoothing: 0.4,
};

export interface VisemeKeyframe {
  /** Time in seconds from start of audio */
  time: number;
  /** Viseme name (one of the 15 standard visemes) */
  viseme: string;
  /** Optional weight override (default 1.0) */
  weight?: number;
}

export interface LipSyncTrack {
  /** Total duration of the audio in seconds */
  duration: number;
  /** Ordered viseme keyframes */
  keyframes: VisemeKeyframe[];
}

// =============================================================================
// Lip Sync Engine
// =============================================================================

/**
 * Evaluates lip sync AU weights for a given time position.
 *
 * Handles:
 * - Viseme interpolation between keyframes
 * - Emotion overlay blending
 * - Smoothing to prevent jarring transitions
 */
export class LipSyncEngine {
  private config: LipSyncConfig;
  private currentWeights: Map<number, number> = new Map();
  private targetWeights: Map<number, number> = new Map();
  private visemeMap: Map<string, VisemeDefinition> = new Map();

  constructor(config?: Partial<LipSyncConfig>) {
    this.config = { ...DEFAULT_LIP_SYNC_CONFIG, ...config };

    // Build viseme lookup
    for (const v of VISEME_15) {
      this.visemeMap.set(v.name, v);
    }
  }

  /**
   * Get the interpolated AU weights for a given time position in a lip sync track.
   *
   * @param track - The lip sync track with viseme keyframes
   * @param time - Current time position in seconds
   * @param emotion - Optional emotion name for overlay (e.g., 'happy', 'sad')
   * @param emotionIntensity - Emotion intensity 0-1
   * @returns Map of FACS AU id → weight
   */
  evaluate(
    track: LipSyncTrack,
    time: number,
    emotion?: string,
    emotionIntensity: number = 1.0
  ): Map<number, number> {
    // Find surrounding keyframes
    const { prev, next, t } = this.findBracketingKeyframes(track, time);

    // Compute target viseme weights
    this.targetWeights.clear();

    if (prev && next && t > 0) {
      // Interpolate between two visemes
      const prevDef = this.visemeMap.get(prev.viseme);
      const nextDef = this.visemeMap.get(next.viseme);
      const prevWeight = prev.weight ?? 1.0;
      const nextWeight = next.weight ?? 1.0;

      if (prevDef) {
        for (const [auStr, w] of Object.entries(prevDef.weights)) {
          const au = Number(auStr);
          const current = this.targetWeights.get(au) ?? 0;
          this.targetWeights.set(au, current + w * prevWeight * (1 - t));
        }
      }
      if (nextDef) {
        for (const [auStr, w] of Object.entries(nextDef.weights)) {
          const au = Number(auStr);
          const current = this.targetWeights.get(au) ?? 0;
          this.targetWeights.set(au, current + w * nextWeight * t);
        }
      }
    } else if (prev) {
      // Hold last viseme
      const prevDef = this.visemeMap.get(prev.viseme);
      const prevWeight = prev.weight ?? 1.0;
      if (prevDef) {
        for (const [auStr, w] of Object.entries(prevDef.weights)) {
          this.targetWeights.set(Number(auStr), w * prevWeight);
        }
      }
    }

    // Apply emotion overlay
    if (this.config.emotionOverlay && emotion) {
      const emotionPreset = EXPRESSION_PRESETS.find((e) => e.name === emotion);
      if (emotionPreset) {
        const emoBlend = this.config.emotionBlend * emotionIntensity;
        const visBlend = 1.0 - emoBlend;

        // Scale viseme weights down
        for (const [au, w] of this.targetWeights.entries()) {
          this.targetWeights.set(au, w * visBlend);
        }

        // Add emotion weights
        for (const [auStr, w] of Object.entries(emotionPreset.weights)) {
          const au = Number(auStr);
          const current = this.targetWeights.get(au) ?? 0;
          this.targetWeights.set(au, current + w * emoBlend);
        }
      }
    }

    // Smooth transition from current to target
    const alpha = this.config.smoothing;
    for (const [au, target] of this.targetWeights.entries()) {
      const current = this.currentWeights.get(au) ?? 0;
      this.currentWeights.set(au, current + (target - current) * alpha);
    }

    // Decay AUs no longer in target
    for (const [au, current] of this.currentWeights.entries()) {
      if (!this.targetWeights.has(au)) {
        const decayed = current * (1 - alpha);
        if (decayed < 0.001) {
          this.currentWeights.delete(au);
        } else {
          this.currentWeights.set(au, decayed);
        }
      }
    }

    return new Map(this.currentWeights);
  }

  /**
   * Reset the engine state. Call when switching audio tracks.
   */
  reset(): void {
    this.currentWeights.clear();
    this.targetWeights.clear();
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<LipSyncConfig> {
    return this.config;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private findBracketingKeyframes(
    track: LipSyncTrack,
    time: number
  ): { prev?: VisemeKeyframe; next?: VisemeKeyframe; t: number } {
    if (track.keyframes.length === 0) return { t: 0 };

    // Before first keyframe
    if (time <= track.keyframes[0].time) {
      return { prev: track.keyframes[0], t: 0 };
    }

    // After last keyframe
    if (time >= track.keyframes[track.keyframes.length - 1].time) {
      return { prev: track.keyframes[track.keyframes.length - 1], t: 0 };
    }

    // Find bracket
    for (let i = 0; i < track.keyframes.length - 1; i++) {
      const a = track.keyframes[i];
      const b = track.keyframes[i + 1];
      if (time >= a.time && time <= b.time) {
        const duration = b.time - a.time;
        const t = duration > 0 ? (time - a.time) / duration : 0;
        return { prev: a, next: b, t };
      }
    }

    return { prev: track.keyframes[track.keyframes.length - 1], t: 0 };
  }
}
