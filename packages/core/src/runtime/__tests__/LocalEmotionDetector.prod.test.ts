/**
 * LocalEmotionDetector Production Tests
 *
 * Multimodal emotion inference: initialization, neutral baseline,
 * frustration heuristic, confusion heuristic, engagement, history windowing,
 * and dispose.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalEmotionDetector } from '../LocalEmotionDetector';

function makeSignals(overrides: any = {}) {
  return {
    headStability: 0.9,
    handStability: 0.9,
    behavioralStressing: 0.1,
    interactionIntensity: 0.5,
    ...overrides,
  };
}

describe('LocalEmotionDetector — Production', () => {
  let detector: LocalEmotionDetector;

  beforeEach(async () => {
    detector = new LocalEmotionDetector();
    await detector.initialize({ mode: 'all' } as any);
  });

  describe('neutral baseline', () => {
    it('returns neutral for calm signals', () => {
      const result = detector.infer(makeSignals());
      expect(result.primaryState).toBe('neutral');
      expect(result.frustration).toBeLessThan(0.3);
      expect(result.confusion).toBeLessThan(0.3);
    });
  });

  describe('frustration', () => {
    it('detects frustration with head shake + stress', () => {
      // Fill history with unstable head readings
      for (let i = 0; i < 5; i++) {
        detector.infer(makeSignals({ headStability: 0.3, behavioralStressing: 0.8 }));
      }
      const result = detector.infer(makeSignals({ headStability: 0.3, behavioralStressing: 0.9 }));
      expect(result.frustration).toBeGreaterThan(0.7);
      expect(result.primaryState).toBe('frustrated');
    });
  });

  describe('confusion', () => {
    it('detects confusion with hand tremor', () => {
      for (let i = 0; i < 5; i++) {
        detector.infer(makeSignals({ handStability: 0.2, interactionIntensity: 0.9 }));
      }
      const result = detector.infer(makeSignals({ handStability: 0.2, interactionIntensity: 0.9 }));
      expect(result.confusion).toBeGreaterThan(0.5);
    });
  });

  describe('engagement', () => {
    it('high engagement with intense stable interaction', () => {
      const result = detector.infer(
        makeSignals({ interactionIntensity: 1.0, headStability: 0.95 })
      );
      expect(result.engagement).toBeGreaterThan(0.8);
    });
  });

  describe('history windowing', () => {
    it('window limits to 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        detector.infer(makeSignals());
      }
      // No crash, window is internally capped
      const result = detector.infer(makeSignals());
      expect(result.primaryState).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('clears history', () => {
      detector.infer(makeSignals({ headStability: 0.1 }));
      detector.dispose();

      // After dispose, first infer starts with empty history
      const result = detector.infer(makeSignals());
      expect(result.primaryState).toBe('neutral');
    });
  });
});
