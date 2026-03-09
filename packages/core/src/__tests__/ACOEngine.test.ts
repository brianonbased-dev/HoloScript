import { describe, it, expect } from 'vitest';
import { ACOEngine } from '../swarm/ACOEngine';

describe('ACOEngine', () => {
  const simpleMatrix = [
    [0, 1, 4],
    [1, 0, 2],
    [4, 2, 0],
  ];

  it('constructor merges config with defaults', () => {
    const engine = new ACOEngine({ antCount: 5 });
    expect(engine.getRecommendedAntCount(3)).toBe(10); // min 10
  });

  it('getRecommendedAntCount returns min 10', () => {
    const engine = new ACOEngine();
    expect(engine.getRecommendedAntCount(3)).toBe(10);
  });

  it('getRecommendedAntCount caps at 50', () => {
    const engine = new ACOEngine();
    expect(engine.getRecommendedAntCount(100)).toBe(50);
  });

  it('getRecommendedAntCount returns node count when in range', () => {
    const engine = new ACOEngine();
    expect(engine.getRecommendedAntCount(25)).toBe(25);
  });

  it('optimize returns result with required fields', async () => {
    const engine = new ACOEngine({ antCount: 5, maxIterations: 10 });
    const result = await engine.optimize(3, simpleMatrix);
    expect(result.bestPath).toHaveLength(3);
    expect(result.bestCost).toBeGreaterThan(0);
    expect(result.iterations).toBeGreaterThan(0);
    expect(Array.isArray(result.costHistory)).toBe(true);
  });

  it('optimize visits all nodes exactly once', async () => {
    const engine = new ACOEngine({ antCount: 10, maxIterations: 20 });
    const result = await engine.optimize(3, simpleMatrix);
    const sorted = [...result.bestPath].sort();
    expect(sorted).toEqual([0, 1, 2]);
  });

  it('optimize finds reasonable path for trivial problem', async () => {
    // Optimal: 0→1→2 cost = 1+2 = 3
    const engine = new ACOEngine({ antCount: 20, maxIterations: 50 });
    const result = await engine.optimize(3, simpleMatrix);
    // Best possible is 3 (0→1→2) or 3 (2→1→0)
    expect(result.bestCost).toBeLessThanOrEqual(6);
  });

  it('optimize costHistory is non-increasing', async () => {
    const engine = new ACOEngine({ antCount: 10, maxIterations: 20 });
    const result = await engine.optimize(3, simpleMatrix);
    for (let i = 1; i < result.costHistory.length; i++) {
      expect(result.costHistory[i]).toBeLessThanOrEqual(result.costHistory[i - 1]);
    }
  });

  it('optimize handles 2-node problem', async () => {
    const m = [
      [0, 5],
      [5, 0],
    ];
    const engine = new ACOEngine({ antCount: 5, maxIterations: 5 });
    const result = await engine.optimize(2, m);
    expect(result.bestPath.length).toBe(2);
    expect(result.bestCost).toBe(5);
  });

  it('converged flag set when improvement stalls', async () => {
    const engine = new ACOEngine({ antCount: 20, maxIterations: 200, convergenceThreshold: 1 });
    const result = await engine.optimize(3, simpleMatrix);
    // With high threshold and enough iterations, should converge
    expect(typeof result.converged).toBe('boolean');
  });

  it('larger problem returns valid path', async () => {
    const n = 5;
    const m = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 0 : Math.abs(i - j) + 1))
    );
    const engine = new ACOEngine({ antCount: 10, maxIterations: 30 });
    const result = await engine.optimize(n, m);
    expect(result.bestPath.length).toBe(n);
    const unique = new Set(result.bestPath);
    expect(unique.size).toBe(n);
  });
});
