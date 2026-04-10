import { describe, it, expect, beforeEach } from 'vitest';
import { PSOEngine, type PSOConfig } from '../PSOEngine';

describe('PSOEngine', () => {
  let engine: PSOEngine;

  beforeEach(() => {
    engine = new PSOEngine();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      expect(engine).toBeDefined();
    });

    it('should accept custom config', () => {
      const customConfig: Partial<PSOConfig> = {
        populationSize: 50,
        maxIterations: 200,
      };
      const customEngine = new PSOEngine(customConfig);
      expect(customEngine).toBeDefined();
    });
  });

  describe('optimize', () => {
    it('should find optimal assignment for simple problem', async () => {
      // Simple fitness: prefer lower agent indices
      const fitnessFunction = (assignment: number[]) => {
        return assignment.reduce((sum, agent) => sum - agent, 0);
      };

      const result = await engine.optimize(3, 5, fitnessFunction);

      expect(result.bestSolution).toHaveLength(5);
      expect(result.bestFitness).toBeDefined();
      expect(result.iterations).toBeGreaterThan(0);
      expect(result.fitnessHistory).toBeDefined();
      expect(result.fitnessHistory.length).toBeGreaterThan(0);
    });

    it('should converge on known optimization problem', async () => {
      // Fitness: all tasks to agent 0 is optimal
      const fitnessFunction = (assignment: number[]) => {
        return assignment.filter((a) => a === 0).length * 10;
      };

      const result = await engine.optimize(3, 10, fitnessFunction);

      // Should find many assignments to agent 0
      const agent0Count = result.bestSolution.filter((a) => a === 0).length;
      expect(agent0Count).toBeGreaterThan(5);
    });

    it('should respect agent count bounds', async () => {
      const agentCount = 5;
      const result = await engine.optimize(agentCount, 20, () => 1);

      expect(result.bestSolution.every((a) => a >= 0 && a < agentCount)).toBe(true);
    });

    it('should return discrete integer assignments', async () => {
      const result = await engine.optimize(4, 10, () => Math.random());

      expect(result.bestSolution.every((a) => Number.isInteger(a))).toBe(true);
    });

    it('should track fitness history', async () => {
      const result = await engine.optimize(3, 5, (a) => a.length);

      expect(result.fitnessHistory.length).toBeGreaterThan(1);
      // First entry should exist
      expect(result.fitnessHistory[0]).toBeDefined();
    });

    it('should detect convergence early', async () => {
      // Constant fitness - should converge quickly
      const engine = new PSOEngine({
        maxIterations: 100,
        convergenceThreshold: 0.01,
      });

      const result = await engine.optimize(3, 5, () => 100);

      // Should converge before max iterations
      expect(result.iterations).toBeLessThan(100);
      expect(result.converged).toBe(true);
    });
  });

  describe('getRecommendedPopulation', () => {
    it('should return at least 10 for small problems', () => {
      expect(engine.getRecommendedPopulation(1)).toBeGreaterThanOrEqual(10);
    });

    it('should cap at 50 for large problems', () => {
      expect(engine.getRecommendedPopulation(10000)).toBeLessThanOrEqual(50);
    });

    it('should scale with problem size', () => {
      const small = engine.getRecommendedPopulation(5);
      const large = engine.getRecommendedPopulation(100);
      expect(large).toBeGreaterThanOrEqual(small);
    });
  });
});
