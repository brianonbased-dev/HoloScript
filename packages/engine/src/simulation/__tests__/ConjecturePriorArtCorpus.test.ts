import { describe, expect, it } from 'vitest';
import { CONJECTURE_NOVELTY_THRESHOLD } from '../ConjectureEngine';
import {
  KNOWN_RESULTS_CORPUS,
  assessNoveltyAgainstKnownResults,
} from '../ConjecturePriorArtCorpus';

describe('ConjecturePriorArtCorpus — real-content novelty check', () => {
  it('the corpus is a meaningful seed (>= 10 known results), no duplicate ids', () => {
    expect(KNOWN_RESULTS_CORPUS.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(KNOWN_RESULTS_CORPUS.map((e) => e.id));
    expect(ids.size).toBe(KNOWN_RESULTS_CORPUS.length);
    for (const e of KNOWN_RESULTS_CORPUS) {
      expect(e.statement.length).toBeGreaterThan(0);
      expect(e.source.length).toBeGreaterThan(0);
    }
  });

  it('flags an exact restatement of a known result as rediscovered (near-duplicate)', () => {
    const known = KNOWN_RESULTS_CORPUS.find((e) => e.id === 'prior.numbertheory.erdos-straus')!;
    const a = assessNoveltyAgainstKnownResults(known.statement);
    expect(a.status).toBe('near-duplicate');
    expect(a.nearest?.priorArtId).toBe('prior.numbertheory.erdos-straus');
    expect(a.nearest!.similarity).toBeGreaterThanOrEqual(CONJECTURE_NOVELTY_THRESHOLD);
    expect(a.corpusSize).toBe(KNOWN_RESULTS_CORPUS.length);
  });

  it('flags a restatement of Euler/Pythagoras as rediscovered (the novice-overclaim guard)', () => {
    const euler = KNOWN_RESULTS_CORPUS.find((e) => e.id === 'prior.topology.euler-polyhedron-formula')!;
    expect(assessNoveltyAgainstKnownResults(euler.statement).status).toBe('near-duplicate');
    const pyth = KNOWN_RESULTS_CORPUS.find((e) => e.id === 'prior.geometry.pythagoras')!;
    expect(assessNoveltyAgainstKnownResults(pyth.statement).status).toBe('near-duplicate');
  });

  it('returns novel for a claim with no match in the seed corpus', () => {
    const a = assessNoveltyAgainstKnownResults(
      'Agent worldlines form a braid whose word determines hash-equal CRDT shared state.',
    );
    expect(a.status).toBe('novel');
  });

  it('is deterministic across runs', () => {
    const q = KNOWN_RESULTS_CORPUS[0].statement;
    expect(assessNoveltyAgainstKnownResults(q).nearest?.similarity).toBe(
      assessNoveltyAgainstKnownResults(q).nearest?.similarity,
    );
  });
});
