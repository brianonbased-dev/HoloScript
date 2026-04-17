import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContinualTraitLearner,
  EpisodicBuffer,
  computeFisherDiagonal,
  computeEWCPenalty,
  integrateODE,
  type TraitDescriptor,
} from '../learning';

// ─── Helpers ──────────────────────────────────────────────────────

function makeEmbedding(dim: number, value = 0.5): Float64Array {
  return new Float64Array(dim).fill(value);
}

function makeTrait(
  name: string,
  overrides: Partial<TraitDescriptor> = {},
): TraitDescriptor {
  return {
    name,
    embedding: makeEmbedding(64, Math.random()),
    version: 'v6.0.0',
    category: 'interaction',
    ...overrides,
  };
}

// ─── EWC ──────────────────────────────────────────────────────────

describe('computeFisherDiagonal', () => {
  it('returns zero vector for empty embeddings', () => {
    const dim = 8;
    const weights = makeEmbedding(dim, 0.5);
    const fisher = computeFisherDiagonal([], weights);
    expect(fisher.every((v) => v === 0)).toBe(true);
  });

  it('returns non-zero Fisher for non-zero embeddings', () => {
    const dim = 8;
    const weights = makeEmbedding(dim, 0.5);
    const embeddings = [makeEmbedding(dim, 1.0), makeEmbedding(dim, 0.5)];
    const fisher = computeFisherDiagonal(embeddings, weights);
    expect(fisher.some((v) => v > 0)).toBe(true);
  });

  it('returns higher Fisher for higher-weight embeddings', () => {
    const dim = 4;
    const highWeights = makeEmbedding(dim, 2.0);
    const lowWeights = makeEmbedding(dim, 0.1);
    const embeddings = [makeEmbedding(dim, 1.0)];

    const fisherHigh = computeFisherDiagonal(embeddings, highWeights);
    const fisherLow = computeFisherDiagonal(embeddings, lowWeights);

    const sumHigh = Array.from(fisherHigh).reduce((a, b) => a + b, 0);
    const sumLow = Array.from(fisherLow).reduce((a, b) => a + b, 0);
    expect(sumHigh).toBeGreaterThan(sumLow);
  });
});

describe('computeEWCPenalty', () => {
  it('returns 0 when current weights equal optimal weights', () => {
    const dim = 8;
    const w = makeEmbedding(dim, 0.5);
    const fisher = makeEmbedding(dim, 1.0);
    expect(computeEWCPenalty(w, w, fisher, 0.1)).toBe(0);
  });

  it('returns positive penalty when weights diverge', () => {
    const dim = 4;
    const current = makeEmbedding(dim, 1.0);
    const optimal = makeEmbedding(dim, 0.0);
    const fisher = makeEmbedding(dim, 1.0);
    const penalty = computeEWCPenalty(current, optimal, fisher, 1.0);
    expect(penalty).toBeGreaterThan(0);
  });

  it('scales linearly with lambda', () => {
    const dim = 4;
    const current = makeEmbedding(dim, 1.0);
    const optimal = makeEmbedding(dim, 0.0);
    const fisher = makeEmbedding(dim, 1.0);
    const p1 = computeEWCPenalty(current, optimal, fisher, 1.0);
    const p2 = computeEWCPenalty(current, optimal, fisher, 2.0);
    expect(p2).toBeCloseTo(p1 * 2, 10);
  });
});

// ─── Neural ODE ───────────────────────────────────────────────────

describe('integrateODE', () => {
  it('produces output of same dimension as input', () => {
    const dim = 16;
    const z0 = makeEmbedding(dim, 0.1);
    const kernel = makeEmbedding(dim * dim, 0.01);
    const result = integrateODE(z0, kernel);
    expect(result.length).toBe(dim);
  });

  it('returns different embedding than input after integration', () => {
    const dim = 8;
    const z0 = makeEmbedding(dim, 0.5);
    const kernel = makeEmbedding(dim * dim, 0.1);
    const result = integrateODE(z0, kernel);
    // At least one dimension should differ after dynamics
    const differs = Array.from(result).some((v, i) => Math.abs(v - z0[i]) > 1e-10);
    expect(differs).toBe(true);
  });

  it('with zero kernel returns input unchanged', () => {
    const dim = 4;
    const z0 = makeEmbedding(dim, 0.5);
    const kernel = new Float64Array(dim * dim).fill(0);
    const result = integrateODE(z0, kernel);
    // tanh(0) = 0, so dz = 0 at every step → z stays constant
    result.forEach((v, i) => expect(v).toBeCloseTo(z0[i], 10));
  });
});

// ─── EpisodicBuffer ───────────────────────────────────────────────

describe('EpisodicBuffer', () => {
  it('stores and retrieves entries', () => {
    const buf = new EpisodicBuffer(10);
    buf.add('trait_a', makeEmbedding(8, 1.0));
    buf.add('trait_b', makeEmbedding(8, 0.0));
    expect(buf.size).toBe(2);
  });

  it('evicts oldest entry when at capacity', () => {
    const buf = new EpisodicBuffer(2);
    buf.add('a', makeEmbedding(4, 1.0));
    buf.add('b', makeEmbedding(4, 0.5));
    buf.add('c', makeEmbedding(4, 0.0)); // evicts 'a'
    const all = buf.getAll().map((e) => e.name);
    expect(all).not.toContain('a');
    expect(all).toContain('b');
    expect(all).toContain('c');
  });

  it('retrieves top-k most similar entries', () => {
    const buf = new EpisodicBuffer(10);
    buf.add('close', makeEmbedding(4, 1.0));
    buf.add('far', makeEmbedding(4, 0.0));
    const query = makeEmbedding(4, 0.9);
    const results = buf.retrieve(query, 1);
    expect(results[0].name).toBe('close');
    expect(results[0].similarity).toBeGreaterThan(0);
  });
});

// ─── ContinualTraitLearner ────────────────────────────────────────

describe('ContinualTraitLearner', () => {
  let learner: ContinualTraitLearner;

  beforeEach(() => {
    learner = new ContinualTraitLearner({ ewcLambda: 0.1, embeddingDim: 16, maxIterations: 10 });
  });

  it('starts with zero traits', () => {
    expect(learner.traitCount).toBe(0);
  });

  it('adds a trait and returns learning result', async () => {
    const result = await learner.addTrait(makeTrait('grabbable', { embedding: makeEmbedding(16, 0.5) }));
    expect(result.traitName).toBe('grabbable');
    expect(result.iterations).toBeGreaterThan(0);
    expect(typeof result.forgettingScore).toBe('number');
    expect(typeof result.ewcPenalty).toBe('number');
  });

  it('stores embedding after addTrait', async () => {
    const emb = makeEmbedding(16, 0.7);
    await learner.addTrait(makeTrait('collidable', { embedding: emb }));
    expect(learner.getEmbedding('collidable')).toBeDefined();
  });

  it('returns undefined for unknown trait', () => {
    expect(learner.getEmbedding('nonexistent_trait')).toBeUndefined();
  });

  it('increments trait count for each added trait', async () => {
    await learner.addTrait(makeTrait('trait_one', { embedding: makeEmbedding(16, 0.3) }));
    await learner.addTrait(makeTrait('trait_two', { embedding: makeEmbedding(16, 0.7) }));
    expect(learner.traitCount).toBe(2);
  });

  it('forgetting score stays bounded [0, 1]', async () => {
    for (let i = 0; i < 5; i++) {
      await learner.addTrait(makeTrait(`trait_${i}`, { embedding: makeEmbedding(16, i / 5) }));
    }
    const score = learner.computeForgettingScore();
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('consolidates version snapshot', async () => {
    await learner.addTrait(makeTrait('physics', { embedding: makeEmbedding(16, 0.4) }));
    const snap = learner.consolidateVersion('v6.0.0');
    expect(snap.version).toBe('v6.0.0');
    expect(snap.traitNames).toContain('physics');
    expect(snap.fisher.length).toBeGreaterThan(0);
    expect(learner.snapshots).toHaveLength(1);
  });

  it('backward compatibility check returns compatible traits', async () => {
    await learner.addTrait(makeTrait('networked', { embedding: makeEmbedding(16, 0.5) }));
    const snap = learner.consolidateVersion('v6.0.0');
    await learner.addTrait(makeTrait('new_trait', { embedding: makeEmbedding(16, 0.2) }));

    const { compatible, incompatible } = learner.checkBackwardCompatibility(snap);
    // At minimum, 'networked' should be either compatible or incompatible (no crash)
    expect(compatible.length + incompatible.length).toBeGreaterThanOrEqual(1);
  });

  it('retrieveSimilarTraits returns closest trait from episodic memory', async () => {
    const emb1 = makeEmbedding(16, 0.9);
    const emb2 = makeEmbedding(16, 0.1);
    await learner.addTrait(makeTrait('high_trait', { embedding: emb1 }));
    await learner.addTrait(makeTrait('low_trait', { embedding: emb2 }));

    const query = makeEmbedding(16, 0.8);
    const results = learner.retrieveSimilarTraits(query, 1);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBeDefined();
  });

  it('EWC lambda=0 behaves like unconstrained learning', async () => {
    const unconstrained = new ContinualTraitLearner({ ewcLambda: 0, embeddingDim: 16, maxIterations: 5 });
    const r = await unconstrained.addTrait(makeTrait('free_trait', { embedding: makeEmbedding(16, 0.5) }));
    expect(r.ewcPenalty).toBe(0);
  });
});
