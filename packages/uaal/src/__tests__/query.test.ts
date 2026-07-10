import { describe, expect, it } from 'vitest';
import { nodeMatchesAbout, queryIR } from '../query';
import type { UAALQueryHit, UAALQueryableIR } from '../query';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const doc0: UAALQueryableIR = {
  provenance: { source_kind: 'observation' },
  instance_id: 'inst-0',
  entities: [
    { id: 'e_door', kind: 'object', label: 'Door', uri: 'holo://world/door' },
    { id: 'e_marin', kind: 'agent', label: 'Marin' },
  ],
  events: [{ id: 'ev_open', actor: 'e_marin', act: 'open', object: 'e_door', t: 1 }],
  propositions: [
    { id: 'p_door_open', subject: 'e_door', predicate: 'is_open', confidence: 0.9 },
    { id: 'p_wind', text: 'wind is blowing', confidence: 0.4 },
  ],
  beliefs: [{ id: 'b_marin', agent: 'e_marin', prop: 'p_door_open', confidence: 0.8 }],
};

const doc1: UAALQueryableIR = {
  provenance: { source_kind: 'report' },
  // no instance_id — envelope fields are optional
  entities: [{ id: 'e_door', kind: 'object', uri: 'holo://world/door' }],
  propositions: [{ id: 'p_door_shut', subject: 'e_door', predicate: 'is_open', negated: true }],
};

/** Malformed document: garbage collection value + junk nodes. No provenance. */
const doc2 = {
  propositions: 'garbage',
  beliefs: [null, 42, { id: 'b_ghost', agent: 'e_ghost' }],
} as unknown as UAALQueryableIR;

const corpus: UAALQueryableIR[] = [doc0, doc1, doc2];

// doc0: 2 entities + 1 event + 2 propositions + 1 belief = 6
// doc1: 1 entity + 1 proposition                          = 2
// doc2: 1 valid belief                                    = 1
const TOTAL_HITS = 9;

function ids(hits: UAALQueryHit[]): Array<unknown> {
  return hits.map((hit) => hit.node.id);
}

// ---------------------------------------------------------------------------
// Baseline traversal
// ---------------------------------------------------------------------------

describe('queryIR baseline traversal', () => {
  it('returns all nodes flat, in doc order and fixed kind order', () => {
    const hits = queryIR(corpus, {});
    expect(hits).toHaveLength(TOTAL_HITS);
    expect(ids(hits)).toEqual([
      'e_door',
      'e_marin',
      'ev_open',
      'p_door_open',
      'p_wind',
      'b_marin',
      'e_door',
      'p_door_shut',
      'b_ghost',
    ]);
    expect(hits.map((hit) => hit.docIndex)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 2]);
    expect(hits.map((hit) => hit.kind)).toEqual([
      'entity',
      'entity',
      'event',
      'proposition',
      'proposition',
      'belief',
      'entity',
      'proposition',
      'belief',
    ]);
  });

  it('treats a missing query object as no filters', () => {
    expect(queryIR(corpus)).toHaveLength(TOTAL_HITS);
    expect(queryIR(corpus, null)).toHaveLength(TOTAL_HITS);
  });

  it('returns node references without cloning', () => {
    const hits = queryIR(corpus, { kind: 'event' });
    expect(hits[0]?.node).toBe(doc0.events?.[0]);
  });
});

// ---------------------------------------------------------------------------
// Individual filters
// ---------------------------------------------------------------------------

describe('queryIR kind filter', () => {
  it('filters each kind', () => {
    expect(ids(queryIR(corpus, { kind: 'entity' }))).toEqual(['e_door', 'e_marin', 'e_door']);
    expect(ids(queryIR(corpus, { kind: 'event' }))).toEqual(['ev_open']);
    expect(ids(queryIR(corpus, { kind: 'proposition' }))).toEqual(['p_door_open', 'p_wind', 'p_door_shut']);
    expect(ids(queryIR(corpus, { kind: 'belief' }))).toEqual(['b_marin', 'b_ghost']);
  });

  it('matches nothing for an unrecognized kind', () => {
    expect(queryIR(corpus, { kind: 'norm' as never })).toEqual([]);
  });
});

describe('queryIR about filter', () => {
  it('matches the entity itself and every node referencing its id exactly', () => {
    const hits = queryIR(corpus, { about: 'e_door' });
    expect(ids(hits)).toEqual(['e_door', 'ev_open', 'p_door_open', 'e_door', 'p_door_shut']);
  });

  it('matches uri substrings', () => {
    const hits = queryIR(corpus, { about: 'world/door' });
    expect(ids(hits)).toEqual(['e_door', 'e_door']);
    expect(hits.every((hit) => hit.kind === 'entity')).toBe(true);
  });

  it('does not substring-match plain prose', () => {
    // 'wind' appears inside p_wind's text but text is not uri-like.
    expect(queryIR(corpus, { about: 'wind' })).toEqual([]);
    // Exact equality on a string field still matches.
    expect(ids(queryIR(corpus, { about: 'wind is blowing' }))).toEqual(['p_wind']);
  });

  it('scans nested objects (e.g. event telos) up to depth 3', () => {
    const nested: UAALQueryableIR = {
      events: [{ id: 'ev_give', act: 'give', telos: { beneficiary: 'e_rowan', goal: 'aid' } }],
    };
    expect(ids(queryIR([nested], { about: 'e_rowan' }))).toEqual(['ev_give']);
  });

  it('exposes the matching primitive for direct reuse', () => {
    expect(nodeMatchesAbout({ id: 'e_door' }, 'e_door')).toBe(true);
    expect(nodeMatchesAbout({ uri: 'holo://world/door' }, 'world/door')).toBe(true);
    expect(nodeMatchesAbout({ source: 'ledger/page-9' }, 'page-9')).toBe(true); // uri-ish key
    expect(nodeMatchesAbout({ text: 'the door is open' }, 'door')).toBe(false); // prose substring
    expect(nodeMatchesAbout({ blocks: ['e_door'] }, 'e_door')).toBe(true); // string arrays
  });
});

describe('queryIR minConfidence filter', () => {
  it('keeps only nodes with numeric confidence >= the floor', () => {
    expect(ids(queryIR(corpus, { minConfidence: 0.5 }))).toEqual(['p_door_open', 'b_marin']);
  });

  it('excludes nodes without a numeric confidence when the filter is set', () => {
    const hits = queryIR(corpus, { minConfidence: 0 });
    // Only the three nodes carrying confidence match, even at floor 0.
    expect(ids(hits)).toEqual(['p_door_open', 'p_wind', 'b_marin']);
  });

  it('boundary is inclusive', () => {
    expect(ids(queryIR(corpus, { minConfidence: 0.9 }))).toEqual(['p_door_open']);
  });
});

describe('queryIR sourceKind filter', () => {
  it('keeps only docs whose provenance.source_kind matches', () => {
    const hits = queryIR(corpus, { sourceKind: 'report' });
    expect(hits.every((hit) => hit.docIndex === 1)).toBe(true);
    expect(ids(hits)).toEqual(['e_door', 'p_door_shut']);
  });

  it('excludes docs without provenance when the filter is set', () => {
    // doc2 has no provenance — its belief must not appear.
    const hits = queryIR(corpus, { sourceKind: 'observation' });
    expect(hits.every((hit) => hit.docIndex === 0)).toBe(true);
    expect(hits).toHaveLength(6);
  });

  it('matches nothing for an unknown source kind', () => {
    expect(queryIR(corpus, { sourceKind: 'divination' })).toEqual([]);
  });
});

describe('queryIR limit', () => {
  it('caps total hits across the corpus in traversal order', () => {
    const hits = queryIR(corpus, { limit: 3 });
    expect(ids(hits)).toEqual(['e_door', 'e_marin', 'ev_open']);
  });

  it('a limit spanning documents keeps cross-doc order', () => {
    const hits = queryIR(corpus, { limit: 7 });
    expect(hits[6]?.docIndex).toBe(1);
  });

  it('limit 0 returns nothing', () => {
    expect(queryIR(corpus, { limit: 0 })).toEqual([]);
  });

  it('ignores negative or non-finite limits', () => {
    expect(queryIR(corpus, { limit: -5 })).toHaveLength(TOTAL_HITS);
    expect(queryIR(corpus, { limit: Number.NaN })).toHaveLength(TOTAL_HITS);
    expect(queryIR(corpus, { limit: Number.POSITIVE_INFINITY })).toHaveLength(TOTAL_HITS);
  });
});

// ---------------------------------------------------------------------------
// Filter combinations
// ---------------------------------------------------------------------------

describe('queryIR filter combinations', () => {
  it('ANDs kind + about', () => {
    expect(ids(queryIR(corpus, { kind: 'proposition', about: 'e_door' }))).toEqual([
      'p_door_open',
      'p_door_shut',
    ]);
  });

  it('ANDs kind + about + minConfidence + sourceKind', () => {
    const hits = queryIR(corpus, {
      kind: 'proposition',
      about: 'e_door',
      minConfidence: 0.5,
      sourceKind: 'observation',
    });
    expect(ids(hits)).toEqual(['p_door_open']);
    expect(hits[0]?.instanceId).toBe('inst-0');
  });

  it('applies limit after all other filters', () => {
    const hits = queryIR(corpus, { kind: 'entity', limit: 2 });
    expect(ids(hits)).toEqual(['e_door', 'e_marin']);
  });
});

// ---------------------------------------------------------------------------
// Provenance / envelope defensiveness
// ---------------------------------------------------------------------------

describe('queryIR provenance and instanceId', () => {
  it('sets instanceId only when doc.instance_id is a string', () => {
    const hits = queryIR(corpus, {});
    const fromDoc0 = hits.filter((hit) => hit.docIndex === 0);
    const fromDoc1 = hits.filter((hit) => hit.docIndex === 1);
    expect(fromDoc0.every((hit) => hit.instanceId === 'inst-0')).toBe(true);
    expect(fromDoc1.every((hit) => !('instanceId' in hit))).toBe(true);
  });

  it('tolerates non-object and non-string provenance shapes', () => {
    const weird = [
      { provenance: 'observation', entities: [{ id: 'e1' }] },
      { provenance: { source_kind: 42 }, entities: [{ id: 'e2' }] },
      { instance_id: 99, entities: [{ id: 'e3' }] },
    ] as unknown as UAALQueryableIR[];
    // String / numeric provenance never equals a sourceKind filter…
    expect(queryIR(weird, { sourceKind: 'observation' })).toEqual([]);
    // …and a numeric instance_id is simply omitted from hits.
    const hits = queryIR(weird, {});
    expect(ids(hits)).toEqual(['e1', 'e2', 'e3']);
    expect(hits.every((hit) => !('instanceId' in hit))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty / malformed tolerance
// ---------------------------------------------------------------------------

describe('queryIR empty and malformed tolerance', () => {
  it('returns [] for empty or non-array corpora', () => {
    expect(queryIR([], {})).toEqual([]);
    expect(queryIR(null, {})).toEqual([]);
    expect(queryIR(undefined, {})).toEqual([]);
    expect(queryIR('nope' as unknown as UAALQueryableIR[], {})).toEqual([]);
  });

  it('skips non-object documents while preserving docIndex for the rest', () => {
    const sparse = [null, doc1, undefined, 'junk'] as unknown as UAALQueryableIR[];
    const hits = queryIR(sparse, {});
    expect(hits.every((hit) => hit.docIndex === 1)).toBe(true);
    expect(hits).toHaveLength(2);
  });

  it('skips non-array collections and non-object nodes', () => {
    const hits = queryIR([doc2], {});
    expect(ids(hits)).toEqual(['b_ghost']);
  });

  it('does not mutate the corpus', () => {
    const snapshot = JSON.stringify(corpus);
    queryIR(corpus, { about: 'e_door', minConfidence: 0.1, limit: 2 });
    expect(JSON.stringify(corpus)).toBe(snapshot);
  });
});
