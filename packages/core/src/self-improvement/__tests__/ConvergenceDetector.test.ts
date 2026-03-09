import { describe, it, expect, beforeEach } from 'vitest';
import { ConvergenceDetector } from '../ConvergenceDetector';

describe('ConvergenceDetector', () => {
  let detector: ConvergenceDetector;

  beforeEach(() => {
    detector = new ConvergenceDetector({
      minIterations: 5,
      windowSize: 5,
      epsilon: 0.005,
      slopeThreshold: 0.002,
      plateauBand: 0.01,
      plateauPatience: 8,
    });
  });

  // -------------------------------------------------------------------------
  // Basic recording
  // -------------------------------------------------------------------------

  describe('record', () => {
    it('increments iteration count', () => {
      detector.record(0.5);
      detector.record(0.6);
      expect(detector.getStatus().iterations).toBe(2);
    });

    it('tracks current score', () => {
      detector.record(0.5);
      detector.record(0.7);
      expect(detector.getStatus().currentScore).toBe(0.7);
    });

    it('tracks best score', () => {
      detector.record(0.5);
      detector.record(0.8);
      detector.record(0.6);
      expect(detector.getStatus().bestScore).toBe(0.8);
    });

    it('calculates total improvement from first to current', () => {
      detector.record(0.3);
      detector.record(0.5);
      detector.record(0.7);
      expect(detector.getStatus().totalImprovement).toBeCloseTo(0.4, 4);
    });
  });

  // -------------------------------------------------------------------------
  // No premature convergence
  // -------------------------------------------------------------------------

  describe('premature convergence prevention', () => {
    it('does not converge before minIterations', () => {
      // Record 4 identical scores (minIterations = 5)
      for (let i = 0; i < 4; i++) {
        const status = detector.record(0.8);
        expect(status.converged).toBe(false);
      }
    });

    it('does not converge with improving scores', () => {
      // Steadily improving -- slope too high
      const scores = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75];
      for (const s of scores) {
        const status = detector.record(s);
        expect(status.converged).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Epsilon window convergence
  // -------------------------------------------------------------------------

  describe('epsilon window convergence', () => {
    it('converges when scores flatline within epsilon', () => {
      // 5+ scores all within 0.005 of each other, near-zero slope
      const scores = [0.8, 0.801, 0.802, 0.801, 0.802];
      let status;
      for (const s of scores) {
        status = detector.record(s);
      }
      expect(status!.converged).toBe(true);
      expect(status!.reason).toBe('epsilon_window');
    });

    it('does not converge when one delta exceeds epsilon', () => {
      const scores = [0.8, 0.801, 0.81, 0.811, 0.812]; // 0.801 -> 0.81 = 0.009 > 0.005
      let status;
      for (const s of scores) {
        status = detector.record(s);
      }
      expect(status!.converged).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Plateau convergence
  // -------------------------------------------------------------------------

  describe('plateau convergence', () => {
    it('converges after plateauPatience consecutive scores within plateauBand', () => {
      const detector2 = new ConvergenceDetector({
        minIterations: 5,
        windowSize: 5,
        epsilon: 0.001, // tight epsilon so epsilon_window does not trigger
        slopeThreshold: 0.002,
        plateauBand: 0.02,
        plateauPatience: 6,
      });

      // First, establish best score
      detector2.record(0.85);
      // Then oscillate within 0.02 of 0.85 for 6+ iterations
      const plateau = [0.84, 0.85, 0.84, 0.835, 0.84, 0.845];
      let status;
      for (const s of plateau) {
        status = detector2.record(s);
      }
      expect(status!.converged).toBe(true);
      expect(status!.reason).toBe('plateau');
    });

    it('resets plateau count when score drops below band', () => {
      detector.record(0.9); // best
      detector.record(0.895); // within band
      detector.record(0.7); // drops well below → resets plateau
      expect(detector.getStatus().plateauCount).toBe(0);
    });

    it('resets plateau count on new best score', () => {
      detector.record(0.8);
      detector.record(0.795); // within band, plateau = 1
      detector.record(0.81); // new best → plateau resets to 0
      expect(detector.getStatus().plateauCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Window / slope
  // -------------------------------------------------------------------------

  describe('window and slope', () => {
    it('computes window average over last windowSize scores', () => {
      for (const s of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
        detector.record(s);
      }
      // window = [0.3, 0.4, 0.5, 0.6, 0.7]
      const status = detector.getStatus();
      expect(status.windowAverage).toBeCloseTo(0.5, 2);
    });

    it('computes positive slope for improving scores', () => {
      for (const s of [0.1, 0.2, 0.3, 0.4, 0.5]) {
        detector.record(s);
      }
      expect(detector.getStatus().windowSlope).toBeGreaterThan(0);
    });

    it('computes near-zero slope for flat scores', () => {
      for (const s of [0.8, 0.8, 0.8, 0.8, 0.8]) {
        detector.record(s);
      }
      expect(Math.abs(detector.getStatus().windowSlope)).toBeLessThan(0.001);
    });
  });

  // -------------------------------------------------------------------------
  // Snapshot and reset
  // -------------------------------------------------------------------------

  describe('snapshot', () => {
    it('includes full history', () => {
      detector.record(0.5);
      detector.record(0.6);
      const snap = detector.snapshot();
      expect(snap.history).toEqual([0.5, 0.6]);
    });

    it('includes config', () => {
      const snap = detector.snapshot();
      expect(snap.config.minIterations).toBe(5);
      expect(snap.config.windowSize).toBe(5);
    });

    it('returns a copy (does not leak internal state)', () => {
      detector.record(0.5);
      const snap = detector.snapshot();
      snap.history.push(999);
      expect(detector.getHistory()).toEqual([0.5]);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      detector.record(0.9);
      detector.record(0.91);
      detector.reset();

      const status = detector.getStatus();
      expect(status.iterations).toBe(0);
      expect(status.currentScore).toBe(0);
      expect(status.bestScore).toBe(0);
      expect(status.plateauCount).toBe(0);
    });
  });

  describe('getHistory', () => {
    it('returns a copy of scores', () => {
      detector.record(0.1);
      detector.record(0.2);
      const h = detector.getHistory();
      expect(h).toEqual([0.1, 0.2]);
      h.push(0.3);
      expect(detector.getHistory()).toEqual([0.1, 0.2]);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles single score without error', () => {
      const status = detector.record(0.5);
      expect(status.converged).toBe(false);
      expect(status.iterations).toBe(1);
    });

    it('handles zero scores', () => {
      for (let i = 0; i < 10; i++) {
        detector.record(0);
      }
      const status = detector.getStatus();
      expect(status.currentScore).toBe(0);
      // Should converge since all deltas are 0
      expect(status.converged).toBe(true);
    });

    it('handles negative slope (declining scores)', () => {
      for (const s of [0.9, 0.85, 0.8, 0.75, 0.7]) {
        detector.record(s);
      }
      expect(detector.getStatus().windowSlope).toBeLessThan(0);
    });
  });
});
