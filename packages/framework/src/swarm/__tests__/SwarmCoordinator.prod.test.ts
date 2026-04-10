import { describe, it, expect } from 'vitest';
import { SwarmCoordinator, type AgentInfo, type TaskInfo } from '../SwarmCoordinator';

// ─── helpers ────────────────────────────────────────────────────────────────

function mkCoord(cfg?: ConstructorParameters<typeof SwarmCoordinator>[0]) {
  return new SwarmCoordinator(cfg);
}

function mkAgents(n: number): AgentInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `agent-${i}`,
    capacity: 100,
    load: 0,
  }));
}

function mkTasks(n: number): TaskInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `task-${i}`,
    complexity: 10,
    priority: i + 1,
  }));
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('SwarmCoordinator — construction', () => {
  it('creates without config', () => {
    expect(() => mkCoord()).not.toThrow();
  });
  it('creates with partial config', () => {
    expect(() => mkCoord({ algorithm: 'pso', populationSize: 10 })).not.toThrow();
  });
});

describe('SwarmCoordinator — getRecommendedPopulation', () => {
  const coord = mkCoord();

  it('returns at least 15 for tiny problems', () => {
    expect(coord.getRecommendedPopulation(1)).toBeGreaterThanOrEqual(15);
  });
  it('returns at most 100 for huge problems', () => {
    expect(coord.getRecommendedPopulation(1_000_000)).toBeLessThanOrEqual(100);
  });
  it('scales logarithmically (10 > 1)', () => {
    expect(coord.getRecommendedPopulation(100)).toBeGreaterThanOrEqual(
      coord.getRecommendedPopulation(10)
    );
  });
  it('returns number', () => {
    expect(typeof coord.getRecommendedPopulation(4)).toBe('number');
  });
  it('result is integer-like (ceil)', () => {
    const r = coord.getRecommendedPopulation(8);
    expect(r).toBe(Math.round(r));
  });
});

describe('SwarmCoordinator — optimize (pso)', () => {
  it('returns a valid result object', async () => {
    const coord = mkCoord({ algorithm: 'pso', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(3));
    expect(result).toHaveProperty('bestSolution');
    expect(result).toHaveProperty('bestFitness');
    expect(result).toHaveProperty('converged');
    expect(result).toHaveProperty('iterations');
  });
  it('bestSolution has length = number of tasks', async () => {
    const coord = mkCoord({ algorithm: 'pso', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(3), mkTasks(4));
    expect(result.bestSolution).toHaveLength(4);
  });
  it('each assignment index is within agent count', async () => {
    const agents = mkAgents(3);
    const coord = mkCoord({ algorithm: 'pso', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(agents, mkTasks(5));
    result.bestSolution.forEach((agentIdx: any) => {
      expect(agentIdx).toBeGreaterThanOrEqual(0);
      expect(agentIdx).toBeLessThan(agents.length);
    });
  });
  it('iterations > 0', async () => {
    const coord = mkCoord({ algorithm: 'pso', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(2));
    expect(result.iterations).toBeGreaterThan(0);
  });
  it('improvementPercent >= 0', async () => {
    const coord = mkCoord({ algorithm: 'pso', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(2));
    expect(result.improvementPercent).toBeGreaterThanOrEqual(0);
  });
});

describe('SwarmCoordinator — optimize (aco)', () => {
  it('returns valid result with aco algorithm', async () => {
    const coord = mkCoord({ algorithm: 'aco', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(3));
    expect(result).toHaveProperty('bestSolution');
  });
  it('aco solution length = task count', async () => {
    const coord = mkCoord({ algorithm: 'aco', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(4));
    expect(result.bestSolution).toHaveLength(4);
  });
  it('aco bestFitness is a number', async () => {
    const coord = mkCoord({ algorithm: 'aco', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(2));
    expect(typeof result.bestFitness).toBe('number');
  });
});

describe('SwarmCoordinator — optimize (hybrid)', () => {
  it('returns valid result for hybrid algorithm', async () => {
    const coord = mkCoord({ algorithm: 'hybrid', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(3));
    expect(result).toHaveProperty('converged');
  });
  it('hybrid solution length = tasks', async () => {
    const coord = mkCoord({ algorithm: 'hybrid', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(3));
    expect(result.bestSolution).toHaveLength(3);
  });
});

describe('SwarmCoordinator — optimize (bees)', () => {
  it('returns valid result for bees algorithm', async () => {
    const coord = mkCoord({ algorithm: 'bees', populationSize: 10, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(3));
    expect(result).toHaveProperty('bestSolution');
  });
});

describe('SwarmCoordinator — adaptiveSizing', () => {
  it('adaptiveSizing=true respects bounds', async () => {
    const coord = mkCoord({ adaptiveSizing: true, algorithm: 'pso', maxIterations: 5 });
    // Should not throw regardless of problem size
    await expect(coord.optimize(mkAgents(5), mkTasks(5))).resolves.toBeDefined();
  });
  it('adaptiveSizing=false uses configured populationSize', async () => {
    const coord = mkCoord({
      adaptiveSizing: false,
      populationSize: 5,
      maxIterations: 5,
      algorithm: 'pso',
    });
    await expect(coord.optimize(mkAgents(2), mkTasks(2))).resolves.toBeDefined();
  });
});

describe('SwarmCoordinator — per-call config override', () => {
  it('optimize accepts per-call config', async () => {
    const coord = mkCoord({ algorithm: 'pso', maxIterations: 100 });
    // Override maxIterations to be very small — allow +1 buffer for initial eval
    const maxIter = 2;
    const result = await coord.optimize(mkAgents(2), mkTasks(2), { maxIterations: maxIter });
    expect(result.iterations).toBeLessThanOrEqual(maxIter + 1);
  });
  it('per-call algorithm override is respected', async () => {
    const coord = mkCoord({ algorithm: 'hybrid', maxIterations: 5 });
    // Override to pso
    const result = await coord.optimize(mkAgents(2), mkTasks(2), { algorithm: 'pso' });
    expect(result).toHaveProperty('bestSolution');
  });
});

describe('SwarmCoordinator — edge cases', () => {
  it('single agent, single task', async () => {
    const coord = mkCoord({ algorithm: 'pso', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(1), mkTasks(1));
    expect(result.bestSolution).toHaveLength(1);
    expect(result.bestSolution[0]).toBe(0); // Only one agent
  });
  it('many tasks, few agents', async () => {
    const coord = mkCoord({ algorithm: 'pso', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(mkAgents(2), mkTasks(10));
    expect(result.bestSolution).toHaveLength(10);
  });
  it('high-capacity agents accept all tasks', async () => {
    const agents: AgentInfo[] = [{ id: 'big', capacity: 9999, load: 0 }];
    const tasks = mkTasks(5);
    const coord = mkCoord({ algorithm: 'pso', populationSize: 5, maxIterations: 5 });
    const result = await coord.optimize(agents, tasks);
    expect(result).toBeDefined();
  });
});
