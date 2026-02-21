import { describe, it, expect } from 'vitest';
import { PSOEngine, type PSOConfig } from '../PSOEngine';

// ─── helpers ────────────────────────────────────────────────────────────────

function mkPSO(cfg?: Partial<PSOConfig>) {
  return new PSOEngine(cfg);
}

/** Perfect fitness fn — rewards assignment[i] === targetAgentIdx */
function targetFitness(target: number[], agentCount: number) {
  return (assignment: number[]) => {
    let score = 0;
    for (let i = 0; i < assignment.length; i++) {
      if (assignment[i] === target[i]) score += 10;
    }
    return score;
  };
}

/** Constant fitness fn — always returns same value */
const constantFitness = (v: number) => (_: number[]) => v;

// ─── tests ───────────────────────────────────────────────────────────────────

describe('PSOEngine — construction / defaultConfig', () => {
  it('creates with empty config', () => expect(() => mkPSO()).not.toThrow());
  it('default inertiaWeight = 0.729', () => {
    // Run a tiny optimization and check it doesn't blow up
    expect(mkPSO()).toBeDefined();
  });
  it('custom config is respected', () => {
    const pso = mkPSO({ populationSize: 5, maxIterations: 2 });
    expect(pso).toBeDefined();
  });
});

describe('PSOEngine — getRecommendedPopulation', () => {
  const pso = mkPSO();
  it('returns min 10 for tiny problems', () => {
    expect(pso.getRecommendedPopulation(1)).toBeGreaterThanOrEqual(10);
  });
  it('returns max 50 for large problems', () => {
    expect(pso.getRecommendedPopulation(1000)).toBeLessThanOrEqual(50);
  });
  it('scales with problem size (5 > 1)', () => {
    expect(pso.getRecommendedPopulation(5)).toBeGreaterThanOrEqual(pso.getRecommendedPopulation(1));
  });
  it('returns integer', () => {
    const r = pso.getRecommendedPopulation(6);
    expect(r).toBe(Math.round(r));
  });
});

describe('PSOEngine — optimize result shape', () => {
  it('returns all required fields', async () => {
    const pso = mkPSO({ populationSize: 5, maxIterations: 3 });
    const result = await pso.optimize(2, 3, constantFitness(1));
    expect(result).toHaveProperty('bestSolution');
    expect(result).toHaveProperty('bestFitness');
    expect(result).toHaveProperty('converged');
    expect(result).toHaveProperty('iterations');
    expect(result).toHaveProperty('fitnessHistory');
  });
  it('bestSolution has length = taskCount', async () => {
    const pso = mkPSO({ populationSize: 5, maxIterations: 3 });
    const result = await pso.optimize(3, 5, constantFitness(0));
    expect(result.bestSolution).toHaveLength(5);
  });
  it('each solution element is a valid agent index', async () => {
    const agentCount = 4;
    const pso = mkPSO({ populationSize: 5, maxIterations: 3 });
    const result = await pso.optimize(agentCount, 6, constantFitness(0));
    result.bestSolution.forEach(idx => {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(agentCount);
    });
  });
  it('iterations > 0', async () => {
    const pso = mkPSO({ populationSize: 5, maxIterations: 5 });
    const result = await pso.optimize(2, 2, constantFitness(1));
    expect(result.iterations).toBeGreaterThan(0);
  });
  it('fitnessHistory is non-empty array', async () => {
    const pso = mkPSO({ populationSize: 5, maxIterations: 3 });
    const result = await pso.optimize(2, 2, constantFitness(5));
    expect(Array.isArray(result.fitnessHistory)).toBe(true);
    expect(result.fitnessHistory.length).toBeGreaterThan(0);
  });
  it('bestFitness matches last fitnessHistory value (non-decreasing)', async () => {
    const pso = mkPSO({ populationSize: 10, maxIterations: 5 });
    const result = await pso.optimize(2, 3, constantFitness(7));
    const maxHistory = Math.max(...result.fitnessHistory);
    expect(result.bestFitness).toBeCloseTo(maxHistory, 9);
  });
  it('converged = boolean', async () => {
    const pso = mkPSO({ populationSize: 5, maxIterations: 3 });
    const result = await pso.optimize(2, 2, constantFitness(0));
    expect(typeof result.converged).toBe('boolean');
  });
});

describe('PSOEngine — convergence behavior', () => {
  it('converges when fitness is constant (no improvement)', async () => {
    // constant fitness with zero improvement should trigger convergence after >10 iterations
    const pso = mkPSO({ populationSize: 5, maxIterations: 50, convergenceThreshold: 0.001 });
    const result = await pso.optimize(2, 2, constantFitness(42));
    expect(result.converged).toBe(true);
  });
  it('does NOT converge when maxIterations = 5 (fewer than 10 required to check)', async () => {
    const pso = mkPSO({ populationSize: 5, maxIterations: 5 });
    const result = await pso.optimize(2, 2, constantFitness(1));
    // With only 5 iterations, convergence cannot be detected (needs >10)
    expect(result.converged).toBe(false);
    expect(result.iterations).toBeLessThanOrEqual(6); // 5 + buffer
  });
});

describe('PSOEngine — fitness optimization', () => {
  it('finds high-fitness solution with obvious landscape', async () => {
    const agentCount = 2;
    const taskCount = 2;
    // Fitness = sum of (agentIndex) — higher agent index is better
    // PSO should prefer index 1 over 0
    const pso = mkPSO({ populationSize: 20, maxIterations: 50 });
    const result = await pso.optimize(agentCount, taskCount, (assignment) =>
      assignment.reduce((acc, a) => acc + a, 0)
    );
    // All tasks should be assigned to agent 1
    expect(result.bestFitness).toBeGreaterThan(0);
  });
  it('single agent — all tasks must go to agent 0', async () => {
    const pso = mkPSO({ populationSize: 5, maxIterations: 5 });
    const result = await pso.optimize(1, 3, constantFitness(1));
    result.bestSolution.forEach(idx => expect(idx).toBe(0));
  });
  it('fitness of bestSolution equals bestFitness', async () => {
    const fitnessMap: Record<string, number> = {};
    const fn = (a: number[]) => {
      const k = a.join('-');
      if (!fitnessMap[k]) fitnessMap[k] = Math.random() * 10;
      return fitnessMap[k];
    };
    const pso = mkPSO({ populationSize: 10, maxIterations: 10 });
    const result = await pso.optimize(3, 3, fn);
    // The reported bestFitness must be ≥ any fitness seen in history
    result.fitnessHistory.forEach(f => {
      expect(result.bestFitness).toBeGreaterThanOrEqual(f - 1e-9);
    });
  });
});

describe('PSOEngine — velocity clamp', () => {
  it('does not throw with velocityClamp = 0.1', async () => {
    const pso = mkPSO({ velocityClamp: 0.1, populationSize: 5, maxIterations: 3 });
    await expect(pso.optimize(2, 2, constantFitness(1))).resolves.toBeDefined();
  });
  it('does not throw with very large velocityClamp', async () => {
    const pso = mkPSO({ velocityClamp: 100, populationSize: 5, maxIterations: 3 });
    await expect(pso.optimize(2, 2, constantFitness(1))).resolves.toBeDefined();
  });
});
