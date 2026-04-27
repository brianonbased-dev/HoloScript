/**
 * index.test.ts — Unit tests for packages/core/src/learning/index.ts
 * Verifies the public barrel re-exports are correctly available.
 */
import { describe, it, expect } from 'vitest';

// Named imports from barrel
import {
  ContinualTraitLearner,
  EpisodicBuffer,
  computeFisherDiagonal,
  computeEWCPenalty,
  neuralODEStep,
  integrateODE,
} from '../index.js';

// ─── Export surface ──────────────────────────────────────────────────────────

describe('learning/index exports', () => {
  it('exports ContinualTraitLearner class', () => {
    expect(ContinualTraitLearner).toBeDefined();
    expect(typeof ContinualTraitLearner).toBe('function');
  });

  it('exports EpisodicBuffer class', () => {
    expect(EpisodicBuffer).toBeDefined();
    expect(typeof EpisodicBuffer).toBe('function');
  });

  it('exports computeFisherDiagonal function', () => {
    expect(computeFisherDiagonal).toBeDefined();
    expect(typeof computeFisherDiagonal).toBe('function');
  });

  it('exports computeEWCPenalty function', () => {
    expect(computeEWCPenalty).toBeDefined();
    expect(typeof computeEWCPenalty).toBe('function');
  });

  it('exports neuralODEStep function', () => {
    expect(neuralODEStep).toBeDefined();
    expect(typeof neuralODEStep).toBe('function');
  });

  it('exports integrateODE function', () => {
    expect(integrateODE).toBeDefined();
    expect(typeof integrateODE).toBe('function');
  });
});

// ─── Constructors work via barrel ────────────────────────────────────────────

describe('instantiation via barrel exports', () => {
  it('ContinualTraitLearner instantiates correctly', () => {
    const learner = new ContinualTraitLearner();
    expect(learner).toBeDefined();
    expect(learner.traitCount).toBe(0);
    expect(learner.snapshots).toHaveLength(0);
  });

  it('ContinualTraitLearner instantiates with options', () => {
    const learner = new ContinualTraitLearner({ ewcLambda: 0.4, embeddingDim: 16 });
    expect(learner).toBeDefined();
    expect(learner.traitCount).toBe(0);
  });

  it('EpisodicBuffer instantiates with capacity', () => {
    const buf = new EpisodicBuffer(50);
    expect(buf).toBeDefined();
    expect(buf.size).toBe(0);
    expect(buf.capacity).toBe(50);
  });

  it('EpisodicBuffer add and retrieve work via barrel import', () => {
    const buf = new EpisodicBuffer(5);
    buf.add('myTrait', new Float64Array([1, 0, 0]));
    const results = buf.retrieve(new Float64Array([1, 0, 0]), 1);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('myTrait');
    expect(results[0].similarity).toBeCloseTo(1.0);
  });
});

// ─── Function calls work via barrel ─────────────────────────────────────────

describe('function calls via barrel exports', () => {
  it('computeFisherDiagonal runs with empty embeddings', () => {
    const weights = new Float64Array([1, 2, 3]);
    const fisher = computeFisherDiagonal([], weights);
    expect(fisher).toBeInstanceOf(Float64Array);
    expect(fisher.length).toBe(3);
  });

  it('computeFisherDiagonal runs with embeddings', () => {
    const weights = new Float64Array([1, 1, 1]);
    const emb = new Float64Array([0.5, 0.5, 0.5]);
    const fisher = computeFisherDiagonal([emb], weights);
    expect(fisher).toBeInstanceOf(Float64Array);
    for (const v of fisher) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('computeEWCPenalty returns 0 when current==optimal', () => {
    const w = new Float64Array([1, 2]);
    const fisher = new Float64Array([1, 1]);
    expect(computeEWCPenalty(w, w, fisher, 0.1)).toBe(0);
  });

  it('computeEWCPenalty returns positive for differing weights', () => {
    const current = new Float64Array([1, 0]);
    const optimal = new Float64Array([0, 1]);
    const fisher = new Float64Array([1, 1]);
    const penalty = computeEWCPenalty(current, optimal, fisher, 0.5);
    expect(penalty).toBeGreaterThan(0);
  });

  it('neuralODEStep returns same-length Float64Array', () => {
    const z = new Float64Array([1, -1, 0.5]);
    const kernel = new Float64Array(9).fill(0.1);
    const result = neuralODEStep(z, 0.1, kernel);
    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(3);
  });

  it('integrateODE returns same-length Float64Array', () => {
    const z0 = new Float64Array([0.5, -0.5]);
    const kernel = new Float64Array(4).fill(0.05);
    const result = integrateODE(z0, kernel, 5);
    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(2);
  });
});

// ─── addTrait via barrel ─────────────────────────────────────────────────────

describe('ContinualTraitLearner.addTrait via barrel', () => {
  it('resolves with LearningResult', async () => {
    const learner = new ContinualTraitLearner({ embeddingDim: 4, maxIterations: 3 });
    const result = await learner.addTrait({
      name: '@collidable',
      embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]),
      version: 'v6.0.0',
      category: 'physics',
    });
    expect(result).toBeDefined();
    expect(result.traitName).toBe('@collidable');
    expect(result.version).toBe('v6.0.0');
    expect(typeof result.converged).toBe('boolean');
  });
});
