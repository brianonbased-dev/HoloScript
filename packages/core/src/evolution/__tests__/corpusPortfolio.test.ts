/**
 * corpusPortfolio tests — the canonical seeds MUST be gate-ready (else the
 * autonomous accrual silently SEED_INVALIDs), and accrueOneStep must return
 * harvest-ready REC-SHAPE rows.
 * @see ../corpusPortfolio.ts
 */
import { describe, it, expect } from 'vitest';
import {
  CORPUS_PORTFOLIO,
  parsesClean,
  makeSeedGate,
  accrueOneStep,
  type EvolveSeed,
} from '../corpusPortfolio';

describe('corpusPortfolio canonical seeds', () => {
  it.each(CORPUS_PORTFOLIO.map((s) => [s.name, s] as const))(
    'seed %s parses clean under its native gate and preserves its own constructs',
    (_name, seed: EvolveSeed) => {
      // Safety net: an authored seed that does not parse would make the loop a no-op.
      expect(parsesClean(seed.source, seed.format)).toBe(true);
      expect(seed.preserved.every((re) => re.test(seed.source))).toBe(true);
    },
  );

  it('the gate FAILS a candidate that drops a preserved construct (false case)', async () => {
    const seed = CORPUS_PORTFOLIO[0];
    const gate = makeSeedGate(seed);
    const stripped = seed.source.replace(/greet_companion/g, 'x'); // drop the trait name
    expect((await gate(stripped)).passed).toBe(false);
  });
});

describe('accrueOneStep (one gated evolution step → graded rows)', () => {
  it('returns harvest REC-SHAPE rows for a gated candidate, round-robin by tick', async () => {
    // Mock proposer: returns a valid, shorter variant of the companion trait that
    // still preserves the constructs (so it passes the gate).
    const propose = async (parent: string) => parent.replace('"friendly"', '"f"');
    const r0 = await accrueOneStep({ propose, agentId: 'jetson-evolve', tick: 0, now: () => 'T' });
    expect(r0.target).toBe(CORPUS_PORTFOLIO[0].name);
    expect(r0.rows.length).toBe(1);
    expect(r0.rows[0]).toMatchObject({
      family: 'program-evolution',
      modality: 'code',
      agentId: 'jetson-evolve',
      ts: 'T',
    });
    expect(r0.rows[0].source).toBe(`evolve-corpus:${CORPUS_PORTFOLIO[0].name}`);
    expect((r0.rows[0].grader as { passed: boolean }).passed).toBe(true);

    // Tick round-robins to a different seed.
    const r1 = await accrueOneStep({ propose: async (p) => p, agentId: 'a', tick: 1 });
    expect(r1.target).toBe(CORPUS_PORTFOLIO[1].name);
  });
});
