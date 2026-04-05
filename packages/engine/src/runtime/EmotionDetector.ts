/**
 * @holoscript/core Emotion Detector Interface
 *
 * Defines the @builtin runtime interface for multimodal affective computing.
 * Runtimes implement this to bridge with ML models (ONNX/TFLite) for emotion inference.
 */

import type { Vector3 as _Vector3 } from '@holoscript/core';

/**
 * Multimodal signals for emotion inference
 */
export interface EmotionSignals {
  /** Head stability (1.0 = stable, 0.0 = high jitter/shaking) */
  headStability: number;

  /** Dominant hand stability (1.0 = stable, 0.0 = tremors/jitter) */
  handStability: number;

  /** Interaction intensity (e.g., clicks per second, force of movement) */
  interactionIntensity: number;

  /** Task failure rate or repeated interaction patterns */
  behavioralStressing: number;

  /** Optional audio-derived stress (from VoiceSynthesizer/SpeechRecognizer) */
  voiceStress?: number;
}

/**
 * Result of emotion inference
 */
export interface EmotionInference {
  /** Frustration level (0.0 to 1.0) */
  frustration: number;

  /** Confusion/Uncertainty level (0.0 to 1.0) */
  confusion: number;

  /** User engagement/Focus level (0.0 to 1.0) */
  engagement: number;

  /** Predicted primary affective state */
  primaryState: 'neutral' | 'happy' | 'angry' | 'sad' | 'scared' | 'confused' | 'frustrated';
}

/**
 * Emotion detector configuration
 */
export interface EmotionConfig {
  /** Mode of detection (e.g., 'passive', 'active', 'calibrated') */
  mode: string;

  /** Model identifier or path */
  modelId?: string;

  /** Sensitivity adjustment (0.0 to 1.0) */
  sensitivity?: number;
}

/**
 * EmotionDetector @builtin Interface
 */
export interface EmotionDetector {
  /** Initialize the detector with config */
  initialize(config: EmotionConfig): Promise<void>;

  /**
   * Infer emotional state from multimodal signals.
   * This is typically called at a lower frequency than the main loop (e.g., 5Hz).
   */
  infer(signals: EmotionSignals): EmotionInference;

  /** Dispose resources */
  dispose(): void;
}

/**
 * Global registry for builtin EmotionDetectors
 */
export const emotionDetectorRegistry = new Map<string, EmotionDetector>();

/**
 * Register an emotion detector implementation
 */
export function registerEmotionDetector(name: string, detector: EmotionDetector): void {
  emotionDetectorRegistry.set(name, detector);
}

/**
 * Get a registered emotion detector
 */
export function getEmotionDetector(name: string): EmotionDetector | undefined {
  return emotionDetectorRegistry.get(name);
}
