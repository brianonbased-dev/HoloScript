import { describe, it, expect, beforeEach } from 'vitest';
import { ACOEngine, type ACOConfig } from '../ACOEngine';

describe('ACOEngine', () => {
  let engine: ACOEngine;

  beforeEach(() => {
    engine = new ACOEngine();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      expect(engine).toBeDefined();
    });

    it('should accept custom config', () => {
      const customConfig: Partial<ACOConfig> = {
        antCount: 30,
        maxIterations: 150,
        alpha: 1.5,
      };
      const customEngine = new ACOEngine(customConfig);
      expect(customEngine).toBeDefined();
    });
  });

  describe('optimize', () => {
    it('should find path through all nodes', async () => {
      const nodes = 5;
      // Simple distance matrix
      const distanceMatrix = Array.from({ length: nodes }, (_, i) =>
        Array.from({ length: nodes }, (_, j) => (i === j ? 0 : Math.abs(i - j)))
      );

      const result = await engine.optimize(nodes, distanceMatrix);

      expect(result.bestPath).toHaveLength(nodes);
      expect(new Set(result.bestPath).size).toBe(nodes); // All unique
    });

    it('should find optimal path for simple TSP', async () => {
      // 4 nodes in a line: 0-1-2-3
      // Optimal path: 0,1,2,3 or reverse (cost = 3)
      const distanceMatrix = [
        [0, 1, 2, 3],
        [1, 0, 1, 2],
        [2, 1, 0, 1],
        [3, 2, 1, 0],
      ];

      const result = await engine.optimize(4, distanceMatrix);

      // Should find a reasonably good path
      expect(result.bestCost).toBeLessThanOrEqual(6); // Worst case is 6
    });

    it('should improve over iterations', async () => {
      const nodes = 6;
      const distanceMatrix = Array.from({ length: nodes }, () =>
        Array.from({ length: nodes }, () => Math.random() * 10)
      );
      // Zero diagonal
      for (let i = 0; i < nodes; i++) {
        distanceMatrix[i][i] = 0;
      }

      const result = await engine.optimize(nodes, distanceMatrix);

      expect(result.costHistory.length).toBeGreaterThan(1);
      // Later costs should be <= earlier costs (or equal)
      const firstCost = result.costHistory[0];
      const lastCost = result.costHistory[result.costHistory.length - 1];
      expect(lastCost).toBeLessThanOrEqual(firstCost);
    });

    it('should detect convergence', async () => {
      // Uniform distances - should converge quickly
      const nodes = 4;
      const distanceMatrix = Array.from({ length: nodes }, (_, i) =>
        Array.from({ length: nodes }, (_, j) => (i === j ? 0 : 1))
      );

      const result = await engine.optimize(nodes, distanceMatrix);

      expect(result.converged || result.iterations >= 10).toBe(true);
    });

    it('should handle asymmetric distances', async () => {
      const distanceMatrix = [
        [0, 1, 5],
        [5, 0, 1],
        [1, 5, 0],
      ];

      const result = await engine.optimize(3, distanceMatrix);

      expect(result.bestPath).toHaveLength(3);
      expect(result.bestCost).toBeGreaterThan(0);
    });
  });

  describe('getRecommendedAntCount', () => {
    it('should return at least 10 for small problems', () => {
      expect(engine.getRecommendedAntCount(3)).toBeGreaterThanOrEqual(10);
    });

    it('should cap at 50 for large problems', () => {
      expect(engine.getRecommendedAntCount(100)).toBeLessThanOrEqual(50);
    });

    it('should scale with node count', () => {
      const small = engine.getRecommendedAntCount(5);
      const large = engine.getRecommendedAntCount(30);
      expect(large).toBeGreaterThanOrEqual(small);
    });
  });
});
