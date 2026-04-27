/**
 * Tests for the `impossibility.v1` wire format — the counterweight to the
 * consensus side of the solverType family. Grounded on the existing 28-
 * impossibility map and SOLVES/PARTIALLY/REFRAMES/DOESN'T_HELP scoring scale
 * from `research/2026-03-09_holoscript-three-format-impossibility-map.md` and
 * `research/2026-03-09_holoscript-14-impossibilities-outside-the-box.md`.
 *
 * Tests use the documented historical evidence (W.048 Symbol Grounding,
 * W.051 Version Control for 3D, W.053 Digital Preservation, plus the
 * Cross-Platform Determinism DOESN'T_HELP→PARTIALLY upgrade) — not invented
 * scenarios.
 */

import { describe, it, expect } from 'vitest';
import {
  IMPOSSIBILITY_V1,
  aggregateEvidence,
  buildImpossibilityV1Record,
  direction,
  evidenceWireKey,
  rank,
  validateEvidence,
  type ImpossibilityEvidence,
} from '../impossibilityEvidence';

// ── Documented historical evidence (from the 2026-03-09 memos) ──

/** W.048 Symbol Grounding — one of the three documented SOLVES (all-format). */
const W_048_SYMBOL_GROUNDING: ImpossibilityEvidence = {
  id: 'W.048',
  problem: 'Symbol Grounding Problem',
  rating: 'SOLVES',
  formats: ['all'],
  mechanism:
    'Three levels of Harnad grounding: declarative (.holo @weight(5kg) → physics), behavioral (.hsplus state machines on collision), procedural (.hs function + execute).',
  evidenceRefs: [
    'research/2026-03-09_holoscript-14-impossibilities-outside-the-box.md',
    'research/2026-03-09_holoscript-three-format-impossibility-map.md',
  ],
  filedBy: 'memo-author',
};

/** W.051 Version Control for 3D — SOLVES (all formats are plain text). */
const W_051_VERSION_CONTROL: ImpossibilityEvidence = {
  id: 'W.051',
  problem: 'Version Control for 3D',
  rating: 'SOLVES',
  formats: ['all'],
  mechanism: 'All three formats are plain text → git diff/merge/blame works natively.',
  evidenceRefs: ['research/2026-03-09_holoscript-three-format-impossibility-map.md'],
  filedBy: 'memo-author',
};

/** W.053 Digital Preservation — SOLVES (text survives format extinction). */
const W_053_DIGITAL_PRESERVATION: ImpossibilityEvidence = {
  id: 'W.053',
  problem: 'Digital Preservation',
  rating: 'SOLVES',
  formats: ['all'],
  mechanism: 'Human-readable text survives format extinction; readable in 100 years.',
  evidenceRefs: ['research/2026-03-09_holoscript-three-format-impossibility-map.md'],
  filedBy: 'memo-author',
};

/** W.056 Cross-Platform Determinism — historical DOESN'T_HELP → PARTIALLY upgrade. */
const W_056_CROSS_PLATFORM_PRIOR: ImpossibilityEvidence = {
  id: 'W.056',
  problem: 'Cross-Platform Determinism',
  rating: 'DOESNT_HELP',
  formats: ['all'],
  mechanism: 'Bit-exact determinism is impossible across hardware float-rounding differences.',
  evidenceRefs: ['research/2026-03-09_holoscript-14-impossibilities-outside-the-box.md (original)'],
  filedBy: 'memo-author',
};

const W_056_CROSS_PLATFORM_UPGRADED: ImpossibilityEvidence = {
  id: 'W.056',
  problem: 'Cross-Platform Determinism',
  rating: 'PARTIALLY',
  priorRating: 'DOESNT_HELP',
  formats: ['hsplus', 'holo', 'hs'],
  mechanism:
    'Behavioral conformance via .hsplus state machines + networked_object — finite-state behavioral equivalence (not bit-exact).',
  evidenceRefs: [
    'research/2026-03-09_holoscript-14-impossibilities-outside-the-box.md (UPGRADED)',
  ],
  filedBy: 'memo-author',
};

describe('impossibilityEvidence (impossibility.v1 — counterweight to wire-format consensus family)', () => {
  // ── Constants + rating algebra ──

  it('IMPOSSIBILITY_V1 is the documented solverType token', () => {
    expect(IMPOSSIBILITY_V1).toBe('impossibility.v1');
  });

  it('rank() orders ratings strongest → weakest', () => {
    expect(rank('SOLVES')).toBeGreaterThan(rank('PARTIALLY'));
    expect(rank('PARTIALLY')).toBeGreaterThan(rank('REFRAMES'));
    expect(rank('REFRAMES')).toBeGreaterThan(rank('DOESNT_HELP'));
  });

  it('direction() detects upgrade / downgrade / lateral', () => {
    expect(direction('DOESNT_HELP', 'PARTIALLY')).toBe('upgrade');
    expect(direction('SOLVES', 'PARTIALLY')).toBe('downgrade');
    expect(direction('PARTIALLY', 'PARTIALLY')).toBe('lateral');
  });

  it('direction() encodes the documented Cross-Platform Determinism upgrade', () => {
    expect(direction('DOESNT_HELP', 'PARTIALLY')).toBe('upgrade');
  });

  // ── validateEvidence ──

  describe('validateEvidence', () => {
    it('accepts the three documented SOLVES (W.048, W.051, W.053)', () => {
      expect('error' in validateEvidence(W_048_SYMBOL_GROUNDING)).toBe(false);
      expect('error' in validateEvidence(W_051_VERSION_CONTROL)).toBe(false);
      expect('error' in validateEvidence(W_053_DIGITAL_PRESERVATION)).toBe(false);
    });

    it('accepts the W.056 upgrade evidence with priorRating', () => {
      expect('error' in validateEvidence(W_056_CROSS_PLATFORM_UPGRADED)).toBe(false);
    });

    it('rejects non-object inputs', () => {
      expect('error' in validateEvidence(undefined)).toBe(true);
      expect('error' in validateEvidence(null)).toBe(true);
      expect('error' in validateEvidence('W.048')).toBe(true);
      expect('error' in validateEvidence(42)).toBe(true);
    });

    it('rejects empty id / problem / mechanism / filedBy', () => {
      expect('error' in validateEvidence({ ...W_048_SYMBOL_GROUNDING, id: '' })).toBe(true);
      expect('error' in validateEvidence({ ...W_048_SYMBOL_GROUNDING, problem: '' })).toBe(true);
      expect('error' in validateEvidence({ ...W_048_SYMBOL_GROUNDING, mechanism: '' })).toBe(true);
      expect('error' in validateEvidence({ ...W_048_SYMBOL_GROUNDING, filedBy: '' })).toBe(true);
    });

    it('rejects invalid rating', () => {
      const bad = { ...W_048_SYMBOL_GROUNDING, rating: 'AWESOME' as unknown as 'SOLVES' };
      const r = validateEvidence(bad);
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/rating/);
    });

    it('rejects invalid priorRating when present', () => {
      const bad = {
        ...W_056_CROSS_PLATFORM_UPGRADED,
        priorRating: 'NOPE' as unknown as 'SOLVES',
      };
      const r = validateEvidence(bad);
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/priorRating/);
    });

    it('rejects empty formats array', () => {
      const bad = { ...W_048_SYMBOL_GROUNDING, formats: [] };
      const r = validateEvidence(bad);
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/formats/);
    });

    it('rejects invalid format tag', () => {
      const bad = { ...W_048_SYMBOL_GROUNDING, formats: ['javascript' as 'hs'] };
      const r = validateEvidence(bad);
      expect('error' in r).toBe(true);
    });

    it('rejects empty evidenceRefs array (F.017 — every claim needs a citation)', () => {
      const bad = { ...W_048_SYMBOL_GROUNDING, evidenceRefs: [] };
      const r = validateEvidence(bad);
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/evidenceRefs/);
    });

    it('rejects empty-string ref entry', () => {
      const bad = { ...W_048_SYMBOL_GROUNDING, evidenceRefs: [''] };
      expect('error' in validateEvidence(bad)).toBe(true);
    });
  });

  // ── buildImpossibilityV1Record ──

  describe('buildImpossibilityV1Record', () => {
    it('produces a witness for the three documented SOLVES', () => {
      const r048 = buildImpossibilityV1Record(W_048_SYMBOL_GROUNDING);
      const r051 = buildImpossibilityV1Record(W_051_VERSION_CONTROL);
      const r053 = buildImpossibilityV1Record(W_053_DIGITAL_PRESERVATION);
      expect(r048.solverType).toBe('impossibility.v1');
      expect(r048.evidence.rating).toBe('SOLVES');
      expect(r051.evidence.id).toBe('W.051');
      expect(r053.evidence.problem).toBe('Digital Preservation');
    });

    it('preserves priorRating for upgrade evidence (W.056)', () => {
      const rec = buildImpossibilityV1Record(W_056_CROSS_PLATFORM_UPGRADED);
      expect(rec.evidence.priorRating).toBe('DOESNT_HELP');
      expect(rec.evidence.rating).toBe('PARTIALLY');
      expect(direction(rec.evidence.priorRating!, rec.evidence.rating)).toBe('upgrade');
    });

    it('attaches optional cursorAt and label', () => {
      const rec = buildImpossibilityV1Record(W_048_SYMBOL_GROUNDING, {
        cursorAt: { chain: 'paper-program', depth: 17 },
        label: 'paper-22-claim',
      });
      expect(rec.cursorAt).toEqual({ chain: 'paper-program', depth: 17 });
      expect(rec.label).toBe('paper-22-claim');
    });

    it('throws on contract violation (validates before building)', () => {
      const bad = { ...W_048_SYMBOL_GROUNDING, evidenceRefs: [] };
      expect(() => buildImpossibilityV1Record(bad as ImpossibilityEvidence)).toThrow(/evidenceRefs/);
    });

    it('wireKey is order-independent for formats and refs (sorted in canonical snapshot)', () => {
      const a = buildImpossibilityV1Record(W_048_SYMBOL_GROUNDING);
      const b = buildImpossibilityV1Record({
        ...W_048_SYMBOL_GROUNDING,
        // Reverse evidenceRefs order — should canonicalize identically.
        evidenceRefs: [...W_048_SYMBOL_GROUNDING.evidenceRefs].reverse(),
      });
      expect(a.wireKey).toBe(b.wireKey);
    });

    it('wireKey diverges when filedBy differs (multi-rater is geometrically distinct)', () => {
      const claudeFiled = buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'claude1' });
      const geminiFiled = buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'gemini1' });
      expect(claudeFiled.wireKey).not.toBe(geminiFiled.wireKey);
    });

    it('wireKey diverges when rating differs for the same filer (debate is geometric)', () => {
      const solves = buildImpossibilityV1Record(W_048_SYMBOL_GROUNDING);
      const partially = buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, rating: 'PARTIALLY' });
      expect(solves.wireKey).not.toBe(partially.wireKey);
    });
  });

  // ── aggregateEvidence: debate is first-class ──

  describe('aggregateEvidence — plural ratings without flattening', () => {
    it('cohort of three SOLVES filings is consensus, not in dispute', () => {
      const records = [
        buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'claude1' }),
        buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'gemini1' }),
        buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'cursor1' }),
      ];
      const cohort = aggregateEvidence(records);
      expect(cohort.id).toBe('W.048');
      expect(cohort.agents).toEqual(['claude1', 'cursor1', 'gemini1']);
      expect(cohort.strongest).toBe('SOLVES');
      expect(cohort.weakest).toBe('SOLVES');
      expect(cohort.inDispute).toBe(false);
    });

    it('cohort with disagreement (SOLVES + PARTIALLY) is correctly marked inDispute', () => {
      const records = [
        buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'claude1', rating: 'SOLVES' }),
        buildImpossibilityV1Record({
          ...W_048_SYMBOL_GROUNDING,
          filedBy: 'gemini1',
          rating: 'PARTIALLY',
          mechanism: 'PARTIALLY: only solves grounding within HoloScript domain, not general AI',
        }),
      ];
      const cohort = aggregateEvidence(records);
      expect(cohort.inDispute).toBe(true);
      expect(cohort.strongest).toBe('SOLVES');
      expect(cohort.weakest).toBe('PARTIALLY');
      expect(cohort.byRating.SOLVES.length).toBe(1);
      expect(cohort.byRating.PARTIALLY.length).toBe(1);
      expect(cohort.byRating.REFRAMES.length).toBe(0);
    });

    it('cohort spanning all four ratings preserves them all (no winner/loser flattening)', () => {
      const records = [
        buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'a', rating: 'SOLVES' }),
        buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'b', rating: 'PARTIALLY' }),
        buildImpossibilityV1Record({ ...W_048_SYMBOL_GROUNDING, filedBy: 'c', rating: 'REFRAMES' }),
        buildImpossibilityV1Record({
          ...W_048_SYMBOL_GROUNDING,
          filedBy: 'd',
          rating: 'DOESNT_HELP',
          mechanism: 'minority dissent: claim is overreach',
        }),
      ];
      const cohort = aggregateEvidence(records);
      expect(cohort.inDispute).toBe(true);
      expect(cohort.strongest).toBe('SOLVES');
      expect(cohort.weakest).toBe('DOESNT_HELP');
      expect(cohort.records.length).toBe(4);
    });

    it('throws on empty cohort', () => {
      expect(() => aggregateEvidence([])).toThrow(/at least one/);
    });

    it('throws on heterogeneous ids (cohort is per-impossibility)', () => {
      const records = [
        buildImpossibilityV1Record(W_048_SYMBOL_GROUNDING),
        buildImpossibilityV1Record(W_051_VERSION_CONTROL),
      ];
      expect(() => aggregateEvidence(records)).toThrow(/uniform id/);
    });

    it('historical W.056 upgrade (DOESNT_HELP → PARTIALLY) appears as inDispute when both filings preserved', () => {
      const records = [
        buildImpossibilityV1Record(W_056_CROSS_PLATFORM_PRIOR),
        buildImpossibilityV1Record(W_056_CROSS_PLATFORM_UPGRADED),
      ];
      const cohort = aggregateEvidence(records);
      expect(cohort.inDispute).toBe(true);
      expect(cohort.strongest).toBe('PARTIALLY');
      expect(cohort.weakest).toBe('DOESNT_HELP');
      // The point: the upgrade history is preserved in the chain — agents
      // can replay the rating progression rather than seeing only the latest.
    });
  });

  // ── evidenceWireKey is stable + non-trivial ──

  it('evidenceWireKey produces a non-trivial deterministic key', () => {
    const k = evidenceWireKey(W_048_SYMBOL_GROUNDING);
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(50);
    // Determinism
    expect(evidenceWireKey(W_048_SYMBOL_GROUNDING)).toBe(k);
  });
});
