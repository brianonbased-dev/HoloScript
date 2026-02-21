import { describe, it, expect } from 'vitest';
import { ACOEngine, type ACOConfig } from '../ACOEngine';

// ─── helpers ────────────────────────────────────────────────────────────────

function mkACO(cfg?: Partial<ACOConfig>) {
  return new ACOEngine(cfg);
}

/** Build an NxN distance matrix with given cost between all pairs */
function uniformMatrix(n: number, cost = 1): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : cost))
  );
}

/** Build an asymmetric matrix where path 0→1→2→...→n-1 is cheapest */
function directedMatrix(n: number): number[][] {
  const m = uniformMatrix(n, 100); // default high cost
  for (let i = 0; i < n - 1; i++) {
    m[i][i + 1] = 1; // cheap forward path
    m[i + 1][i] = 1; // and reverse for symmetric support
  }
  return m;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ACOEngine — construction / defaultConfig', () => {
  it('creates with empty config', () => expect(() => mkACO()).not.toThrow());
  it('creates with partial config', () => {
    expect(() => mkACO({ antCount: 5, maxIterations: 5 })).not.toThrow();
  });
});

describe('ACOEngine — getRecommendedAntCount', () => {
  const aco = mkACO();
  it('returns min 10 for small node count', () => {
    expect(aco.getRecommendedAntCount(2)).toBeGreaterThanOrEqual(10);
  });
  it('returns max 50 for large node count', () => {
    expect(aco.getRecommendedAntCount(200)).toBeLessThanOrEqual(50);
  });
  it('roughly equals node count in mid range', () => {
    expect(aco.getRecommendedAntCount(25)).toBe(25);
  });
  it('returns integer', () => {
    const r = aco.getRecommendedAntCount(15);
    expect(r).toBe(Math.round(r));
  });
});

describe('ACOEngine — optimize result shape', () => {
  it('returns all required fields', async () => {
    const aco = mkACO({ antCount: 3, maxIterations: 3 });
    const result = await aco.optimize(3, uniformMatrix(3));
    expect(result).toHaveProperty('bestPath');
    expect(result).toHaveProperty('bestCost');
    expect(result).toHaveProperty('converged');
    expect(result).toHaveProperty('iterations');
    expect(result).toHaveProperty('costHistory');
  });
  it('bestPath length equals node count', async () => {
    const n = 4;
    const aco = mkACO({ antCount: 3, maxIterations: 3 });
    const result = await aco.optimize(n, uniformMatrix(n));
    expect(result.bestPath).toHaveLength(n);
  });
  it('bestPath visits each node exactly once', async () => {
    const n = 5;
    const aco = mkACO({ antCount: 5, maxIterations: 5 });
    const result = await aco.optimize(n, uniformMatrix(n));
    const sorted = [...result.bestPath].sort((a, b) => a - b);
    expect(sorted).toEqual([0, 1, 2, 3, 4]);
  });
  it('iterations > 0', async () => {
    const aco = mkACO({ antCount: 3, maxIterations: 5 });
    const result = await aco.optimize(3, uniformMatrix(3));
    expect(result.iterations).toBeGreaterThan(0);
  });
  it('costHistory is non-empty array', async () => {
    const aco = mkACO({ antCount: 3, maxIterations: 3 });
    const result = await aco.optimize(3, uniformMatrix(3));
    expect(Array.isArray(result.costHistory)).toBe(true);
    expect(result.costHistory.length).toBeGreaterThan(0);
  });
  it('bestCost equals min of costHistory', async () => {
    const aco = mkACO({ antCount: 5, maxIterations: 5 });
    const result = await aco.optimize(3, uniformMatrix(3, 2));
    const minHistory = Math.min(...result.costHistory);
    expect(result.bestCost).toBeCloseTo(minHistory, 9);
  });
  it('bestCost is a finite positive number', async () => {
    const aco = mkACO({ antCount: 3, maxIterations: 3 });
    const result = await aco.optimize(4, uniformMatrix(4));
    expect(isFinite(result.bestCost)).toBe(true);
    expect(result.bestCost).toBeGreaterThan(0);
  });
  it('converged = boolean', async () => {
    const aco = mkACO({ antCount: 3, maxIterations: 3 });
    const result = await aco.optimize(3, uniformMatrix(3));
    expect(typeof result.converged).toBe('boolean');
  });
});

describe('ACOEngine — convergence behavior', () => {
  it('converges on uniform matrix in many iterations', async () => {
    // With uniform costs and many iterations, ACO should converge
    const aco = mkACO({ antCount: 10, maxIterations: 50, convergenceThreshold: 0.001 });
    const result = await aco.optimize(3, uniformMatrix(3));
    expect(result.converged).toBe(true);
  });
  it('does not converge with only 5 iterations (needs > 10)', async () => {
    const aco = mkACO({ antCount: 5, maxIterations: 5 });
    const result = await aco.optimize(4, uniformMatrix(4));
    expect(result.converged).toBe(false);
  });
});

describe('ACOEngine — path quality', () => {
  it('finds the low-cost path in a directed matrix', async () => {
    // For directed matrix, 0→1→2→3 costs 3 (each edge=1), any other cost=100
    const n = 4;
    const aco = mkACO({ antCount: 20, maxIterations: 30 });
    const result = await aco.optimize(n, directedMatrix(n));
    // The best path cost should be n-1 (consecutive edges at cost 1)
    expect(result.bestCost).toBeLessThanOrEqual(n - 1 + 0.01); // allow float rounding
  });
  it('single node — bestPath is [0], bestCost = 0', async () => {
    const aco = mkACO({ antCount: 2, maxIterations: 2 });
    const result = await aco.optimize(1, [[0]]);
    expect(result.bestPath).toEqual([0]);
    expect(result.bestCost).toBe(0);
  });
  it('two nodes — bestPath visits both', async () => {
    const aco = mkACO({ antCount: 3, maxIterations: 3 });
    const result = await aco.optimize(2, [[0, 5], [5, 0]]);
    expect(result.bestPath).toHaveLength(2);
    expect(new Set(result.bestPath).size).toBe(2);
  });
});

describe('ACOEngine — config sensitivity', () => {
  it('high evaporation rate does not crash', async () => {
    const aco = mkACO({ evaporationRate: 0.9, antCount: 3, maxIterations: 3 });
    await expect(aco.optimize(3, uniformMatrix(3))).resolves.toBeDefined();
  });
  it('low alpha (pheromone ignored) does not crash', async () => {
    const aco = mkACO({ alpha: 0.01, antCount: 3, maxIterations: 3 });
    await expect(aco.optimize(3, uniformMatrix(3))).resolves.toBeDefined();
  });
  it('high elitistWeight does not crash', async () => {
    const aco = mkACO({ elitistWeight: 10, antCount: 3, maxIterations: 3 });
    await expect(aco.optimize(3, uniformMatrix(3))).resolves.toBeDefined();
  });
  it('large antCount works correctly', async () => {
    const aco = mkACO({ antCount: 50, maxIterations: 3 });
    const result = await aco.optimize(4, uniformMatrix(4));
    expect(result.bestPath).toHaveLength(4);
  });
});
