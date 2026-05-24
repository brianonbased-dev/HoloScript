import { beforeAll, describe, expect, it } from 'vitest';
import { attachSemanticAdvisory } from '../ConjectureSemanticAdvisory';
import { buildSemanticCorpusIndex, type SemanticCorpusIndex } from '../SemanticCorpusIndex';
import { SEMANTIC_NOVELTY_MODEL, embedSemantic } from '../SemanticNoveltyEncoder';
import type { ConjectureReceipt, ConjectureStatus } from '../ConjectureEngine';

// Minimal receipt stand-in — attachSemanticAdvisory only reads claim.statement + status and
// passes the receipt through untouched, so a hand-built object exercises the contract fully.
function fakeReceipt(status: ConjectureStatus, statement: string): ConjectureReceipt {
  return {
    solverType: 'conjecture.v1',
    specVersion: 1,
    claim: { id: 'c1', statement, domain: 'geometry', assumptions: [], evidenceRefs: [] },
    intake: { status: 'in-scope', reasons: [] },
    status,
    receiptKey: 'conjecture.v1-sha-deadbeef',
    hashMode: 'fnv1a',
    evaluations: [],
    counterexamples: [],
  } as unknown as ConjectureReceipt;
}

// A tiny pre-built index that needs no model — vectors are explicit unit vectors.
function fakeIndex(): SemanticCorpusIndex {
  return {
    indexVersion: 1,
    modelId: SEMANTIC_NOVELTY_MODEL,
    dim: 2,
    entries: [{ id: 'prior.x', source: 's', title: 'X', statement: 'x', vector: [1, 0] }],
  };
}

describe('attachSemanticAdvisory — receipt non-contamination + gating (pure index)', () => {
  it('passes the receipt through by reference, hash unchanged (skipped path, no model)', async () => {
    // out-of-scope → advisory skipped → no query embed, so this stays pure. The running-path
    // non-mutation proof is the model-gated test below (asserts receiptKey unchanged after a real run).
    const receipt = fakeReceipt('out-of-scope', 'some claim');
    const keyBefore = receipt.receiptKey;
    const result = await attachSemanticAdvisory(receipt, fakeIndex());
    expect(result.receipt).toBe(receipt); // same reference, untouched
    expect(result.receipt.receiptKey).toBe(keyBefore); // hash unchanged
  });

  it('skips advisory for out-of-scope / falsified with a reason', async () => {
    const oos = await attachSemanticAdvisory(fakeReceipt('out-of-scope', 'x'), fakeIndex());
    expect(oos.semanticAdvisory).toBeNull();
    expect(oos.advisorySkippedReason).toBe('status-not-advisable');

    const fal = await attachSemanticAdvisory(fakeReceipt('falsified', 'x'), fakeIndex());
    expect(fal.semanticAdvisory).toBeNull();
  });

  it('skips with empty-index reason when the index has no entries', async () => {
    const empty: SemanticCorpusIndex = { ...fakeIndex(), entries: [] };
    const r = await attachSemanticAdvisory(fakeReceipt('survived', 'x'), empty);
    expect(r.semanticAdvisory).toBeNull();
    expect(r.advisorySkippedReason).toBe('empty-index');
  });

});

// Model-gated: real query embedding against a tiny real index.
describe(`attachSemanticAdvisory — learned model (${SEMANTIC_NOVELTY_MODEL})`, () => {
  let available = false;
  beforeAll(async () => {
    try { await embedSemantic('warmup'); available = true; } catch { available = false; }
  }, 120_000);

  it('attaches an advisory near-duplicate for a paraphrase of an indexed result', async (ctx) => {
    if (!available) return ctx.skip();
    const index = await buildSemanticCorpusIndex([
      { id: 'prior.topology.euler', title: 'Euler', source: 'Euler 1758', statement: 'For every convex polyhedron, vertices minus edges plus faces equals two.' },
    ]);
    const r = await attachSemanticAdvisory(
      fakeReceipt('survived', 'Any convex solid: corners minus edges plus faces is two.'),
      index,
    );
    expect(r.receipt.receiptKey).toBe('conjecture.v1-sha-deadbeef'); // still untouched
    expect(r.semanticAdvisory?.binding).toBe('advisory');
    expect(r.semanticAdvisory?.status).toBe('near-duplicate');
  }, 120_000);
}, 120_000);
