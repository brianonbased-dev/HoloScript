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
  extractStateMachine,
  stateMachineWellFormed,
  type EvolveSeed,
} from '../corpusPortfolio';
import { parse as parseHsPlus } from '../../parser';

describe('corpusPortfolio canonical seeds', () => {
  it.each(CORPUS_PORTFOLIO.map((s) => [s.name, s] as const))(
    'seed %s parses clean under its native gate and preserves its own constructs',
    (_name, seed: EvolveSeed) => {
      // Safety net: an authored seed that does not parse would make the loop a no-op.
      expect(parsesClean(seed.source, seed.format)).toBe(true);
      expect(seed.preserved.every((re) => re.test(seed.source))).toBe(true);
    }
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

describe('state-machine well-formedness gate (the gate-contrast source)', () => {
  const patrol = CORPUS_PORTFOLIO.find((s) => s.name === 'patrol-statemachine') as EvolveSeed;

  // The canonical state-machine seeds MUST be well-formed, else their own gate SEED_INVALIDs them.
  it.each(CORPUS_PORTFOLIO.filter((s) => s.semanticCheck).map((s) => [s.name, s] as const))(
    'seed %s is well-formed (passes its own semantic gate)',
    async (_name, seed: EvolveSeed) => {
      expect((await makeSeedGate(seed)(seed.source)).passed).toBe(true);
      expect(stateMachineWellFormed(parseHsPlus(seed.source).ast)).toBe(true);
    }
  );

  it('extractStateMachine reads states + transitions', () => {
    const sm = extractStateMachine(parseHsPlus(patrol.source).ast);
    expect(sm?.states).toEqual(expect.arrayContaining(['idle', 'chasing']));
    expect(sm?.initial).toBe('idle');
    expect(sm?.transitions).toEqual(
      expect.arrayContaining([{ from: 'chasing', event: 'lost', target: 'idle' }])
    );
  });

  it('REJECTS a candidate whose transition targets an UNDEFINED state (the dominant proposer error)', async () => {
    // parses fine + keeps PatrolBot/idle/chasing, but `chasing --lost--> "lost"` targets no state.
    const dangling =
      'composition "PatrolBot" {\n  state { entityId: "bot" mood: "alert" }\n  @state_machine {\n    initial: "idle"\n    states: {\n      idle: { seen: -> "chasing" }\n      chasing: { lost: -> "lost" }\n    }\n  }\n}';
    expect(parsesClean(dangling, 'hsplus')).toBe(true); // the OLD gate would have PASSED it
    expect(stateMachineWellFormed(parseHsPlus(dangling).ast)).toBe(false);
    expect((await makeSeedGate(patrol)(dangling)).passed).toBe(false); // the new gate REJECTS it
  });

  it('ACCEPTS a candidate that adds a well-formed new state (the chosen side of the pair)', async () => {
    const grown =
      'composition "PatrolBot" {\n  state { entityId: "bot" mood: "alert" }\n  @state_machine {\n    initial: "idle"\n    states: {\n      idle: { seen: -> "chasing" }\n      chasing: { lost: -> "searching" }\n      searching: { found: -> "chasing" }\n    }\n  }\n}';
    expect((await makeSeedGate(patrol)(grown)).passed).toBe(true);
  });
});
