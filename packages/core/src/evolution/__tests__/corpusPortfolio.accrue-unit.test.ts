/**
 * Unit proof of the in-process accrual primitives — runs in normal CI (NO Ollama / no repo):
 * a deterministic fake proposer drives `accrueOneStep`, and `dedupRows` is exercised purely.
 * This is the gap-closer's testable core: the deployed edge AgentRunner calls exactly these to
 * grow its training corpus on idle (I.023 executor gap), so they must be correct without metal.
 * @see ../corpusPortfolio.ts
 */
import { describe, it, expect } from 'vitest';
import {
  accrueOneStep,
  dedupRows,
  type EvolveSeed,
  type Proposer,
  type GradedTraceRow,
} from '../corpusPortfolio';

const SEED: EvolveSeed = {
  name: 'unit-scene',
  format: 'holo',
  goal: 'make it denser without losing the object',
  source: 'composition "T" {\n  object "A" { position: [0, 0, 0] }\n}',
  preserved: [/composition "T"/, /object "A"/],
};

describe('accrueOneStep — gated rows from a fake proposer (no metal)', () => {
  it('a valid, denser, construct-preserving candidate → a passed/SFT graded row', async () => {
    // denser (one less indent space) + still valid .holo + preserves both constructs
    const propose: Proposer = async () =>
      'composition "T" {\n object "A" { position: [0, 0, 0] }\n}';
    const { target, rows } = await accrueOneStep({
      propose,
      agentId: 'unit',
      seed: SEED,
      now: () => 'T',
    });
    expect(target).toBe('unit-scene');
    expect(rows.length).toBe(1);
    expect(rows[0].grader.passed).toBe(true);
    expect(rows[0].source).toBe('evolve-corpus:unit-scene');
    expect(rows[0].agentId).toBe('unit');
    expect(rows[0].family).toBe('program-evolution');
  });

  it('an invalid candidate → a failed/DPO graded row (gate discards it, but it is still labeled signal)', async () => {
    const propose: Proposer = async () => 'this is not valid holoscript at all {{{';
    const { rows } = await accrueOneStep({ propose, agentId: 'unit', seed: SEED, now: () => 'T' });
    expect(rows.length).toBe(1);
    expect(rows[0].grader.passed).toBe(false);
  });
});

describe('dedupRows — cross-run + within-batch uniqueness', () => {
  const row = (target: string): GradedTraceRow => ({
    system: 's',
    user: 'u',
    target,
    grader: {},
    family: 'f',
    modality: 'code',
    source: 'x',
    agentId: 'a',
    ts: 'T',
  });

  it('drops candidates already in the corpus and repeats within the batch, keeps the rest', () => {
    const corpus = [JSON.stringify(row('AAA')), JSON.stringify(row('BBB'))].join('\n');
    const { fresh, deduped } = dedupRows(corpus, [row('AAA'), row('CCC'), row('BBB'), row('CCC')]);
    expect(fresh.map((r) => r.target)).toEqual(['CCC']); // AAA/BBB in corpus, 2nd CCC repeats
    expect(deduped).toBe(3);
  });

  it('empty corpus → every row is fresh; malformed corpus lines are skipped', () => {
    const { fresh, deduped } = dedupRows('not json\n\n', [row('X'), row('Y')]);
    expect(fresh.length).toBe(2);
    expect(deduped).toBe(0);
  });
});
