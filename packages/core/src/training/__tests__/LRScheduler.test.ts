import { describe, it, expect } from 'vitest';
import {
  LRScheduler,
  createSFTScheduler,
  createGRPOScheduler,
  DEFAULT_LR_SCHEDULER_CONFIG,
  GRPO_LR_SCHEDULER_CONFIG,
} from '../LRScheduler';

// =============================================================================
// TESTS
// =============================================================================

describe('LRScheduler', () => {
  // ---------------------------------------------------------------------------
  // CONSTRUCTION & CONFIGURATION
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('uses default config when no overrides provided', () => {
      const scheduler = new LRScheduler();
      const config = scheduler.getConfig();
      expect(config).toEqual(DEFAULT_LR_SCHEDULER_CONFIG);
    });

    it('merges partial config with defaults', () => {
      const scheduler = new LRScheduler({ baseLR: 1e-3, totalSteps: 5000 });
      const config = scheduler.getConfig();
      expect(config.baseLR).toBe(1e-3);
      expect(config.totalSteps).toBe(5000);
      expect(config.warmupRatio).toBe(DEFAULT_LR_SCHEDULER_CONFIG.warmupRatio);
    });

    it('throws on invalid baseLR (<= 0)', () => {
      expect(() => new LRScheduler({ baseLR: 0 })).toThrow('baseLR');
      expect(() => new LRScheduler({ baseLR: -1e-4 })).toThrow('baseLR');
    });

    it('throws on invalid totalSteps (negative)', () => {
      expect(() => new LRScheduler({ totalSteps: -1 })).toThrow('totalSteps');
    });

    it('throws on invalid totalSteps (non-integer)', () => {
      expect(() => new LRScheduler({ totalSteps: 100.5 })).toThrow(
        'totalSteps',
      );
    });

    it('throws on invalid warmupRatio (< 0)', () => {
      expect(() => new LRScheduler({ warmupRatio: -0.1 })).toThrow(
        'warmupRatio',
      );
    });

    it('throws on invalid warmupRatio (>= 1)', () => {
      expect(() => new LRScheduler({ warmupRatio: 1.0 })).toThrow(
        'warmupRatio',
      );
    });

    it('throws on invalid minLR (negative)', () => {
      expect(() => new LRScheduler({ minLR: -1 })).toThrow('minLR');
    });

    it('throws on invalid minLR (>= baseLR)', () => {
      expect(
        () => new LRScheduler({ baseLR: 1e-4, minLR: 1e-4 }),
      ).toThrow('minLR');
      expect(
        () => new LRScheduler({ baseLR: 1e-4, minLR: 2e-4 }),
      ).toThrow('minLR');
    });

    it('throws on invalid numCycles (< 1)', () => {
      expect(() => new LRScheduler({ numCycles: 0 })).toThrow('numCycles');
    });

    it('throws on invalid numCycles (non-integer)', () => {
      expect(() => new LRScheduler({ numCycles: 1.5 })).toThrow('numCycles');
    });

    it('accepts totalSteps of 0', () => {
      const scheduler = new LRScheduler({ totalSteps: 0 });
      expect(scheduler.getConfig().totalSteps).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // WARMUP PHASE
  // ---------------------------------------------------------------------------

  describe('warmup phase', () => {
    it('starts at LR = 0 at step 0', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
      });
      expect(scheduler.getLR(0)).toBe(0);
    });

    it('ramps linearly to baseLR during warmup', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1, // 100 warmup steps
      });

      // At step 50 (halfway through warmup), LR should be ~1e-4
      const lr50 = scheduler.getLR(50);
      expect(lr50).toBeCloseTo(1e-4, 6);

      // At step 100 (end of warmup), LR should be 2e-4
      const lr100 = scheduler.getLR(100);
      expect(lr100).toBeCloseTo(2e-4, 6);
    });

    it('warmup is linear (monotonically increasing)', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
      });

      let prevLR = -1;
      for (let step = 0; step <= 100; step++) {
        const lr = scheduler.getLR(step);
        expect(lr).toBeGreaterThanOrEqual(prevLR);
        prevLR = lr;
      }
    });

    it('computes correct warmup steps', () => {
      const scheduler = new LRScheduler({
        totalSteps: 10000,
        warmupRatio: 0.1,
      });
      expect(scheduler.getWarmupSteps()).toBe(1000);
    });

    it('warmup steps rounds down', () => {
      const scheduler = new LRScheduler({
        totalSteps: 1000,
        warmupRatio: 0.15, // 150 steps
      });
      expect(scheduler.getWarmupSteps()).toBe(150);
    });
  });

  // ---------------------------------------------------------------------------
  // COSINE DECAY PHASE
  // ---------------------------------------------------------------------------

  describe('cosine decay phase', () => {
    it('starts at baseLR after warmup', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 0,
      });

      // Right at the boundary of warmup -> decay
      const lr = scheduler.getLR(100);
      expect(lr).toBeCloseTo(2e-4, 6);
    });

    it('ends at minLR at totalSteps', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 1e-7,
      });

      const lr = scheduler.getLR(1000);
      expect(lr).toBeCloseTo(1e-7, 9);
    });

    it('ends at 0 when minLR is 0', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 0,
      });

      const lr = scheduler.getLR(1000);
      expect(lr).toBeCloseTo(0, 10);
    });

    it('decays monotonically during single-cycle cosine', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 0,
        numCycles: 1,
      });

      let prevLR = Infinity;
      for (let step = 100; step <= 1000; step += 10) {
        const lr = scheduler.getLR(step);
        expect(lr).toBeLessThanOrEqual(prevLR + 1e-12); // Allow tiny float errors
        prevLR = lr;
      }
    });

    it('midpoint of decay is approximately (baseLR + minLR) / 2', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 0,
        numCycles: 1,
      });

      // Midpoint of decay: step 550 (halfway between 100 and 1000)
      const lr = scheduler.getLR(550);
      const expectedMidpoint = (2e-4 + 0) / 2;
      expect(lr).toBeCloseTo(expectedMidpoint, 5);
    });
  });

  // ---------------------------------------------------------------------------
  // COSINE ANNEALING WITH WARM RESTARTS
  // ---------------------------------------------------------------------------

  describe('multiple cycles (warm restarts)', () => {
    it('with 2 cycles, LR returns to peak mid-training', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 0,
        numCycles: 2,
      });

      // At step 550, we should be halfway through cycle 2's rise back
      // The cosine with 2 cycles completes a full period across the decay phase
      // At step 550 (midpoint of decay), cos(2*pi*0.5) = cos(pi) = -1
      // (1 + (-1)) / 2 = 0 -> minLR
      const lrMid = scheduler.getLR(550);
      expect(lrMid).toBeCloseTo(0, 5);

      // At step 325 (quarter of decay), cos(2*pi*0.25) = cos(pi/2) = 0
      // (1 + 0) / 2 = 0.5 -> baseLR * 0.5
      const lrQuarter = scheduler.getLR(325);
      expect(lrQuarter).toBeCloseTo(1e-4, 5);
    });
  });

  // ---------------------------------------------------------------------------
  // EDGE CASES
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles totalSteps = 0', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 0,
        warmupRatio: 0.1,
      });

      // Step 0 should return baseLR since warmupSteps = 0
      const lr = scheduler.getLR(0);
      expect(lr).toBe(2e-4);
    });

    it('handles warmupRatio = 0 (no warmup)', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0,
        minLR: 0,
      });

      expect(scheduler.getWarmupSteps()).toBe(0);
      // Step 0 should already be at baseLR
      expect(scheduler.getLR(0)).toBeCloseTo(2e-4, 6);
      // End should be at minLR
      expect(scheduler.getLR(1000)).toBeCloseTo(0, 10);
    });

    it('clamps negative step to 0', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
      });

      expect(scheduler.getLR(-10)).toBe(scheduler.getLR(0));
    });

    it('clamps step beyond totalSteps', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 1e-7,
      });

      expect(scheduler.getLR(2000)).toBe(scheduler.getLR(1000));
    });

    it('handles very small totalSteps', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1,
        warmupRatio: 0.1,
      });

      // With 1 step and 10% warmup -> 0 warmup steps
      expect(scheduler.getWarmupSteps()).toBe(0);
      const lr0 = scheduler.getLR(0);
      const lr1 = scheduler.getLR(1);
      expect(lr0).toBeGreaterThan(0);
      expect(lr1).toBeLessThanOrEqual(lr0);
    });

    it('handles very large totalSteps', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1_000_000,
        warmupRatio: 0.1,
      });

      expect(scheduler.getWarmupSteps()).toBe(100_000);
      expect(scheduler.getLR(0)).toBe(0);
      expect(scheduler.getLR(100_000)).toBeCloseTo(2e-4, 6);
    });
  });

  // ---------------------------------------------------------------------------
  // SNAPSHOTS
  // ---------------------------------------------------------------------------

  describe('getSnapshot', () => {
    it('returns warmup phase during warmup', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
      });

      const snapshot = scheduler.getSnapshot(50);
      expect(snapshot.phase).toBe('warmup');
      expect(snapshot.step).toBe(50);
      expect(snapshot.phaseProgress).toBeCloseTo(0.5, 5);
      expect(snapshot.overallProgress).toBeCloseTo(0.05, 5);
      expect(snapshot.learningRate).toBeCloseTo(1e-4, 6);
    });

    it('returns decay phase after warmup', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
      });

      const snapshot = scheduler.getSnapshot(550);
      expect(snapshot.phase).toBe('decay');
      expect(snapshot.step).toBe(550);
      expect(snapshot.phaseProgress).toBe(0.5); // (550-100)/900 = 0.5
      expect(snapshot.overallProgress).toBe(0.55);
    });

    it('clamps step in snapshot', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
      });

      const snapshot = scheduler.getSnapshot(2000);
      expect(snapshot.step).toBe(1000);
      expect(snapshot.overallProgress).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // STATS
  // ---------------------------------------------------------------------------

  describe('getStats', () => {
    it('returns correct peak and min LR', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 1e-7,
      });

      const stats = scheduler.getStats();
      expect(stats.peakLR).toBe(2e-4);
      expect(stats.minLR).toBe(1e-7);
      expect(stats.warmupSteps).toBe(100);
      expect(stats.decaySteps).toBe(900);
      expect(stats.totalSteps).toBe(1000);
    });

    it('computes reasonable average LR', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 0,
      });

      const stats = scheduler.getStats();
      // Average should be between 0 and baseLR
      expect(stats.avgLR).toBeGreaterThan(0);
      expect(stats.avgLR).toBeLessThan(2e-4);
    });

    it('handles totalSteps = 0', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 0,
      });

      const stats = scheduler.getStats();
      expect(stats.totalSteps).toBe(0);
      expect(stats.warmupSteps).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // SCHEDULE GENERATION
  // ---------------------------------------------------------------------------

  describe('getSchedule', () => {
    it('generates requested number of points', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
      });

      const schedule = scheduler.getSchedule(50);
      expect(schedule).toHaveLength(50);
    });

    it('starts at step 0 and ends at totalSteps', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
      });

      const schedule = scheduler.getSchedule(100);
      expect(schedule[0][0]).toBe(0);
      expect(schedule[schedule.length - 1][0]).toBe(1000);
    });

    it('each entry is [step, lr] pair', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
      });

      const schedule = scheduler.getSchedule(10);
      for (const [step, lr] of schedule) {
        expect(typeof step).toBe('number');
        expect(typeof lr).toBe('number');
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThanOrEqual(1000);
        expect(lr).toBeGreaterThanOrEqual(0);
        expect(lr).toBeLessThanOrEqual(2e-4 + 1e-10);
      }
    });

    it('enforces minimum of 2 points', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
      });

      const schedule = scheduler.getSchedule(1);
      expect(schedule.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // FACTORY FUNCTIONS
  // ---------------------------------------------------------------------------

  describe('createSFTScheduler', () => {
    it('creates scheduler with SFT defaults', () => {
      const scheduler = createSFTScheduler();
      expect(scheduler.getConfig().baseLR).toBe(2e-4);
    });

    it('allows overrides on SFT defaults', () => {
      const scheduler = createSFTScheduler({ totalSteps: 5000 });
      expect(scheduler.getConfig().baseLR).toBe(2e-4);
      expect(scheduler.getConfig().totalSteps).toBe(5000);
    });
  });

  describe('createGRPOScheduler', () => {
    it('creates scheduler with GRPO defaults', () => {
      const scheduler = createGRPOScheduler();
      expect(scheduler.getConfig().baseLR).toBe(1e-6);
    });

    it('allows overrides on GRPO defaults', () => {
      const scheduler = createGRPOScheduler({ totalSteps: 2000 });
      expect(scheduler.getConfig().baseLR).toBe(1e-6);
      expect(scheduler.getConfig().totalSteps).toBe(2000);
    });
  });

  // ---------------------------------------------------------------------------
  // DEFAULT CONFIGS
  // ---------------------------------------------------------------------------

  describe('DEFAULT_LR_SCHEDULER_CONFIG', () => {
    it('has expected values per W.006 and W.009', () => {
      expect(DEFAULT_LR_SCHEDULER_CONFIG.baseLR).toBe(2e-4);
      expect(DEFAULT_LR_SCHEDULER_CONFIG.warmupRatio).toBe(0.1);
      expect(DEFAULT_LR_SCHEDULER_CONFIG.minLR).toBe(0);
      expect(DEFAULT_LR_SCHEDULER_CONFIG.numCycles).toBe(1);
    });
  });

  describe('GRPO_LR_SCHEDULER_CONFIG', () => {
    it('has lower baseLR for GRPO', () => {
      expect(GRPO_LR_SCHEDULER_CONFIG.baseLR).toBe(1e-6);
      expect(GRPO_LR_SCHEDULER_CONFIG.warmupRatio).toBe(0.1);
    });
  });

  // ---------------------------------------------------------------------------
  // MATHEMATICAL PROPERTIES
  // ---------------------------------------------------------------------------

  describe('mathematical properties', () => {
    it('LR never exceeds baseLR', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 0,
      });

      for (let step = 0; step <= 1000; step += 10) {
        expect(scheduler.getLR(step)).toBeLessThanOrEqual(2e-4 + 1e-12);
      }
    });

    it('LR never goes below minLR (for single cycle)', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR: 1e-7,
        numCycles: 1,
      });

      for (let step = 0; step <= 1000; step += 10) {
        // During warmup, LR can be below minLR (it starts at 0)
        if (step >= scheduler.getWarmupSteps()) {
          expect(scheduler.getLR(step)).toBeGreaterThanOrEqual(
            1e-7 - 1e-12,
          );
        }
      }
    });

    it('warmup is exactly linear', () => {
      const scheduler = new LRScheduler({
        baseLR: 2e-4,
        totalSteps: 1000,
        warmupRatio: 0.1,
      });

      // Check linearity: LR at step k = baseLR * k / warmupSteps
      for (let step = 0; step <= 100; step += 10) {
        const expected = 2e-4 * (step / 100);
        expect(scheduler.getLR(step)).toBeCloseTo(expected, 10);
      }
    });

    it('cosine decay follows cos((pi * progress) / 2) shape', () => {
      const baseLR = 2e-4;
      const minLR = 0;
      const scheduler = new LRScheduler({
        baseLR,
        totalSteps: 1000,
        warmupRatio: 0.1,
        minLR,
        numCycles: 1,
      });

      // Sample a few points and verify cosine formula
      const warmupSteps = 100;
      const decaySteps = 900;

      for (const step of [200, 400, 600, 800, 1000]) {
        const progress = (step - warmupSteps) / decaySteps;
        const expected =
          minLR + (baseLR - minLR) * ((1 + Math.cos(Math.PI * progress)) / 2);
        expect(scheduler.getLR(step)).toBeCloseTo(expected, 10);
      }
    });
  });
});
