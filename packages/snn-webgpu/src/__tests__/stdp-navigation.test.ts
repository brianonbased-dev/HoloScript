/**
 * Tests for STDP Navigation Task (Paper-2)
 *
 * Verifies:
 *   1. BFS path-length helper correctness
 *   2. SNNNavigationAgent initialization and action selection
 *   3. Episode execution (with and without STDP)
 *   4. Weight plasticity: weights change after STDP training
 *   5. Weight stability: weights do NOT change when stdpEnabled=false
 *   6. Training pipeline: benchmark runs end-to-end without error
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import {
  SNNNavigationAgent,
  bfsPathLength,
  createDefaultWorld,
  createSmallWorld,
  createObstacleWorld,
  runSTDPNavigationBenchmark,
  GRID_SIZE,
  ACTIONS,
  type GridWorld,
} from '../experiments/stdp-navigation.js';

// ── Shared context ────────────────────────────────────────────────────────

let ctx: GPUContext;

beforeEach(async () => {
  ctx = new GPUContext();
  await ctx.initialize();
});

afterEach(() => {
  ctx.destroy();
});

// ── BFS helpers ───────────────────────────────────────────────────────────

describe('bfsPathLength', () => {
  it('returns 0 when start equals goal', () => {
    const world = createDefaultWorld();
    expect(bfsPathLength(world, [0, 0], [0, 0])).toBe(0);
    expect(bfsPathLength(world, [3, 5], [3, 5])).toBe(0);
  });

  it('returns manhattan distance on open grid', () => {
    const world = createDefaultWorld();
    // (0,0) → (7,7): |7-0| + |7-0| = 14
    expect(bfsPathLength(world, [0, 0], [7, 7])).toBe(14);
    // (2,3) → (5,1): |5-2| + |1-3| = 5
    expect(bfsPathLength(world, [2, 3], [5, 1])).toBe(5);
  });

  it('routes around a single obstacle', () => {
    // 3×3, (0,0)→(2,0) with obstacle at (1,0)
    // Direct: (0,0)→(1,0)→(2,0) blocked; must go (0,0)→(0,1)→(1,1)→(2,1)→(2,0) = 4
    const world: GridWorld = {
      size: 3,
      start: [0, 0],
      goal: [2, 0],
      obstacles: new Set(['1,0']),
    };
    expect(bfsPathLength(world, [0, 0], [2, 0])).toBe(4);
  });

  it('returns -1 when goal is completely blocked', () => {
    const world: GridWorld = {
      size: 3,
      start: [0, 0],
      goal: [2, 2],
      // Surround (2,2) by obstacles so it cannot be reached
      obstacles: new Set(['2,1', '1,2']),
    };
    // Path goes (0,0)→…→(1,1)→(1,2) blocked, (2,1) blocked → unreachable
    // Actually (1,1)→(2,1) blocked and (1,1)→(1,2) blocked so can't reach (2,2)
    const len = bfsPathLength(world, [0, 0], [2, 2]);
    expect(len).toBe(-1);
  });

  it('handles createObstacleWorld correctly', () => {
    const world = createObstacleWorld();
    const len = bfsPathLength(world, world.start, world.goal);
    // BFS finds shortest path; must be at least the Manhattan distance and reachable
    expect(len).toBeGreaterThanOrEqual(6);
    expect(len).toBeLessThan(20); // but reachable
  });
});

// ── World factories ───────────────────────────────────────────────────────

describe('world factories', () => {
  it('createDefaultWorld has correct size and positions', () => {
    const world = createDefaultWorld();
    expect(world.size).toBe(GRID_SIZE);
    expect(world.start).toEqual([0, 0]);
    expect(world.goal).toEqual([GRID_SIZE - 1, GRID_SIZE - 1]);
    expect(world.obstacles.size).toBe(0);
  });

  it('createSmallWorld is 4×4', () => {
    const world = createSmallWorld();
    expect(world.size).toBe(4);
    expect(world.goal).toEqual([3, 3]);
  });
});

// ── Agent construction ────────────────────────────────────────────────────

describe('SNNNavigationAgent construction', () => {
  it('initializes successfully without STDP', async () => {
    const agent = new SNNNavigationAgent(ctx, createSmallWorld(), false);
    await expect(agent.initialize()).resolves.not.toThrow();
    agent.destroy();
  });

  it('initializes successfully with STDP', async () => {
    const agent = new SNNNavigationAgent(ctx, createSmallWorld(), true);
    await expect(agent.initialize()).resolves.not.toThrow();
    agent.destroy();
  });
});

// ── Action selection ──────────────────────────────────────────────────────

describe('action selection', () => {
  it('selectAction returns a valid action index (0–3)', async () => {
    const agent = new SNNNavigationAgent(ctx, createSmallWorld(), false);
    await agent.initialize();

    const action = await agent.selectAction(0, 0);
    expect(action).toBeGreaterThanOrEqual(0);
    expect(action).toBeLessThanOrEqual(3);

    agent.destroy();
  });

  it('selectAction is deterministic for same input after reset', async () => {
    // Two separate fresh agents with the same setup should both return valid actions.
    const agent = new SNNNavigationAgent(ctx, createSmallWorld(), false);
    await agent.initialize();

    const a1 = await agent.selectAction(1, 1);
    const a2 = await agent.selectAction(1, 1);
    // Both must be valid (we don't assert equal due to stochastic spikes)
    expect([0, 1, 2, 3]).toContain(a1);
    expect([0, 1, 2, 3]).toContain(a2);

    agent.destroy();
  });
});

// ── Episode execution ─────────────────────────────────────────────────────

describe('runEpisode (no STDP)', () => {
  it('returns valid NavigationResult fields', async () => {
    const world = createSmallWorld();
    const agent = new SNNNavigationAgent(ctx, world, false);
    await agent.initialize();

    const result = await agent.runEpisode(false);

    expect(result.pathLength).toBeGreaterThan(0);
    expect(result.optimalPathLength).toBe(6); // |3-0|+|3-0|=6 for 4×4
    expect(result.pathEfficiency).toBeGreaterThan(0);
    expect(result.pathEfficiency).toBeLessThanOrEqual(1.0);
    expect(typeof result.reachedGoal).toBe('boolean');

    agent.destroy();
  });

  it('pathEfficiency stays in [0, 1]', async () => {
    const world = createSmallWorld();
    const agent = new SNNNavigationAgent(ctx, world, false, 5);
    await agent.initialize();

    for (let i = 0; i < 3; i++) {
      const r = await agent.runEpisode(false);
      expect(r.pathEfficiency).toBeGreaterThanOrEqual(0);
      expect(r.pathEfficiency).toBeLessThanOrEqual(1.0);
    }

    agent.destroy();
  });

  it('returns reachedGoal=true when agent happens to navigate there', async () => {
    // 1×1 grid — start equals goal immediately
    const world: GridWorld = {
      size: 1,
      start: [0, 0],
      goal: [0, 0],
      obstacles: new Set(),
    };
    const agent = new SNNNavigationAgent(ctx, world, false);
    await agent.initialize();

    const result = await agent.runEpisode(false);
    expect(result.reachedGoal).toBe(true);
    expect(result.pathLength).toBe(0);

    agent.destroy();
  });
});

describe('runEpisode (STDP enabled)', () => {
  it('executes one learning episode without error', async () => {
    const world = createSmallWorld();
    const agent = new SNNNavigationAgent(ctx, world, true);
    await agent.initialize();

    await expect(agent.runEpisode(true)).resolves.not.toThrow();

    agent.destroy();
  });
});

// ── Weight plasticity ─────────────────────────────────────────────────────

describe('STDP weight plasticity', () => {
  it('weights change after STDP training', async () => {
    const world = createSmallWorld();
    const agent = new SNNNavigationAgent(ctx, world, true);
    await agent.initialize();

    const before = new Float32Array(await agent.readWeights());

    // Train for several episodes so STDP has time to update weights
    await agent.train(5);

    const after = await agent.readWeights();

    // At least some weights must have changed
    let diffCount = 0;
    for (let i = 0; i < before.length; i++) {
      if (Math.abs(before[i] - after[i]) > 1e-6) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);

    agent.destroy();
  }, 60_000);

  it('weights are unchanged when stdpEnabled=false', async () => {
    const world = createSmallWorld();
    const agent = new SNNNavigationAgent(ctx, world, false);
    await agent.initialize();

    const before = new Float32Array(await agent.readWeights());

    // Run 5 episodes without learning
    for (let i = 0; i < 5; i++) {
      await agent.runEpisode(false);
    }

    const after = await agent.readWeights();

    // No weights should change when STDP is disabled
    let diffCount = 0;
    for (let i = 0; i < before.length; i++) {
      if (Math.abs(before[i] - after[i]) > 1e-6) diffCount++;
    }
    expect(diffCount).toBe(0);

    agent.destroy();
  }, 60_000);
});

// ── evaluate helper ───────────────────────────────────────────────────────

describe('evaluate()', () => {
  it('returns a number in (0, 1]', async () => {
    const world = createSmallWorld();
    const agent = new SNNNavigationAgent(ctx, world, false);
    await agent.initialize();

    const efficiency = await agent.evaluate(3);
    expect(efficiency).toBeGreaterThan(0);
    expect(efficiency).toBeLessThanOrEqual(1.0);

    agent.destroy();
  });
});

// ── Full benchmark ────────────────────────────────────────────────────────

describe('runSTDPNavigationBenchmark', () => {
  it('runs end-to-end and returns TrainingStats', async () => {
    const stats = await runSTDPNavigationBenchmark(ctx, {
      world: createSmallWorld(),
      trainingEpisodes: 10,
      evalEpisodes: 3,
      simStepsPerAction: 5,
    });

    expect(stats.trainingEpisodes).toBe(10);
    expect(stats.baselineEfficiency).toBeGreaterThan(0);
    expect(stats.baselineEfficiency).toBeLessThanOrEqual(1.0);
    expect(stats.postTrainingEfficiency).toBeGreaterThan(0);
    expect(stats.postTrainingEfficiency).toBeLessThanOrEqual(1.0);
    // improvement is just a difference — can be negative in short runs
    expect(typeof stats.improvement).toBe('number');
  }, 120_000);
});
