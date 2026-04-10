import { describe, it, expect } from 'vitest';
import { calculateQualityScore, QUALITY_WEIGHTS, type QualityMetrics } from '../QualityScore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetrics(overrides: Partial<QualityMetrics> = {}): QualityMetrics {
  return {
    testsPassed: 100,
    testsTotal: 100,
    coveragePercent: 80,
    typeCheckPassed: true,
    lintIssues: 0,
    lintFilesTotal: 50,
    circuitBreakerHealth: 90,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityScore', () => {
  describe('QUALITY_WEIGHTS', () => {
    it('weights sum to 1.0', () => {
      const sum =
        QUALITY_WEIGHTS.testPassRate +
        QUALITY_WEIGHTS.coverage +
        QUALITY_WEIGHTS.typeCheckPass +
        QUALITY_WEIGHTS.lintScore +
        QUALITY_WEIGHTS.circuitBreakerHealth;
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('has correct individual weights', () => {
      expect(QUALITY_WEIGHTS.testPassRate).toBe(0.3);
      expect(QUALITY_WEIGHTS.coverage).toBe(0.25);
      expect(QUALITY_WEIGHTS.typeCheckPass).toBe(0.2);
      expect(QUALITY_WEIGHTS.lintScore).toBe(0.1);
      expect(QUALITY_WEIGHTS.circuitBreakerHealth).toBe(0.15);
    });
  });

  describe('calculateQualityScore', () => {
    it('returns perfect score for perfect metrics', () => {
      const report = calculateQualityScore(
        makeMetrics({
          testsPassed: 100,
          testsTotal: 100,
          coveragePercent: 100,
          typeCheckPassed: true,
          lintIssues: 0,
          lintFilesTotal: 50,
          circuitBreakerHealth: 100,
        })
      );

      expect(report.score).toBe(1);
      expect(report.scorePercent).toBe(100);
      expect(report.status).toBe('excellent');
    });

    it('returns zero score for worst-case metrics', () => {
      const report = calculateQualityScore(
        makeMetrics({
          testsPassed: 0,
          testsTotal: 100,
          coveragePercent: 0,
          typeCheckPassed: false,
          lintIssues: 500,
          lintFilesTotal: 50,
          circuitBreakerHealth: 0,
        })
      );

      expect(report.score).toBe(0);
      expect(report.scorePercent).toBe(0);
      expect(report.status).toBe('critical');
    });

    it('handles zero total tests gracefully', () => {
      const report = calculateQualityScore(
        makeMetrics({
          testsPassed: 0,
          testsTotal: 0,
        })
      );
      // testPassRate should be 0 when total is 0
      expect(report.dimensions.testPassRate.raw).toBe(0);
    });

    it('handles zero lint files gracefully', () => {
      const report = calculateQualityScore(
        makeMetrics({
          lintIssues: 5,
          lintFilesTotal: 0,
        })
      );
      // Should use max(1, ...) to avoid division by zero
      expect(report.dimensions.lintScore.raw).toBeDefined();
    });

    it('clamps coverage above 100 to 1.0', () => {
      const report = calculateQualityScore(
        makeMetrics({
          coveragePercent: 150,
        })
      );
      expect(report.dimensions.coverage.raw).toBe(1);
    });

    it('clamps negative coverage to 0', () => {
      const report = calculateQualityScore(
        makeMetrics({
          coveragePercent: -10,
        })
      );
      expect(report.dimensions.coverage.raw).toBe(0);
    });

    it('typeCheckPass is binary 0 or 1', () => {
      const passing = calculateQualityScore(makeMetrics({ typeCheckPassed: true }));
      const failing = calculateQualityScore(makeMetrics({ typeCheckPassed: false }));

      expect(passing.dimensions.typeCheckPass.raw).toBe(1);
      expect(failing.dimensions.typeCheckPass.raw).toBe(0);
    });

    it('lint score decreases as issues increase', () => {
      const clean = calculateQualityScore(makeMetrics({ lintIssues: 0, lintFilesTotal: 10 }));
      const dirty = calculateQualityScore(makeMetrics({ lintIssues: 50, lintFilesTotal: 10 }));

      expect(clean.dimensions.lintScore.raw).toBeGreaterThan(dirty.dimensions.lintScore.raw);
    });

    it('circuit breaker health is normalised from 0-100 to 0-1', () => {
      const healthy = calculateQualityScore(makeMetrics({ circuitBreakerHealth: 100 }));
      const degraded = calculateQualityScore(makeMetrics({ circuitBreakerHealth: 50 }));

      expect(healthy.dimensions.circuitBreakerHealth.raw).toBe(1);
      expect(degraded.dimensions.circuitBreakerHealth.raw).toBe(0.5);
    });

    it('weighted contributions sum to the total score', () => {
      const report = calculateQualityScore(makeMetrics());
      const dimSum =
        report.dimensions.testPassRate.weighted +
        report.dimensions.coverage.weighted +
        report.dimensions.typeCheckPass.weighted +
        report.dimensions.lintScore.weighted +
        report.dimensions.circuitBreakerHealth.weighted;

      expect(dimSum).toBeCloseTo(report.score, 3);
    });

    it('includes ISO 8601 timestamp', () => {
      const report = calculateQualityScore(makeMetrics());
      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    describe('status labels', () => {
      it('excellent for score >= 0.90', () => {
        const report = calculateQualityScore(
          makeMetrics({
            testsPassed: 100,
            testsTotal: 100,
            coveragePercent: 95,
            typeCheckPassed: true,
            lintIssues: 0,
            lintFilesTotal: 10,
            circuitBreakerHealth: 95,
          })
        );
        expect(report.status).toBe('excellent');
      });

      it('good for score >= 0.75', () => {
        const report = calculateQualityScore(
          makeMetrics({
            testsPassed: 80,
            testsTotal: 100,
            coveragePercent: 75,
            typeCheckPassed: true,
            lintIssues: 5,
            lintFilesTotal: 10,
            circuitBreakerHealth: 80,
          })
        );
        expect(report.score).toBeGreaterThanOrEqual(0.75);
        expect(report.status).toBe('good');
      });

      it('critical for score < 0.35', () => {
        const report = calculateQualityScore(
          makeMetrics({
            testsPassed: 10,
            testsTotal: 100,
            coveragePercent: 5,
            typeCheckPassed: false,
            lintIssues: 100,
            lintFilesTotal: 10,
            circuitBreakerHealth: 10,
          })
        );
        expect(report.score).toBeLessThan(0.35);
        expect(report.status).toBe('critical');
      });
    });

    it('50% test pass rate contributes exactly 0.15', () => {
      // 0.5 * 0.30 = 0.15
      const report = calculateQualityScore(
        makeMetrics({
          testsPassed: 50,
          testsTotal: 100,
        })
      );
      expect(report.dimensions.testPassRate.weighted).toBeCloseTo(0.15, 4);
    });
  });
});
