import { beforeAll, describe, expect, it } from 'vitest';
import {
  LABELED_NOVELTY_EVAL_SET,
  SEMANTIC_NOVELTY_MODEL,
  SEMANTIC_NOVELTY_THRESHOLD,
  assessSemanticNovelty,
  calibrateNoveltyThreshold,
  cosineSimilarity,
  embedSemantic,
} from '../SemanticNoveltyEncoder';

describe('SemanticNoveltyEncoder — pure helpers (always run)', () => {
  it('cosineSimilarity of identical L2-normalized vectors is ~1', () => {
    const v = [0.6, 0.8];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });
  it('cosineSimilarity of orthogonal vectors is 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  it('rejects mismatched lengths', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow();
  });

  it('calibrateNoveltyThreshold finds the gap midpoint + separability (pure)', () => {
    const c = calibrateNoveltyThreshold([
      { similarity: 0.7, isMatch: true },
      { similarity: 0.65, isMatch: true },
      { similarity: 0.3, isMatch: false },
      { similarity: 0.1, isMatch: false },
    ]);
    expect(c.separable).toBe(true);
    expect(c.minMatchSim).toBe(0.65);
    expect(c.maxNoMatchSim).toBe(0.3);
    expect(c.threshold).toBeCloseTo(0.475, 3);
    expect(c.gap).toBeCloseTo(0.35, 3);
  });

  it('flags non-separable classes honestly', () => {
    const c = calibrateNoveltyThreshold([
      { similarity: 0.5, isMatch: true },
      { similarity: 0.6, isMatch: false }, // overlap
    ]);
    expect(c.separable).toBe(false);
  });

  it('requires at least one match and one no-match', () => {
    expect(() => calibrateNoveltyThreshold([{ similarity: 0.9, isMatch: true }])).toThrow();
  });
});

// Model-gated: runs the real local model if available (cached/offline); skips cleanly
// in an environment without it (no network, no cache) rather than hanging CI.
describe(`SemanticNoveltyEncoder — learned model (${SEMANTIC_NOVELTY_MODEL})`, () => {
  let available = false;
  beforeAll(async () => {
    try {
      await embedSemantic('warmup');
      available = true;
    } catch {
      available = false;
    }
  }, 120_000);

  it('embeds to an L2-normalized vector, deterministic for the same text', async (ctx) => {
    if (!available) return ctx.skip();
    const a1 = await embedSemantic('Every convex polyhedron satisfies V - E + F = 2.');
    const a2 = await embedSemantic('Every convex polyhedron satisfies V - E + F = 2.');
    expect(a1.length).toBeGreaterThan(0);
    expect(cosineSimilarity(a1, a1)).toBeCloseTo(1, 5); // L2-normalized
    expect(a1).toEqual(a2); // byte-identical, same text (same-machine determinism)
  });

  it('scores a paraphrase far above an unrelated sentence (catches what trigram misses)', async (ctx) => {
    if (!available) return ctx.skip();
    const claim = await embedSemantic(
      'Every convex polyhedron satisfies V minus E plus F equals two.'
    );
    const paraphrase = await embedSemantic(
      'For any convex polyhedron, vertices minus edges plus faces is 2.'
    );
    const unrelated = await embedSemantic(
      'The cat sat on the warm windowsill in the afternoon sun.'
    );
    const simPara = cosineSimilarity(claim, paraphrase);
    const simUnrel = cosineSimilarity(claim, unrelated);
    expect(simPara).toBeGreaterThan(0.5); // paraphrase is semantically close
    expect(simPara).toBeGreaterThan(simUnrel + 0.3); // clean separation
  });

  it('flags a paraphrase of a known result as near-duplicate (the W.520 false-negative the trigram guard misses)', async (ctx) => {
    if (!available) return ctx.skip();
    const corpus = [
      {
        id: 'prior.topology.euler',
        title: 'Euler characteristic',
        source: 'Euler 1758',
        statement: 'For every convex polyhedron, vertices minus edges plus faces equals two.',
      },
      {
        id: 'prior.geometry.pythagoras',
        title: 'Pythagoras',
        source: 'classical',
        statement:
          'In a right triangle the hypotenuse squared equals the sum of the other two sides squared.',
      },
    ];
    // a PARAPHRASE (not verbatim) of the Euler entry — trigram@0.995 would call this novel
    const a = await assessSemanticNovelty(
      'Any convex solid has its corner count minus its edge count plus its face count equal to 2.',
      corpus
    );
    expect(a.binding).toBe('advisory');
    expect(a.status).toBe('near-duplicate');
    expect(a.nearest?.priorArtId).toBe('prior.topology.euler');

    // a genuinely unrelated claim stays novel
    const b = await assessSemanticNovelty(
      'Agent worldlines form a braid whose word determines hash-equal shared state.',
      corpus
    );
    expect(b.status).toBe('novel');
  });

  it('the labeled eval set is separable, and the shipped threshold classifies all pairs (P2 calibration)', async (ctx) => {
    if (!available) return ctx.skip();
    const scored = [];
    for (const p of LABELED_NOVELTY_EVAL_SET) {
      const sim = cosineSimilarity(await embedSemantic(p.query), await embedSemantic(p.reference));
      scored.push({ similarity: sim, isMatch: p.isMatch });
    }
    const calib = calibrateNoveltyThreshold(scored);
    expect(calib.separable).toBe(true); // the two classes do not overlap
    // the shipped threshold sits inside the gap → classifies every labeled pair correctly
    expect(SEMANTIC_NOVELTY_THRESHOLD).toBeGreaterThan(calib.maxNoMatchSim);
    expect(SEMANTIC_NOVELTY_THRESHOLD).toBeLessThan(calib.minMatchSim);
    for (const s of scored) {
      expect(s.similarity >= SEMANTIC_NOVELTY_THRESHOLD).toBe(s.isMatch);
    }
  });
});
