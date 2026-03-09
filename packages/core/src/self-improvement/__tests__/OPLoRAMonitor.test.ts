import { describe, it, expect, beforeEach } from 'vitest';
import { OPLoRAMonitor, type OPLoRAMonitorConfig } from '../OPLoRAMonitor';

// =============================================================================
// TESTS
// =============================================================================

describe('OPLoRAMonitor', () => {
  let monitor: OPLoRAMonitor;

  beforeEach(() => {
    monitor = new OPLoRAMonitor({
      absoluteDropThreshold: 2,
      relativeDropThreshold: 0.05,
      minConstraintSatisfaction: 80,
      maxWeightRatio: 0.1,
      trendWindowSize: 10,
    });
  });

  // ---------------------------------------------------------------------------
  // Baseline management
  // ---------------------------------------------------------------------------

  describe('baseline management', () => {
    it('sets and retrieves baselines', () => {
      monitor.setBaseline('humaneval', 65.0);
      expect(monitor.getBaseline('humaneval')).toBe(65.0);
    });

    it('returns undefined for unset baselines', () => {
      expect(monitor.getBaseline('unknown')).toBeUndefined();
    });

    it('allows overwriting baselines', () => {
      monitor.setBaseline('humaneval', 65.0);
      monitor.setBaseline('humaneval', 70.0);
      expect(monitor.getBaseline('humaneval')).toBe(70.0);
    });
  });

  // ---------------------------------------------------------------------------
  // Benchmark recording
  // ---------------------------------------------------------------------------

  describe('recordBenchmark', () => {
    it('records measurements and updates stats', () => {
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 65.0 });
      const stats = monitor.getStats();
      expect(stats.totalBenchmarkMeasurements).toBe(1);
      expect(stats.currentStep).toBe(100);
    });

    it('tracks latest scores per benchmark', () => {
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 65.0 });
      monitor.recordBenchmark({ step: 200, benchmark: 'humaneval', score: 64.0 });
      monitor.recordBenchmark({ step: 100, benchmark: 'mbpp', score: 72.0 });

      const latest = monitor.getLatestScores();
      expect(latest['humaneval']).toBe(64.0);
      expect(latest['mbpp']).toBe(72.0);
    });

    it('returns no alerts when score is above baseline', () => {
      monitor.setBaseline('humaneval', 65.0);
      const alerts = monitor.recordBenchmark({
        step: 100,
        benchmark: 'humaneval',
        score: 66.0,
      });
      expect(alerts).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Benchmark forgetting alerts
  // ---------------------------------------------------------------------------

  describe('benchmark forgetting alerts', () => {
    it('raises critical alert when absolute drop exceeds threshold', () => {
      monitor.setBaseline('humaneval', 65.0);
      const alerts = monitor.recordBenchmark({
        step: 500,
        benchmark: 'humaneval',
        score: 62.5, // drop of 2.5 > threshold 2.0
      });

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const critical = alerts.find((a) => a.severity === 'critical');
      expect(critical).toBeDefined();
      expect(critical!.message).toContain('humaneval');
      expect(critical!.recommendation).toContain('orthogonalWeight');
    });

    it('raises warning alert when relative drop exceeds threshold', () => {
      monitor.setBaseline('humaneval', 65.0);
      // 5% of 65 = 3.25, so a drop of 3.4 exceeds relative threshold
      // But 3.4 > 2.0 (absoluteDropThreshold) so it will be critical
      // Use a case where absolute is within threshold but relative exceeds
      const relMonitor = new OPLoRAMonitor({
        absoluteDropThreshold: 5,
        relativeDropThreshold: 0.03, // 3% relative threshold
      });
      relMonitor.setBaseline('humaneval', 65.0);
      const alerts = relMonitor.recordBenchmark({
        step: 500,
        benchmark: 'humaneval',
        score: 62.5, // absolute: 2.5 < 5, relative: 2.5/65 = 3.8% > 3%
      });

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const warning = alerts.find((a) => a.severity === 'warning');
      expect(warning).toBeDefined();
    });

    it('does not alert when drop is within both thresholds', () => {
      monitor.setBaseline('humaneval', 65.0);
      const alerts = monitor.recordBenchmark({
        step: 500,
        benchmark: 'humaneval',
        score: 64.5, // drop of 0.5 < 2.0 (absolute) and < 5% (relative)
      });

      // May have info-level trend alerts but no warning/critical
      const serious = alerts.filter((a) => a.severity === 'warning' || a.severity === 'critical');
      expect(serious).toHaveLength(0);
    });

    it('does not alert when no baseline is set', () => {
      const alerts = monitor.recordBenchmark({
        step: 500,
        benchmark: 'humaneval',
        score: 50.0,
      });
      expect(alerts).toHaveLength(0);
    });

    it('detects negative trend and raises info alert', () => {
      monitor.setBaseline('humaneval', 65.0);
      // Record declining scores within thresholds
      const scores = [64.9, 64.8, 64.7, 64.5, 64.3];
      let lastAlerts: ReturnType<typeof monitor.recordBenchmark> = [];
      for (let i = 0; i < scores.length; i++) {
        lastAlerts = monitor.recordBenchmark({
          step: (i + 1) * 100,
          benchmark: 'humaneval',
          score: scores[i],
        });
      }

      // At some point we should see an info-level trend alert
      const allAlerts = monitor.getAlerts('info');
      const trendAlerts = allAlerts.filter((a) => a.message.includes('negative trend'));
      expect(trendAlerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Weight ratio alerts
  // ---------------------------------------------------------------------------

  describe('weight ratio alerts', () => {
    it('raises warning when weight ratio exceeds threshold', () => {
      const alerts = monitor.recordWeightRatio({
        moduleName: 'q_proj',
        step: 100,
        loraDeltaNorm: 0.15,
        baseWeightNorm: 1.0,
        ratio: 0.15, // > 0.1 threshold
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].message).toContain('q_proj');
    });

    it('does not alert when weight ratio is below threshold', () => {
      const alerts = monitor.recordWeightRatio({
        moduleName: 'q_proj',
        step: 100,
        loraDeltaNorm: 0.05,
        baseWeightNorm: 1.0,
        ratio: 0.05,
      });

      expect(alerts).toHaveLength(0);
    });

    it('updates current step from weight measurements', () => {
      monitor.recordWeightRatio({
        moduleName: 'q_proj',
        step: 300,
        loraDeltaNorm: 0.05,
        baseWeightNorm: 1.0,
        ratio: 0.05,
      });

      expect(monitor.getStats().currentStep).toBe(300);
    });
  });

  // ---------------------------------------------------------------------------
  // Constraint satisfaction alerts
  // ---------------------------------------------------------------------------

  describe('constraint satisfaction alerts', () => {
    it('raises warning when overall satisfaction drops below threshold', () => {
      const alerts = monitor.recordConstraint({
        step: 100,
        satisfactionPct: 75, // < 80% threshold
        perModule: {},
      });

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].message).toContain('75');
    });

    it('raises critical alert when satisfaction drops well below threshold', () => {
      const alerts = monitor.recordConstraint({
        step: 100,
        satisfactionPct: 50, // < 80% * 0.75 = 60%
        perModule: {},
      });

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const critical = alerts.find((a) => a.severity === 'critical');
      expect(critical).toBeDefined();
    });

    it('does not alert when satisfaction is above threshold', () => {
      const alerts = monitor.recordConstraint({
        step: 100,
        satisfactionPct: 95,
        perModule: {},
      });

      expect(alerts).toHaveLength(0);
    });

    it('raises critical alert for per-module low satisfaction', () => {
      const alerts = monitor.recordConstraint({
        step: 100,
        satisfactionPct: 85, // Overall OK
        perModule: {
          q_proj: 95,
          k_proj: 30, // < 80% * 0.5 = 40% → critical
        },
      });

      const critical = alerts.filter((a) => a.severity === 'critical');
      expect(critical.length).toBeGreaterThanOrEqual(1);
      expect(critical[0].message).toContain('k_proj');
    });

    it('returns latest constraint', () => {
      monitor.recordConstraint({
        step: 100,
        satisfactionPct: 90,
        perModule: { q_proj: 92 },
      });
      monitor.recordConstraint({
        step: 200,
        satisfactionPct: 85,
        perModule: { q_proj: 87 },
      });

      const latest = monitor.getLatestConstraint();
      expect(latest).toBeDefined();
      expect(latest!.step).toBe(200);
      expect(latest!.satisfactionPct).toBe(85);
    });

    it('returns undefined when no constraints recorded', () => {
      expect(monitor.getLatestConstraint()).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Alert queries
  // ---------------------------------------------------------------------------

  describe('alert queries', () => {
    beforeEach(() => {
      monitor.setBaseline('humaneval', 65.0);
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 62.0 });
      monitor.recordConstraint({ step: 100, satisfactionPct: 70, perModule: {} });
    });

    it('getAlerts returns all alerts', () => {
      const alerts = monitor.getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });

    it('getAlerts filters by severity', () => {
      const criticals = monitor.getAlerts('critical');
      for (const a of criticals) {
        expect(a.severity).toBe('critical');
      }
    });

    it('getAlertsSinceStep filters by step', () => {
      monitor.recordBenchmark({ step: 200, benchmark: 'humaneval', score: 61.0 });
      const alerts = monitor.getAlertsSinceStep(150);
      for (const a of alerts) {
        expect(a.step).toBeGreaterThanOrEqual(150);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Benchmark history
  // ---------------------------------------------------------------------------

  describe('benchmark history', () => {
    it('returns filtered history for a benchmark', () => {
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 65.0 });
      monitor.recordBenchmark({ step: 100, benchmark: 'mbpp', score: 72.0 });
      monitor.recordBenchmark({ step: 200, benchmark: 'humaneval', score: 64.0 });

      const history = monitor.getBenchmarkHistory('humaneval');
      expect(history).toHaveLength(2);
      expect(history[0].score).toBe(65.0);
      expect(history[1].score).toBe(64.0);
    });

    it('returns empty array for unknown benchmark', () => {
      const history = monitor.getBenchmarkHistory('unknown');
      expect(history).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  describe('stats', () => {
    it('returns correct aggregate stats', () => {
      monitor.setBaseline('humaneval', 65.0);
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 64.0 });
      monitor.recordWeightRatio({
        moduleName: 'q_proj',
        step: 100,
        loraDeltaNorm: 0.05,
        baseWeightNorm: 1.0,
        ratio: 0.05,
      });
      monitor.recordConstraint({
        step: 100,
        satisfactionPct: 90,
        perModule: {},
      });

      const stats = monitor.getStats();
      expect(stats.totalBenchmarkMeasurements).toBe(1);
      expect(stats.totalWeightMeasurements).toBe(1);
      expect(stats.totalConstraintMeasurements).toBe(1);
      expect(stats.currentStep).toBe(100);
      expect(stats.latestScores['humaneval']).toBe(64.0);
      expect(stats.baselineScores['humaneval']).toBe(65.0);
    });

    it('counts alerts by severity', () => {
      monitor.setBaseline('humaneval', 65.0);
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 62.0 }); // critical
      monitor.recordConstraint({ step: 100, satisfactionPct: 70, perModule: {} }); // warning

      const stats = monitor.getStats();
      expect(stats.alertsBySeverity.critical).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  describe('snapshot', () => {
    it('returns a complete snapshot', () => {
      monitor.setBaseline('humaneval', 65.0);
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 64.0 });

      const snap = monitor.getSnapshot();
      expect(snap.config).toBeDefined();
      expect(snap.stats).toBeDefined();
      expect(snap.benchmarkHistory).toHaveLength(1);
      expect(snap.alerts).toBeDefined();
    });

    it('snapshot is a copy (does not leak internal state)', () => {
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 65.0 });
      const snap = monitor.getSnapshot();
      snap.benchmarkHistory.push({
        step: 999,
        benchmark: 'fake',
        score: 0,
        timestamp: 0,
      });
      expect(monitor.getBenchmarkHistory('fake')).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  describe('reset', () => {
    it('clears all state', () => {
      monitor.setBaseline('humaneval', 65.0);
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 60.0 });
      monitor.recordConstraint({ step: 100, satisfactionPct: 50, perModule: {} });

      monitor.reset();

      const stats = monitor.getStats();
      expect(stats.totalBenchmarkMeasurements).toBe(0);
      expect(stats.totalConstraintMeasurements).toBe(0);
      expect(stats.totalAlerts).toBe(0);
      expect(stats.currentStep).toBe(0);
      expect(monitor.getBaseline('humaneval')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles baseline of 0 without division by zero', () => {
      monitor.setBaseline('custom', 0);
      const alerts = monitor.recordBenchmark({
        step: 100,
        benchmark: 'custom',
        score: -1,
      });
      // Should not crash; absolute drop = 0 - (-1) = 1 < 2 threshold
      expect(alerts).toBeDefined();
    });

    it('handles very large step numbers', () => {
      monitor.recordBenchmark({
        step: 1_000_000,
        benchmark: 'humaneval',
        score: 65.0,
      });
      expect(monitor.getStats().currentStep).toBe(1_000_000);
    });

    it('handles multiple benchmarks independently', () => {
      monitor.setBaseline('humaneval', 65.0);
      monitor.setBaseline('mbpp', 72.0);

      // humaneval drops critically but mbpp is fine
      monitor.recordBenchmark({ step: 100, benchmark: 'humaneval', score: 60.0 });
      monitor.recordBenchmark({ step: 100, benchmark: 'mbpp', score: 71.5 });

      const alerts = monitor.getAlerts();
      const heAlerts = alerts.filter((a) => a.source === 'humaneval');
      const mbppAlerts = alerts.filter(
        (a) => a.source === 'mbpp' && (a.severity === 'warning' || a.severity === 'critical')
      );

      expect(heAlerts.length).toBeGreaterThan(0);
      expect(mbppAlerts).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  describe('custom config', () => {
    it('uses custom thresholds', () => {
      const strictMonitor = new OPLoRAMonitor({
        absoluteDropThreshold: 0.5,
        relativeDropThreshold: 0.01,
        minConstraintSatisfaction: 95,
        maxWeightRatio: 0.05,
      });

      strictMonitor.setBaseline('humaneval', 65.0);
      const alerts = strictMonitor.recordBenchmark({
        step: 100,
        benchmark: 'humaneval',
        score: 64.0, // drop of 1.0 > 0.5 threshold
      });

      const critical = alerts.find((a) => a.severity === 'critical');
      expect(critical).toBeDefined();
    });
  });
});
