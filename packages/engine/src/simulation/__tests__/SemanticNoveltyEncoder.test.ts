import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEMANTIC_NOVELTY_MODEL,
  assessSemanticNovelty,
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
    const claim = await embedSemantic('Every convex polyhedron satisfies V minus E plus F equals two.');
    const paraphrase = await embedSemantic('For any convex polyhedron, vertices minus edges plus faces is 2.');
    const unrelated = await embedSemantic('The cat sat on the warm windowsill in the afternoon sun.');
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
        statement: 'In a right triangle the hypotenuse squared equals the sum of the other two sides squared.',
      },
    ];
    // a PARAPHRASE (not verbatim) of the Euler entry — trigram@0.995 would call this novel
    const a = await assessSemanticNovelty(
      'Any convex solid has its corner count minus its edge count plus its face count equal to 2.',
      corpus,
    );
    expect(a.binding).toBe('advisory');
    expect(a.status).toBe('near-duplicate');
    expect(a.nearest?.priorArtId).toBe('prior.topology.euler');

    // a genuinely unrelated claim stays novel
    const b = await assessSemanticNovelty(
      'Agent worldlines form a braid whose word determines hash-equal shared state.',
      corpus,
    );
    expect(b.status).toBe('novel');
  });
});
