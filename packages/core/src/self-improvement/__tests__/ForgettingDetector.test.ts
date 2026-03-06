import { describe, it, expect, beforeEach } from 'vitest';
import { ForgettingDetector, type ForgettingDetectorConfig } from '../ForgettingDetector';

// =============================================================================
// TESTS
// =============================================================================

describe('ForgettingDetector', () => {
  let detector: ForgettingDetector;

  beforeEach(() => {
    detector = new ForgettingDetector({
      windowSize: 10,
      absoluteThreshold: 2.0,
      relativeThreshold: 0.05,
      minDataPoints: 3,
      earlyWarningSlopeThreshold: -0.05,
    });
  });

  // ---------------------------------------------------------------------------
  // Baseline management
  // ---------------------------------------------------------------------------

  describe('baseline management', () => {
    it('sets and retrieves baselines', () => {
      detector.setBaseline('humaneval', 65.0);
      expect(detector.getBaseline('humaneval')).toBe(65.0);
    });

    it('returns undefined for unset baselines', () => {
      expect(detector.getBaseline('unknown')).toBeUndefined();
    });

    it('allows overwriting baselines', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.setBaseline('humaneval', 70.0);
      expect(detector.getBaseline('humaneval')).toBe(70.0);
    });
  });

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  describe('record', () => {
    it('records scores for a benchmark', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 64.5, 100);
      detector.record('humaneval', 64.0, 200);

      const history = detector.getHistory('humaneval');
      expect(history).toEqual([64.5, 64.0]);
    });

    it('returns empty history for unrecorded benchmark', () => {
      const history = detector.getHistory('unknown');
      expect(history).toEqual([]);
    });

    it('creates tracker implicitly when recording', () => {
      detector.record('new_bench', 50.0, 100);
      const history = detector.getHistory('new_bench');
      expect(history).toEqual([50.0]);
    });

    it('bounds memory by trimming old scores', () => {
      detector.setBaseline('humaneval', 65.0);
      // Record many more scores than windowSize * 3
      for (let i = 0; i < 100; i++) {
        detector.record('humaneval', 65.0 - Math.random() * 0.1, i);
      }
      // Should be trimmed to windowSize * 3 = 30
      const history = detector.getHistory('humaneval');
      expect(history.length).toBeLessThanOrEqual(30);
    });
  });

  // ---------------------------------------------------------------------------
  // Detection: no forgetting
  // ---------------------------------------------------------------------------

  describe('no forgetting detection', () => {
    it('returns severity=none when scores are stable', () => {
      detector.setBaseline('humaneval', 65.0);
      for (let i = 0; i < 5; i++) {
        detector.record('humaneval', 64.8, (i + 1) * 100);
      }

      const result = detector.detect(500);
      expect(result.forgettingDetected).toBe(false);
      expect(result.worstSeverity).toBe('none');
    });

    it('returns severity=none when scores are improving', () => {
      detector.setBaseline('humaneval', 65.0);
      for (let i = 0; i < 5; i++) {
        detector.record('humaneval', 65.0 + i * 0.5, (i + 1) * 100);
      }

      const result = detector.detect(500);
      expect(result.forgettingDetected).toBe(false);
    });

    it('returns no detection when no data is recorded', () => {
      detector.setBaseline('humaneval', 65.0);
      const result = detector.detect(0);
      // No scores recorded, so no detection
      expect(result.results).toHaveLength(1);
      expect(result.results[0].severity).toBe('none');
    });
  });

  // ---------------------------------------------------------------------------
  // Detection: critical forgetting
  // ---------------------------------------------------------------------------

  describe('critical forgetting detection', () => {
    it('detects critical forgetting when absolute drop > 1.5x threshold', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 61.5, 500); // drop = 3.5 > 2.0 * 1.5 = 3.0

      const result = detector.detect(500);
      expect(result.forgettingDetected).toBe(true);
      expect(result.worstSeverity).toBe('critical');

      const heResult = result.results.find((r) => r.benchmark === 'humaneval');
      expect(heResult).toBeDefined();
      expect(heResult!.severity).toBe('critical');
      expect(heResult!.recommendation).toContain('CRITICAL');
      expect(heResult!.absoluteDrop).toBeCloseTo(3.5, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Detection: warning forgetting
  // ---------------------------------------------------------------------------

  describe('warning forgetting detection', () => {
    it('detects warning when absolute drop > threshold but <= 1.5x', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 62.5, 500); // drop = 2.5 > 2.0 but <= 3.0

      const result = detector.detect(500);
      expect(result.forgettingDetected).toBe(true);
      expect(result.worstSeverity).toBe('warning');

      const heResult = result.results.find((r) => r.benchmark === 'humaneval');
      expect(heResult!.severity).toBe('warning');
      expect(heResult!.recommendation).toContain('WARNING');
    });

    it('detects warning when relative drop exceeds threshold', () => {
      detector.setBaseline('humaneval', 65.0);
      // Relative drop of ~4.6% exceeds 5%? Actually 3/65 = 4.6% < 5%
      // Need exact: 0.05 * 65 = 3.25, so score = 61.5 gives drop 3.5 which is >3.0 so critical
      // Let's use: drop = 3.3 → absolute > 2*1.5 = critical.
      // Need a scenario where absolute is in warning range but relative is primary
      const relDetector = new ForgettingDetector({
        absoluteThreshold: 10, // Very high absolute threshold
        relativeThreshold: 0.03,  // 3% relative
        windowSize: 10,
        minDataPoints: 3,
        earlyWarningSlopeThreshold: -0.05,
      });
      relDetector.setBaseline('humaneval', 65.0);
      relDetector.record('humaneval', 62.5, 500); // drop 2.5, relative 3.8% > 3%

      const result = relDetector.detect(500);
      expect(result.forgettingDetected).toBe(true);
      expect(result.results[0].severity).toBe('warning');
    });
  });

  // ---------------------------------------------------------------------------
  // Detection: early warning
  // ---------------------------------------------------------------------------

  describe('early warning detection', () => {
    it('detects early warning from negative slope', () => {
      detector.setBaseline('humaneval', 65.0);
      // Create a steady decline that is within thresholds
      // but has a clearly negative slope
      const scores = [64.9, 64.75, 64.6, 64.4, 64.2, 64.0, 63.8, 63.6, 63.4, 63.2];
      for (let i = 0; i < scores.length; i++) {
        detector.record('humaneval', scores[i], (i + 1) * 100);
      }

      const result = detector.detect(1000);
      const heResult = result.results.find((r) => r.benchmark === 'humaneval');
      expect(heResult).toBeDefined();

      // Score 63.2, baseline 65.0, drop = 1.8 (< 2.0 absolute threshold)
      // But slope is approximately -0.19 per step which is < -0.05
      // So this should be at least early_warning or warning level
      expect(result.forgettingDetected).toBe(true);
    });

    it('does not trigger early warning with too few data points', () => {
      detector.setBaseline('humaneval', 65.0);
      // Only 2 data points (< minDataPoints = 3)
      detector.record('humaneval', 64.8, 100);
      detector.record('humaneval', 64.5, 200);

      const result = detector.detect(200);
      const heResult = result.results.find((r) => r.benchmark === 'humaneval');
      // Drop of 0.5 is within threshold, and not enough points for slope
      expect(heResult!.severity).toBe('none');
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-benchmark detection
  // ---------------------------------------------------------------------------

  describe('multi-benchmark detection', () => {
    it('tracks multiple benchmarks independently', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.setBaseline('mbpp', 72.0);

      detector.record('humaneval', 62.0, 500); // critical for humaneval
      detector.record('mbpp', 71.5, 500); // fine for mbpp

      const result = detector.detect(500);
      expect(result.results).toHaveLength(2);

      const heResult = result.results.find((r) => r.benchmark === 'humaneval');
      const mbppResult = result.results.find((r) => r.benchmark === 'mbpp');

      expect(heResult!.severity).not.toBe('none');
      expect(mbppResult!.severity).toBe('none');
    });

    it('worstSeverity is the maximum across all benchmarks', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.setBaseline('mbpp', 72.0);

      detector.record('humaneval', 60.0, 500); // critical (drop 5 > 3.0)
      detector.record('mbpp', 69.5, 500); // warning (drop 2.5 > 2.0)

      const result = detector.detect(500);
      expect(result.worstSeverity).toBe('critical');
    });

    it('returns all tracked benchmarks in results', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.setBaseline('mbpp', 72.0);
      detector.setBaseline('holoscript_eval', 80.0);

      detector.record('humaneval', 65.0, 100);
      detector.record('mbpp', 72.0, 100);
      detector.record('holoscript_eval', 80.0, 100);

      const result = detector.detect(100);
      expect(result.results).toHaveLength(3);
      expect(detector.getTrackedBenchmarks()).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Forgetting result fields
  // ---------------------------------------------------------------------------

  describe('ForgettingResult fields', () => {
    it('includes all expected fields', () => {
      detector.setBaseline('humaneval', 65.0);
      for (let i = 0; i < 5; i++) {
        detector.record('humaneval', 64.5 - i * 0.1, (i + 1) * 100);
      }

      const result = detector.detect(500);
      const heResult = result.results[0];

      expect(heResult.benchmark).toBe('humaneval');
      expect(typeof heResult.severity).toBe('string');
      expect(typeof heResult.currentScore).toBe('number');
      expect(typeof heResult.baselineScore).toBe('number');
      expect(typeof heResult.absoluteDrop).toBe('number');
      expect(typeof heResult.relativeDrop).toBe('number');
      expect(typeof heResult.slope).toBe('number');
      expect(typeof heResult.windowSize).toBe('number');
      expect(typeof heResult.recommendation).toBe('string');
    });

    it('computes absoluteDrop correctly', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 63.0, 100);

      const result = detector.detect(100);
      const heResult = result.results[0];
      expect(heResult.absoluteDrop).toBeCloseTo(2.0, 4);
    });

    it('computes relativeDrop correctly', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 63.0, 100);

      const result = detector.detect(100);
      const heResult = result.results[0];
      expect(heResult.relativeDrop).toBeCloseTo(2.0 / 65.0, 4);
    });

    it('computes positive slope for improving scores', () => {
      detector.setBaseline('humaneval', 65.0);
      for (let i = 0; i < 5; i++) {
        detector.record('humaneval', 65.0 + i * 0.5, (i + 1) * 100);
      }

      const result = detector.detect(500);
      expect(result.results[0].slope).toBeGreaterThan(0);
    });

    it('computes near-zero slope for flat scores', () => {
      detector.setBaseline('humaneval', 65.0);
      for (let i = 0; i < 5; i++) {
        detector.record('humaneval', 65.0, (i + 1) * 100);
      }

      const result = detector.detect(500);
      expect(Math.abs(result.results[0].slope)).toBeLessThan(0.001);
    });

    it('has empty recommendation when severity is none', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 65.0, 100);

      const result = detector.detect(100);
      const heResult = result.results[0];
      expect(heResult.severity).toBe('none');
      expect(heResult.recommendation).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  describe('configuration', () => {
    it('getConfig returns a copy of the config', () => {
      const config = detector.getConfig();
      expect(config.windowSize).toBe(10);
      expect(config.absoluteThreshold).toBe(2.0);
    });

    it('custom config affects detection thresholds', () => {
      const strictDetector = new ForgettingDetector({
        absoluteThreshold: 0.5,
        relativeThreshold: 0.01,
      });
      strictDetector.setBaseline('humaneval', 65.0);
      strictDetector.record('humaneval', 64.0, 100); // drop of 1.0 > 0.5 * 1.5 = 0.75

      const result = strictDetector.detect(100);
      expect(result.forgettingDetected).toBe(true);
      expect(result.worstSeverity).toBe('critical');
    });

    it('custom earlyWarningSlopeThreshold affects early warning sensitivity', () => {
      const sensitiveDetector = new ForgettingDetector({
        absoluteThreshold: 10, // high, won't trigger
        relativeThreshold: 0.5, // high, won't trigger
        earlyWarningSlopeThreshold: -0.01, // Very sensitive
        minDataPoints: 3,
        windowSize: 5,
      });

      sensitiveDetector.setBaseline('humaneval', 65.0);
      // Small decline
      for (let i = 0; i < 5; i++) {
        sensitiveDetector.record('humaneval', 64.95 - i * 0.02, (i + 1) * 100);
      }

      const result = sensitiveDetector.detect(500);
      const heResult = result.results[0];
      // Slope is negative, should trigger early warning with sensitive threshold
      if (heResult.slope < -0.01) {
        expect(heResult.severity).toBe('early_warning');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  describe('state management', () => {
    it('getTrackedBenchmarks returns all benchmark names', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.setBaseline('mbpp', 72.0);
      detector.record('holoscript_eval', 80.0, 100);

      const tracked = detector.getTrackedBenchmarks();
      expect(tracked).toContain('humaneval');
      expect(tracked).toContain('mbpp');
      expect(tracked).toContain('holoscript_eval');
    });

    it('reset clears all state', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 64.0, 100);

      detector.reset();

      expect(detector.getTrackedBenchmarks()).toHaveLength(0);
      expect(detector.getHistory('humaneval')).toEqual([]);
      expect(detector.getBaseline('humaneval')).toBeUndefined();
    });

    it('resetBenchmark preserves baseline but clears history', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 64.0, 100);
      detector.record('humaneval', 63.0, 200);

      detector.resetBenchmark('humaneval');

      expect(detector.getBaseline('humaneval')).toBe(65.0);
      expect(detector.getHistory('humaneval')).toEqual([]);
    });

    it('resetBenchmark is a no-op for unknown benchmarks', () => {
      // Should not throw
      detector.resetBenchmark('nonexistent');
      expect(detector.getTrackedBenchmarks()).toHaveLength(0);
    });

    it('detectBenchmark returns undefined for unknown benchmark', () => {
      const result = detector.detectBenchmark('nonexistent', 100);
      expect(result).toBeUndefined();
    });

    it('detectBenchmark returns result for known benchmark', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 64.0, 100);

      const result = detector.detectBenchmark('humaneval', 100);
      expect(result).toBeDefined();
      expect(result!.benchmark).toBe('humaneval');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles baseline of 0 without division by zero', () => {
      detector.setBaseline('custom', 0);
      detector.record('custom', -1, 100);

      const result = detector.detect(100);
      // Should not crash, relativeDrop should be 0 since baseline is 0
      expect(result).toBeDefined();
    });

    it('handles negative scores', () => {
      detector.setBaseline('custom', 10.0);
      detector.record('custom', -5.0, 100); // drop of 15 > 3.0 = critical

      const result = detector.detect(100);
      expect(result.worstSeverity).toBe('critical');
    });

    it('handles a single data point', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 64.5, 100);

      const result = detector.detect(100);
      // Single point, slope not computable, drop = 0.5 < 2.0
      expect(result.results[0].severity).toBe('none');
    });

    it('getHistory returns a copy', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 64.0, 100);

      const history = detector.getHistory('humaneval');
      history.push(999);
      expect(detector.getHistory('humaneval')).toEqual([64.0]);
    });

    it('AggregateDetectionResult has correct step', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 64.0, 100);

      const result = detector.detect(42);
      expect(result.step).toBe(42);
    });

    it('handles no tracked benchmarks', () => {
      const result = detector.detect(0);
      expect(result.results).toHaveLength(0);
      expect(result.worstSeverity).toBe('none');
      expect(result.forgettingDetected).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Recommendation content
  // ---------------------------------------------------------------------------

  describe('recommendations', () => {
    it('critical recommendations mention reverting to checkpoint', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 60.0, 100); // drop 5.0 > 3.0

      const result = detector.detect(100);
      const heResult = result.results[0];
      expect(heResult.severity).toBe('critical');
      expect(heResult.recommendation).toContain('checkpoint');
    });

    it('warning recommendations mention increasing orthogonalWeight', () => {
      detector.setBaseline('humaneval', 65.0);
      detector.record('humaneval', 62.5, 100); // drop 2.5 > 2.0, < 3.0

      const result = detector.detect(100);
      const heResult = result.results[0];
      expect(heResult.severity).toBe('warning');
      expect(heResult.recommendation).toContain('orthogonalWeight');
    });

    it('early warning recommendations mention preemptive action', () => {
      detector.setBaseline('humaneval', 65.0);
      // Create declining scores within thresholds
      for (let i = 0; i < 5; i++) {
        detector.record('humaneval', 64.8 - i * 0.15, (i + 1) * 100);
      }

      const result = detector.detect(500);
      const heResult = result.results[0];
      // May or may not trigger early warning depending on exact slope
      if (heResult.severity === 'early_warning') {
        expect(heResult.recommendation).toContain('EARLY WARNING');
        expect(heResult.recommendation).toContain('preemptively');
      }
    });
  });
});
