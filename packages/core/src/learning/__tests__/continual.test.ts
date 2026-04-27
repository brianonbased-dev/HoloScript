/**
 * continual.test.ts — Unit tests for packages/core/src/learning/continual.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeFisherDiagonal,
  computeEWCPenalty,
  neuralODEStep,
  integrateODE,
  EpisodicBuffer,
  ContinualTraitLearner,
} from '../continual.js';
import type {
  TraitDescriptor,
  TaskSnapshot,
  TraitEmbedding,
  FisherDiagonal,
} from '../continual.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEmbedding(values: number[]): Float64Array {
  return new Float64Array(values);
}

function makeTraitDescriptor(
  name: string,
  embedding: number[],
  version = 'v1.0.0',
  category = 'interaction',
): TraitDescriptor {
  return { name, embedding: makeEmbedding(embedding), version, category };
}

// ─── computeFisherDiagonal ───────────────────────────────────────────────────

describe('computeFisherDiagonal', () => {
  it('returns zero Fisher for empty embeddings', () => {
    const weights = makeEmbedding([0.1, 0.2, 0.3]);
    const fisher = computeFisherDiagonal([], weights);
    expect(fisher).toBeInstanceOf(Float64Array);
    expect(fisher.length).toBe(3);
    for (const v of fisher) expect(v).toBe(0);
  });

  it('returns Float64Array of same length as weights', () => {
    const weights = makeEmbedding([0.5, -0.3, 0.8, 0.1]);
    const emb = makeEmbedding([1, 0, 1, 0]);
    const fisher = computeFisherDiagonal([emb], weights);
    expect(fisher).toBeInstanceOf(Float64Array);
    expect(fisher.length).toBe(4);
  });

  it('computes positive fisher values for non-zero embeddings/weights', () => {
    const weights = makeEmbedding([1, 1, 1]);
    const emb = makeEmbedding([1, 1, 1]);
    const fisher = computeFisherDiagonal([emb], weights);
    // Each element: (emb[i] * weights[i])^2 / n => 1
    for (const v of fisher) expect(v).toBeGreaterThan(0);
  });

  it('averages over multiple embeddings', () => {
    const weights = makeEmbedding([1, 1]);
    const e1 = makeEmbedding([1, 0]);
    const e2 = makeEmbedding([0, 1]);
    const fisher = computeFisherDiagonal([e1, e2], weights);
    // fisher[0] = (1*1)^2/2 + (0*1)^2/2 = 0.5
    // fisher[1] = (0*1)^2/2 + (1*1)^2/2 = 0.5
    expect(fisher[0]).toBeCloseTo(0.5);
    expect(fisher[1]).toBeCloseTo(0.5);
  });

  it('handles embedding shorter than weights length', () => {
    const weights = makeEmbedding([1, 1, 1, 1]);
    const shortEmb = makeEmbedding([1, 1]);
    const fisher = computeFisherDiagonal([shortEmb], weights);
    // First 2 populated, rest remain 0
    expect(fisher.length).toBe(4);
    expect(fisher[0]).toBeGreaterThan(0);
    expect(fisher[1]).toBeGreaterThan(0);
    expect(fisher[2]).toBe(0);
    expect(fisher[3]).toBe(0);
  });
});

// ─── computeEWCPenalty ──────────────────────────────────────────────────────

describe('computeEWCPenalty', () => {
  it('returns 0 when current == optimal weights', () => {
    const w = makeEmbedding([1, 2, 3]);
    const fisher = makeEmbedding([1, 1, 1]) as FisherDiagonal;
    const penalty = computeEWCPenalty(w, w, fisher, 0.1);
    expect(penalty).toBe(0);
  });

  it('returns positive value when weights differ', () => {
    const current = makeEmbedding([1, 2, 3]);
    const optimal = makeEmbedding([0, 0, 0]);
    const fisher = makeEmbedding([1, 1, 1]) as FisherDiagonal;
    const penalty = computeEWCPenalty(current, optimal, fisher, 0.1);
    expect(penalty).toBeGreaterThan(0);
  });

  it('scales with lambda', () => {
    const current = makeEmbedding([1, 0, 0]);
    const optimal = makeEmbedding([0, 0, 0]);
    const fisher = makeEmbedding([2, 0, 0]) as FisherDiagonal;
    const p1 = computeEWCPenalty(current, optimal, fisher, 0.1);
    const p2 = computeEWCPenalty(current, optimal, fisher, 0.5);
    expect(p2).toBeCloseTo(p1 * 5);
  });

  it('computes L_ewc = (lambda/2) * sum(F_i * (theta_i - theta*_i)^2)', () => {
    // w = [2], optimal = [0], fisher = [3], lambda = 0.2
    // penalty = (0.2/2) * 3 * (2-0)^2 = 0.1 * 3 * 4 = 1.2
    const current = makeEmbedding([2]);
    const optimal = makeEmbedding([0]);
    const fisher = makeEmbedding([3]) as FisherDiagonal;
    const penalty = computeEWCPenalty(current, optimal, fisher, 0.2);
    expect(penalty).toBeCloseTo(1.2);
  });

  it('handles arrays of different lengths (uses min)', () => {
    const current = makeEmbedding([1, 2, 3]);
    const optimal = makeEmbedding([0, 0]);
    const fisher = makeEmbedding([1, 1]) as FisherDiagonal;
    // Should not throw
    expect(() => computeEWCPenalty(current, optimal, fisher, 0.1)).not.toThrow();
  });
});

// ─── neuralODEStep ───────────────────────────────────────────────────────────

describe('neuralODEStep', () => {
  it('returns Float64Array of same dimension as input', () => {
    const z = makeEmbedding([1, 0, -1]);
    const kernel = makeEmbedding(new Array(9).fill(0.1));
    const zNext = neuralODEStep(z, 0.1, kernel);
    expect(zNext).toBeInstanceOf(Float64Array);
    expect(zNext.length).toBe(3);
  });

  it('does not modify input array', () => {
    const z = makeEmbedding([1, 2, 3]);
    const original = Array.from(z);
    const kernel = makeEmbedding(new Array(9).fill(0.01));
    neuralODEStep(z, 0.1, kernel);
    expect(Array.from(z)).toEqual(original);
  });

  it('produces finite values', () => {
    const z = makeEmbedding([0.5, -0.5, 0.3]);
    const kernel = makeEmbedding(new Array(9).fill(0.1));
    const zNext = neuralODEStep(z, 0.1, kernel);
    for (const v of zNext) {
      expect(isFinite(v)).toBe(true);
    }
  });

  it('zero dt produces z + 0 * f(z) = z', () => {
    const z = makeEmbedding([1, 2, 3]);
    const kernel = makeEmbedding(new Array(9).fill(1.0));
    const zNext = neuralODEStep(z, 0.0, kernel);
    // With dt=0, Euler step: zNext = z + 0 * dz = z
    for (let i = 0; i < z.length; i++) {
      expect(zNext[i]).toBeCloseTo(z[i]);
    }
  });

  it('applies tanh activation (bounded output)', () => {
    // With large weights and large z, dz should be in [-1, 1] (tanh range)
    const z = makeEmbedding([100, 100, 100]);
    const kernel = makeEmbedding(new Array(9).fill(100.0));
    const zNext = neuralODEStep(z, 0.1, kernel);
    // zNext = z + dt * tanh(W*z), tanh output ∈ (-1,1), so each element
    // should be near z[i] ± 0.1
    for (let i = 0; i < z.length; i++) {
      expect(Math.abs(zNext[i] - z[i])).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });
});

// ─── integrateODE ────────────────────────────────────────────────────────────

describe('integrateODE', () => {
  it('returns Float64Array of same dimension as input', () => {
    const z0 = makeEmbedding([1, 0, -1, 0.5]);
    const kernel = makeEmbedding(new Array(16).fill(0.01));
    const z1 = integrateODE(z0, kernel);
    expect(z1).toBeInstanceOf(Float64Array);
    expect(z1.length).toBe(4);
  });

  it('does not modify input z0', () => {
    const z0 = makeEmbedding([1, 2]);
    const original = Array.from(z0);
    const kernel = makeEmbedding(new Array(4).fill(0.1));
    integrateODE(z0, kernel);
    expect(Array.from(z0)).toEqual(original);
  });

  it('produces finite values after integration', () => {
    const z0 = makeEmbedding([0.1, -0.2, 0.3]);
    const kernel = makeEmbedding(new Array(9).fill(0.05));
    const z1 = integrateODE(z0, kernel, 20);
    for (const v of z1) {
      expect(isFinite(v)).toBe(true);
    }
  });

  it('accepts custom nSteps', () => {
    const z0 = makeEmbedding([1, 1]);
    const kernel = makeEmbedding(new Array(4).fill(0.01));
    const z5 = integrateODE(z0, kernel, 5);
    const z100 = integrateODE(z0, kernel, 100);
    // Both should produce valid Float64Arrays, but different values
    expect(z5.length).toBe(2);
    expect(z100.length).toBe(2);
  });

  it('with nSteps=1 matches single neuralODEStep with dt=1', () => {
    const z0 = makeEmbedding([0.5, -0.5]);
    const kernel = makeEmbedding([0.1, 0.2, 0.3, 0.4]);
    const z1 = integrateODE(z0, kernel, 1);
    const zExpected = neuralODEStep(z0, 1.0, kernel);
    for (let i = 0; i < z0.length; i++) {
      expect(z1[i]).toBeCloseTo(zExpected[i]);
    }
  });
});

// ─── EpisodicBuffer ──────────────────────────────────────────────────────────

describe('EpisodicBuffer', () => {
  it('initializes with given capacity and empty buffer', () => {
    const buf = new EpisodicBuffer(10);
    expect(buf.capacity).toBe(10);
    expect(buf.size).toBe(0);
    expect(buf.getAll()).toHaveLength(0);
  });

  it('adds embeddings and tracks size', () => {
    const buf = new EpisodicBuffer(5);
    buf.add('trait1', makeEmbedding([1, 0, 0]));
    buf.add('trait2', makeEmbedding([0, 1, 0]));
    expect(buf.size).toBe(2);
  });

  it('evicts oldest entry when capacity exceeded (FIFO)', () => {
    const buf = new EpisodicBuffer(2);
    buf.add('a', makeEmbedding([1, 0]));
    buf.add('b', makeEmbedding([0, 1]));
    buf.add('c', makeEmbedding([1, 1]));
    expect(buf.size).toBe(2);
    const names = buf.getAll().map((e) => e.name);
    expect(names).toContain('b');
    expect(names).toContain('c');
    expect(names).not.toContain('a');
  });

  it('capacity 1 always keeps the latest', () => {
    const buf = new EpisodicBuffer(1);
    buf.add('first', makeEmbedding([1]));
    buf.add('second', makeEmbedding([2]));
    expect(buf.size).toBe(1);
    expect(buf.getAll()[0].name).toBe('second');
  });

  it('getAll returns copies not mutated by further adds', () => {
    const buf = new EpisodicBuffer(5);
    buf.add('a', makeEmbedding([1]));
    const snapshot = buf.getAll();
    buf.add('b', makeEmbedding([2]));
    expect(snapshot).toHaveLength(1);
    expect(buf.size).toBe(2);
  });

  it('retrieve returns top-k by cosine similarity', () => {
    const buf = new EpisodicBuffer(10);
    buf.add('similar', makeEmbedding([1, 0, 0]));
    buf.add('orthogonal', makeEmbedding([0, 1, 0]));
    buf.add('opposite', makeEmbedding([-1, 0, 0]));
    const query = makeEmbedding([1, 0, 0]);
    const results = buf.retrieve(query, 2);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('similar');
    expect(results[0].similarity).toBeCloseTo(1.0);
    expect(results[1].similarity).toBeGreaterThanOrEqual(-1.0);
  });

  it('retrieve returns fewer than topK if buffer has fewer entries', () => {
    const buf = new EpisodicBuffer(5);
    buf.add('only', makeEmbedding([1, 0]));
    const results = buf.retrieve(makeEmbedding([1, 0]), 10);
    expect(results).toHaveLength(1);
  });

  it('retrieve similarity is 0 for zero-vector query (handled gracefully)', () => {
    const buf = new EpisodicBuffer(5);
    buf.add('trait', makeEmbedding([1, 2, 3]));
    const results = buf.retrieve(makeEmbedding([0, 0, 0]), 1);
    expect(results[0].similarity).toBe(0);
  });

  it('retrieve sorts results in descending similarity order', () => {
    const buf = new EpisodicBuffer(10);
    buf.add('a', makeEmbedding([1, 0]));
    buf.add('b', makeEmbedding([0.5, 0.5]));
    buf.add('c', makeEmbedding([0, 1]));
    const query = makeEmbedding([1, 0]);
    const results = buf.retrieve(query, 3);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
    }
  });
});

// ─── ContinualTraitLearner ───────────────────────────────────────────────────

describe('ContinualTraitLearner', () => {
  let learner: ContinualTraitLearner;

  beforeEach(() => {
    learner = new ContinualTraitLearner({ embeddingDim: 8, bufferSize: 20, maxIterations: 5 });
  });

  describe('constructor', () => {
    it('creates instance with default options', () => {
      const defaultLearner = new ContinualTraitLearner();
      expect(defaultLearner).toBeDefined();
      expect(defaultLearner.traitCount).toBe(0);
    });

    it('accepts custom options', () => {
      const custom = new ContinualTraitLearner({ ewcLambda: 0.5, embeddingDim: 16 });
      expect(custom).toBeDefined();
    });
  });

  describe('addTrait', () => {
    it('adds a trait and returns LearningResult', async () => {
      const trait = makeTraitDescriptor('@grabbable', new Array(8).fill(0.1));
      const result = await learner.addTrait(trait);
      expect(result.traitName).toBe('@grabbable');
      expect(result.version).toBe('v1.0.0');
      expect(result.forgettingScore).toBeGreaterThanOrEqual(0);
      expect(result.forgettingScore).toBeLessThanOrEqual(1);
      expect(result.ewcPenalty).toBeGreaterThanOrEqual(0);
      expect(typeof result.converged).toBe('boolean');
      expect(result.iterations).toBeGreaterThan(0);
    });

    it('stores trait embedding after adding', async () => {
      const trait = makeTraitDescriptor('@physics', new Array(8).fill(0.5));
      await learner.addTrait(trait);
      const emb = learner.getEmbedding('@physics');
      expect(emb).toBeDefined();
      expect(emb).toBeInstanceOf(Float64Array);
      expect(emb!.length).toBe(8);
    });

    it('increments traitCount after adding', async () => {
      expect(learner.traitCount).toBe(0);
      await learner.addTrait(makeTraitDescriptor('t1', new Array(8).fill(0.1)));
      expect(learner.traitCount).toBe(1);
      await learner.addTrait(makeTraitDescriptor('t2', new Array(8).fill(0.2)));
      expect(learner.traitCount).toBe(2);
    });

    it('handles trait embedding shorter than embeddingDim (resize)', async () => {
      const shortTrait: TraitDescriptor = {
        name: 'shortTrait',
        embedding: makeEmbedding([1, 2, 3]), // 3 < embeddingDim=8
        version: 'v1.0.0',
        category: 'test',
      };
      await expect(learner.addTrait(shortTrait)).resolves.toBeDefined();
    });

    it('handles trait embedding longer than embeddingDim (fold)', async () => {
      const longTrait: TraitDescriptor = {
        name: 'longTrait',
        embedding: makeEmbedding(new Array(16).fill(0.1)), // 16 > embeddingDim=8
        version: 'v1.0.0',
        category: 'test',
      };
      await expect(learner.addTrait(longTrait)).resolves.toBeDefined();
    });

    it('computes EWC penalty based on prior traits', async () => {
      // Add first trait
      const t1 = makeTraitDescriptor('t1', new Array(8).fill(0.3));
      const r1 = await learner.addTrait(t1);
      expect(r1.ewcPenalty).toBe(0); // No prior traits = no penalty

      // Add second trait
      const t2 = makeTraitDescriptor('t2', new Array(8).fill(0.6));
      const r2 = await learner.addTrait(t2);
      // EWC penalty may or may not be exactly 0 depending on fisher values
      expect(r2.ewcPenalty).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getEmbedding', () => {
    it('returns undefined for unknown trait', () => {
      expect(learner.getEmbedding('unknown')).toBeUndefined();
    });

    it('returns embedding after adding trait', async () => {
      const trait = makeTraitDescriptor('@networked', new Array(8).fill(0.7));
      await learner.addTrait(trait);
      expect(learner.getEmbedding('@networked')).toBeInstanceOf(Float64Array);
    });
  });

  describe('consolidateVersion', () => {
    it('returns TaskSnapshot with version and traitNames', async () => {
      await learner.addTrait(makeTraitDescriptor('t1', new Array(8).fill(0.1)));
      await learner.addTrait(makeTraitDescriptor('t2', new Array(8).fill(0.2)));
      const snap = learner.consolidateVersion('v6.0.0');
      expect(snap.version).toBe('v6.0.0');
      expect(snap.traitNames).toContain('t1');
      expect(snap.traitNames).toContain('t2');
      expect(snap.fisher).toBeInstanceOf(Float64Array);
      expect(snap.optimalWeights).toBeInstanceOf(Float64Array);
    });

    it('stores snapshot and increments snapshots array', async () => {
      expect(learner.snapshots.length).toBe(0);
      learner.consolidateVersion('v1');
      expect(learner.snapshots.length).toBe(1);
      learner.consolidateVersion('v2');
      expect(learner.snapshots.length).toBe(2);
    });

    it('snapshot with no traits has empty traitNames', () => {
      const snap = learner.consolidateVersion('v0');
      expect(snap.traitNames).toHaveLength(0);
      expect(snap.fisher).toBeInstanceOf(Float64Array);
    });
  });

  describe('retrieveSimilarTraits', () => {
    it('returns empty array when no traits added', () => {
      const query = makeEmbedding(new Array(8).fill(0.1));
      const results = learner.retrieveSimilarTraits(query, 5);
      expect(results).toHaveLength(0);
    });

    it('returns most similar traits', async () => {
      await learner.addTrait(makeTraitDescriptor('t1', new Array(8).fill(0.9)));
      await learner.addTrait(makeTraitDescriptor('t2', new Array(8).fill(0.1)));
      const query = makeEmbedding(new Array(8).fill(0.9));
      const results = learner.retrieveSimilarTraits(query, 2);
      expect(results.length).toBeGreaterThanOrEqual(1);
      // t1 should be more similar
      expect(results[0].name).toBe('t1');
    });

    it('uses default topK=5', async () => {
      for (let i = 0; i < 3; i++) {
        await learner.addTrait(makeTraitDescriptor(`t${i}`, new Array(8).fill(i / 10)));
      }
      const query = makeEmbedding(new Array(8).fill(0.1));
      const results = learner.retrieveSimilarTraits(query);
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('computeForgettingScore', () => {
    it('returns 0 when no traits in episodic buffer', () => {
      expect(learner.computeForgettingScore()).toBe(0);
    });

    it('returns value between 0 and 1', async () => {
      await learner.addTrait(makeTraitDescriptor('t1', new Array(8).fill(0.5)));
      const score = learner.computeForgettingScore();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('checkBackwardCompatibility', () => {
    it('returns empty arrays when snapshot has no traits', () => {
      const snap: TaskSnapshot = {
        version: 'v0',
        traitNames: [],
        fisher: new Float64Array(8),
        optimalWeights: new Float64Array(8),
      };
      const { compatible, incompatible } = learner.checkBackwardCompatibility(snap);
      expect(compatible).toHaveLength(0);
      expect(incompatible).toHaveLength(0);
    });

    it('marks traits as incompatible if not in current learner', () => {
      const snap: TaskSnapshot = {
        version: 'v1',
        traitNames: ['unknownTrait'],
        fisher: new Float64Array(8),
        optimalWeights: new Float64Array(8),
      };
      const { compatible, incompatible } = learner.checkBackwardCompatibility(snap);
      expect(incompatible).toContain('unknownTrait');
      expect(compatible).not.toContain('unknownTrait');
    });

    it('marks traits as compatible or incompatible based on similarity threshold', async () => {
      await learner.addTrait(makeTraitDescriptor('knownTrait', new Array(8).fill(0.5)));
      const snap: TaskSnapshot = {
        version: 'v1',
        traitNames: ['knownTrait'],
        fisher: new Float64Array(8),
        optimalWeights: new Float64Array(8), // all zeros
      };
      const { compatible, incompatible } = learner.checkBackwardCompatibility(snap);
      // knownTrait exists, so it should be classified (not in unknown category)
      expect(compatible.length + incompatible.length).toBe(1);
      expect(compatible.concat(incompatible)).toContain('knownTrait');
    });

    it('accepts custom threshold', async () => {
      await learner.addTrait(makeTraitDescriptor('t', new Array(8).fill(0.5)));
      const snap: TaskSnapshot = {
        version: 'v1',
        traitNames: ['t'],
        fisher: new Float64Array(8),
        optimalWeights: new Float64Array(8).fill(0.5),
      };
      const result0 = learner.checkBackwardCompatibility(snap, 0);
      const result1 = learner.checkBackwardCompatibility(snap, 1.0);
      // threshold 0 = everything compatible (similarity > 0), threshold 1 = everything incompatible
      expect(result0.compatible.length + result0.incompatible.length).toBe(1);
      expect(result1.compatible.length + result1.incompatible.length).toBe(1);
    });
  });

  describe('snapshots getter', () => {
    it('returns empty readonly array initially', () => {
      expect(learner.snapshots).toHaveLength(0);
    });

    it('reflects consolidated versions', async () => {
      await learner.addTrait(makeTraitDescriptor('t1', new Array(8).fill(0.1)));
      learner.consolidateVersion('v1');
      expect(learner.snapshots).toHaveLength(1);
      expect(learner.snapshots[0].version).toBe('v1');
    });
  });

  describe('end-to-end: multi-trait learning', () => {
    it('learns multiple traits without error', async () => {
      const traits = [
        makeTraitDescriptor('@grabbable', new Array(8).fill(0.1), 'v1', 'interaction'),
        makeTraitDescriptor('@physics', new Array(8).fill(0.5), 'v1', 'physics'),
        makeTraitDescriptor('@networked', new Array(8).fill(0.9), 'v1', 'networking'),
      ];
      for (const t of traits) {
        const result = await learner.addTrait(t);
        expect(result.traitName).toBe(t.name);
      }
      expect(learner.traitCount).toBe(3);
    });

    it('consolidate after adding traits then continue adding', async () => {
      await learner.addTrait(makeTraitDescriptor('t1', new Array(8).fill(0.2)));
      learner.consolidateVersion('v6.0.0');
      await learner.addTrait(makeTraitDescriptor('t2', new Array(8).fill(0.4)));
      expect(learner.traitCount).toBe(2);
      expect(learner.snapshots.length).toBe(1);
    });
  });
});
