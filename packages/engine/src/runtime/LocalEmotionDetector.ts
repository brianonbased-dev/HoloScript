/**
 * @holoscript/core Local Emotion Detector
 *
 * Implements multimodal emotion inference based on behavioral signals,
 * head motion, and hand stability.
 */

import {
  EmotionDetector,
  EmotionConfig,
  EmotionSignals,
  EmotionInference,
} from './EmotionDetector';

export class LocalEmotionDetector implements EmotionDetector {
  private config?: EmotionConfig;
  private headStabilityHistory: number[] = [];
  private handStabilityHistory: number[] = [];
  private readonly WINDOW_SIZE = 10; // ~2 seconds at 5Hz

  constructor() {}

  async initialize(config: EmotionConfig): Promise<void> {
    this.config = config;
  }

  infer(signals: EmotionSignals): EmotionInference {
    // Record history for stability analysis
    this.headStabilityHistory.push(signals.headStability);
    this.handStabilityHistory.push(signals.handStability);

    if (this.headStabilityHistory.length > this.WINDOW_SIZE) {
      this.headStabilityHistory.shift();
    }
    if (this.handStabilityHistory.length > this.WINDOW_SIZE) {
      this.handStabilityHistory.shift();
    }

    // Calculate averages
    const avgHeadStability = this.getAverage(this.headStabilityHistory);
    const avgHandStability = this.getAverage(this.handStabilityHistory);

    // Heuristic: Low head stability (shaking) + high behavioral stress = Frustration
    let frustration = 0;
    if (avgHeadStability < 0.6 && signals.behavioralStressing > 0.5) {
      frustration = Math.min(1.0, signals.behavioralStressing * 1.2);
    } else {
      frustration = signals.behavioralStressing * 0.5;
    }

    // Heuristic: Low hand stability (tremor) = Stress/Clumsiness (Confusion)
    let confusion = 0;
    if (avgHandStability < 0.5) {
      confusion = Math.min(1.0, (1.0 - avgHandStability) * signals.interactionIntensity);
    }

    // Engagement: Based on intensity and stability
    const engagement = Math.min(1.0, signals.interactionIntensity * 0.8 + avgHeadStability * 0.2);

    // Determine primary state
    let primaryState: EmotionInference['primaryState'] = 'neutral';
    if (frustration > 0.7) primaryState = 'frustrated';
    else if (confusion > 0.7) primaryState = 'confused';
    else if (engagement > 0.8) primaryState = 'happy'; // Engaged users are "happy" in this simplified model

    return {
      frustration,
      confusion,
      engagement,
      primaryState,
    };
  }

  dispose(): void {
    this.headStabilityHistory = [];
    this.handStabilityHistory = [];
  }

  private getAverage(arr: number[]): number {
    if (arr.length === 0) return 1.0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
  }
}
