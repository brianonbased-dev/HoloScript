import { describe, it, expect, beforeEach } from 'vitest';
import { SwarmCoordinator, type AgentInfo, type TaskInfo } from '../SwarmCoordinator';
import type { ISwarmConfig } from '@holoscript/core';

describe('SwarmCoordinator', () => {
  let coordinator: SwarmCoordinator;
  let agents: AgentInfo[];
  let tasks: TaskInfo[];

  beforeEach(() => {
    coordinator = new SwarmCoordinator();

    agents = [
      { id: 'agent-1', capacity: 100, load: 20 },
      { id: 'agent-2', capacity: 100, load: 30 },
      { id: 'agent-3', capacity: 100, load: 10 },
    ];

    tasks = [
      { id: 'task-1', complexity: 20, priority: 3 },
      { id: 'task-2', complexity: 30, priority: 2 },
      { id: 'task-3', complexity: 15, priority: 1 },
      { id: 'task-4', complexity: 25, priority: 3 },
      { id: 'task-5', complexity: 10, priority: 2 },
    ];
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      expect(coordinator).toBeDefined();
    });

    it('should accept custom config', () => {
      const customCoordinator = new SwarmCoordinator({
        algorithm: 'pso',
        populationSize: 50,
      });
      expect(customCoordinator).toBeDefined();
    });
  });

  describe('optimize', () => {
    it('should return valid assignment for all tasks', async () => {
      const result = await coordinator.optimize(agents, tasks);

      expect(result.bestSolution).toHaveLength(tasks.length);
      expect(result.bestSolution.every((a: any) => a >= 0 && a < agents.length)).toBe(true);
    });

    it('should complete with PSO algorithm', async () => {
      const config: Partial<ISwarmConfig> = { algorithm: 'pso' };
      const result = await coordinator.optimize(agents, tasks, config);

      expect(result.bestSolution).toHaveLength(tasks.length);
      expect(result.iterations).toBeGreaterThan(0);
    });

    it('should complete with ACO algorithm', async () => {
      const config: Partial<ISwarmConfig> = { algorithm: 'aco' };
      const result = await coordinator.optimize(agents, tasks, config);

      expect(result.bestSolution).toHaveLength(tasks.length);
    });

    it('should complete with hybrid algorithm', async () => {
      const config: Partial<ISwarmConfig> = { algorithm: 'hybrid' };
      const result = await coordinator.optimize(agents, tasks, config);

      expect(result.bestSolution).toHaveLength(tasks.length);
    });

    it('should complete with bees algorithm', async () => {
      const config: Partial<ISwarmConfig> = { algorithm: 'bees' };
      const result = await coordinator.optimize(agents, tasks, config);

      expect(result.bestSolution).toHaveLength(tasks.length);
    });

    it('should respect capacity constraints', async () => {
      // Small capacity agents with large tasks
      const limitedAgents: AgentInfo[] = [
        { id: 'agent-1', capacity: 50, load: 0 },
        { id: 'agent-2', capacity: 50, load: 0 },
      ];
      const heavyTasks: TaskInfo[] = [
        { id: 'task-1', complexity: 40, priority: 1 },
        { id: 'task-2', complexity: 40, priority: 1 },
      ];

      const result = await coordinator.optimize(limitedAgents, heavyTasks);

      // Should distribute to avoid overload
      expect(result.bestSolution).toHaveLength(2);
      expect(result.bestFitness).toBeGreaterThan(-100); // Not heavily penalized
    });

    it('should prioritize high-priority tasks', async () => {
      const result = await coordinator.optimize(agents, tasks);

      expect(result.bestFitness).toBeGreaterThan(0);
      expect(result.improvementPercent).toBeDefined();
    });

    it('should use adaptive sizing when enabled', async () => {
      const config: Partial<ISwarmConfig> = { adaptiveSizing: true };
      const result = await coordinator.optimize(agents, tasks, config);

      expect(result.bestSolution).toHaveLength(tasks.length);
    });

    it('should handle empty tasks', async () => {
      const result = await coordinator.optimize(agents, []);

      expect(result.bestSolution).toHaveLength(0);
    });

    it('should handle single agent', async () => {
      const singleAgent: AgentInfo[] = [{ id: 'solo', capacity: 1000, load: 0 }];
      const result = await coordinator.optimize(singleAgent, tasks);

      // All tasks should go to the only agent
      expect(result.bestSolution.every((a: any) => a === 0)).toBe(true);
    });
  });

  describe('getRecommendedPopulation', () => {
    it('should return minimum 15 for small problems', () => {
      expect(coordinator.getRecommendedPopulation(1)).toBeGreaterThanOrEqual(15);
    });

    it('should cap at 100 for large problems', () => {
      expect(coordinator.getRecommendedPopulation(100000)).toBeLessThanOrEqual(100);
    });

    it('should increase with problem size', () => {
      const small = coordinator.getRecommendedPopulation(10);
      const medium = coordinator.getRecommendedPopulation(100);
      const large = coordinator.getRecommendedPopulation(1000);

      expect(medium).toBeGreaterThan(small);
      expect(large).toBeGreaterThan(medium);
    });
  });

  describe('result metrics', () => {
    it('should report convergence status', async () => {
      const result = await coordinator.optimize(agents, tasks, {
        maxIterations: 5, // Low iterations may not converge
      });

      expect(typeof result.converged).toBe('boolean');
    });

    it('should report iteration count', async () => {
      const result = await coordinator.optimize(agents, tasks);

      expect(result.iterations).toBeGreaterThan(0);
    });

    it('should report improvement percentage', async () => {
      const result = await coordinator.optimize(agents, tasks);

      expect(typeof result.improvementPercent).toBe('number');
      expect(result.improvementPercent).toBeGreaterThanOrEqual(0);
    });
  });
});
