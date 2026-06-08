import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEMANTIC_CORPUS_INDEX_VERSION,
  assessSemanticNoveltyIndexed,
  buildSemanticCorpusIndex,
  deserializeIndex,
  nearestByCosine,
  serializeIndex,
  type SemanticCorpusIndex,
} from '../SemanticCorpusIndex';
import { SEMANTIC_NOVELTY_MODEL, embedSemantic } from '../SemanticNoveltyEncoder';

// Hand-built index with explicit unit vectors — no model needed for the pure search tests.
function fakeIndex(): SemanticCorpusIndex {
  return {
    indexVersion: SEMANTIC_CORPUS_INDEX_VERSION,
    modelId: SEMANTIC_NOVELTY_MODEL,
    dim: 2,
    entries: [
      { id: 'b.east', source: 's', title: 'East', statement: 'east', vector: [1, 0] },
      { id: 'a.north', source: 's', title: 'North', statement: 'north', vector: [0, 1] },
      {
        id: 'c.northeast',
        source: 's',
        title: 'NE',
        statement: 'ne',
        vector: [Math.SQRT1_2, Math.SQRT1_2],
      },
    ],
  };
}

describe('SemanticCorpusIndex — pure nearest-search (always run)', () => {
  it('nearestByCosine returns the most similar entry', () => {
    const idx = fakeIndex();
    const east = nearestByCosine([1, 0], idx);
    expect(east?.priorArtId).toBe('b.east');
    expect(east?.similarity).toBeCloseTo(1, 6);
    const ne = nearestByCosine([Math.SQRT1_2, Math.SQRT1_2], idx);
    expect(ne?.priorArtId).toBe('c.northeast');
  });

  it('breaks exact-similarity ties by ascending id', () => {
    // query equidistant to east[1,0] and north[0,1]; both cos = SQRT1_2 → lower id 'a.north' wins.
    const idx = fakeIndex();
    const tie = nearestByCosine([Math.SQRT1_2, Math.SQRT1_2], {
      ...idx,
      entries: idx.entries.filter((e) => e.id !== 'c.northeast'),
    });
    expect(tie?.priorArtId).toBe('a.north');
  });

  it('serialize → deserialize round-trips and validates', () => {
    const idx = fakeIndex();
    const restored = deserializeIndex(serializeIndex(idx));
    expect(restored.entries.length).toBe(3);
    expect(restored.modelId).toBe(SEMANTIC_NOVELTY_MODEL);
    expect(() => deserializeIndex(JSON.stringify({ ...idx, indexVersion: 99 }))).toThrow();
    expect(() => deserializeIndex(JSON.stringify({ ...idx, modelId: 'other/model' }))).toThrow();
    expect(() =>
      deserializeIndex(
        JSON.stringify({ ...idx, entries: [{ id: 'x', statement: 's', source: 's' }] })
      )
    ).toThrow();
  });

  it('rejects an empty corpus at build time', async () => {
    await expect(buildSemanticCorpusIndex([])).rejects.toThrow();
  });
});

// Model-gated: build a small real index and query it.
describe(`SemanticCorpusIndex — learned model (${SEMANTIC_NOVELTY_MODEL})`, () => {
  let available = false;
  beforeAll(async () => {
    try {
      await embedSemantic('warmup');
      available = true;
    } catch {
      available = false;
    }
  }, 120_000);

  it('flags a paraphrase of an indexed result as near-duplicate, unrelated stays novel', async (ctx) => {
    if (!available) return ctx.skip();
    const index = await buildSemanticCorpusIndex([
      {
        id: 'prior.topology.euler',
        title: 'Euler',
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
    ]);
    expect(index.dim).toBeGreaterThan(0);
    const dup = await assessSemanticNoveltyIndexed(
      'Any convex solid has its corner count minus edge count plus face count equal to 2.',
      index
    );
    expect(dup.status).toBe('near-duplicate');
    expect(dup.nearest?.priorArtId).toBe('prior.topology.euler');

    const novel = await assessSemanticNoveltyIndexed(
      'Agent worldlines form a braid whose word determines hash-equal shared state.',
      index
    );
    expect(novel.status).toBe('novel');
  }, 120_000);
}, 120_000);
