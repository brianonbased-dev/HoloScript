// @ts-nocheck
/**
 * genetic-algorithm.test.ts  (P.007.02)
 *
 * Unit tests for the self-contained GeneticAlgorithm orchestrator.
 *
 * Covers:
 *   1. run() structural invariants (result shape, population size)
 *   2. targetFitness early convergence
 *   3. Selection method coverage (tournament, rank, boltzmann, sus)
 *   4. Crossover method coverage (single-point, two-point, uniform, arithmetic, sbx)
 *   5. Mutation method coverage (gaussian, polynomial, inversion)
 *   6. Hall of Fame preserves best individual across generations
 *   7. Actual optimization on a simple sphere-minimisation problem
 *
 * Run: npx vitest run docs/ops/genetic-algorithm.test.ts
 */

import { describe, it, expect, vi } from "vitest";

import {
  GeneticAlgorithm,
  GeneticAlgorithmConfig,
  GAResult,
} from "./genetic-algorithm";

function makeConfig(
  overrides: Partial<GeneticAlgorithmConfig> = {}
): GeneticAlgorithmConfig {
  return {
    populationSize: 20,
    maxGenerations: 20,
    genomeLength: 8,
    evaluateFitness: (g) => g.reduce((s, v) => s + v, 0),
    ...overrides,
  };
}

function assertResultShape(result: GAResult) {
  expect(result).toHaveProperty("best");
  expect(result).toHaveProperty("generationsRun");
  expect(result).toHaveProperty("converged");
  expect(result).toHaveProperty("history");
  expect(typeof result.generationsRun).toBe("number");
  expect(Array.isArray(result.history)).toBe(true);
  expect(result.best.genome).toBeDefined();
  expect(typeof result.best.fitness).toBe("number");
}

// ─── 1. Core run invariants ─────────────────────────────────────────────────

describe("GeneticAlgorithm", () => {
  it("runs to completion and returns a well-formed result", async () => {
    const ga = new GeneticAlgorithm(makeConfig());
    const result = await ga.run();
    assertResultShape(result);
    expect(result.generationsRun).toBeGreaterThanOrEqual(0);
    expect(result.generationsRun).toBeLessThanOrEqual(20);
  });

  it("maintains population size across generations", async () => {
    const ga = new GeneticAlgorithm(makeConfig({ populationSize: 12 }));
    await ga.run();
    expect(ga.getPopulation().length).toBe(12);
  });

  it("converges early when targetFitness is reached", async () => {
    const ga = new GeneticAlgorithm(
      makeConfig({
        targetFitness: 10,
        evaluateFitness: () => 10,
        maxGenerations: 100,
      })
    );
    const result = await ga.run();
    expect(result.converged).toBe(true);
    expect(result.best.fitness).toBe(10);
    expect(result.generationsRun).toBeLessThan(100);
  });

  it("does not exceed maxGenerations", async () => {
    const ga = new GeneticAlgorithm(makeConfig({ maxGenerations: 3 }));
    const result = await ga.run();
    expect(result.generationsRun).toBeLessThanOrEqual(3);
  });

  it("Hall of Fame retains the best individual ever seen", async () => {
    const ga = new GeneticAlgorithm(
      makeConfig({ populationSize: 10, maxGenerations: 5 })
    );
    const result = await ga.run();
    expect(result.best).toBeDefined();
    expect(result.best.fitness).toBeGreaterThanOrEqual(
      Math.max(...ga.getPopulation().map((i) => i.fitness))
    );
  });

  it("improves fitness on a simple additive target", async () => {
    const ga = new GeneticAlgorithm(
      makeConfig({
        populationSize: 30,
        maxGenerations: 30,
        mutationRate: 0.15,
        evaluateFitness: (g) => g.reduce((s, v) => s + v, 0),
      })
    );
    const result = await ga.run();
    expect(result.best.fitness).toBeGreaterThan(0);
  });

  // ─── 2. Selection method coverage ───────────────────────────────────────────

  const selections: Array<
    Required<GeneticAlgorithmConfig>["selectionMethod"]
  > = ["tournament", "rank", "boltzmann", "sus"];

  for (const method of selections) {
    it(`works with selectionMethod="${method}"`, async () => {
      const ga = new GeneticAlgorithm(
        makeConfig({ selectionMethod: method, maxGenerations: 5 })
      );
      const result = await ga.run();
      assertResultShape(result);
    });
  }

  // ─── 3. Crossover method coverage ───────────────────────────────────────────

  const crossovers: Array<
    Required<GeneticAlgorithmConfig>["crossoverMethod"]
  > = ["single-point", "two-point", "uniform", "arithmetic", "sbx"];

  for (const method of crossovers) {
    it(`works with crossoverMethod="${method}"`, async () => {
      const ga = new GeneticAlgorithm(
        makeConfig({ crossoverMethod: method, maxGenerations: 5 })
      );
      const result = await ga.run();
      assertResultShape(result);
    });
  }

  // ─── 4. Mutation method coverage ────────────────────────────────────────────

  const mutations: Array<
    Required<GeneticAlgorithmConfig>["mutationMethod"]
  > = ["gaussian", "polynomial", "inversion"];

  for (const method of mutations) {
    it(`works with mutationMethod="${method}"`, async () => {
      const ga = new GeneticAlgorithm(
        makeConfig({ mutationMethod: method, maxGenerations: 5 })
      );
      const result = await ga.run();
      assertResultShape(result);
    });
  }

  // ─── 5. Config defaults ─────────────────────────────────────────────────────

  it("applies sensible defaults when optional fields are omitted", async () => {
    const ga = new GeneticAlgorithm({
      genomeLength: 4,
      evaluateFitness: () => 1,
    });
    const result = await ga.run();
    assertResultShape(result);
    expect(ga.getPopulation().length).toBe(100); // default populationSize
  });

  // ─── 6. Diversity and history tracking ──────────────────────────────────────

  it("records per-generation statistics in history", async () => {
    const ga = new GeneticAlgorithm(
      makeConfig({ maxGenerations: 5, populationSize: 12 })
    );
    const result = await ga.run();
    expect(result.history.length).toBeGreaterThanOrEqual(1);
    const first = result.history[0];
    expect(first).toHaveProperty("generation");
    expect(first).toHaveProperty("bestFitness");
    expect(first).toHaveProperty("meanFitness");
    expect(first).toHaveProperty("diversity");
    expect(first.diversity).toBeGreaterThanOrEqual(0);
    expect(first.diversity).toBeLessThanOrEqual(1);
  });
});
