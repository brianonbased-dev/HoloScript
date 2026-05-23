import { describe, expect, it } from 'vitest';
import {
  CONJECTURE_RUNNER_V1,
  PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
  runConjectureRunner,
  type ConjectureRunnerInput,
} from '../ConjectureRunner';

describe('ConjectureRunner (conjecture.runner.v1)', () => {
  it('satisfies the MVP gate with a survivor and replayable falsifier', () => {
    const result = runConjectureRunner({
      proposedBy: 'codex-test',
      includeHashBoundary: true,
    });

    expect(result.solverType).toBe(CONJECTURE_RUNNER_V1);
    expect(result.suite).toBe(PROOF_CARRYING_GEOMETRY_SMOKE_SUITE);
    expect(result.status).toBe('completed');
    expect(result.receiptKey).toMatch(/^conjecture\.runner\.v1-sha-[0-9a-f]{64}$/);
    expect(result.gate.passed).toBe(true);
    expect(result.gate.survivorReceiptKey).toMatch(/^conjecture\.v1-sha-[0-9a-f]{64}$/);
    expect(result.gate.falsifiedReceiptKey).toMatch(/^conjecture\.v1-sha-[0-9a-f]{64}$/);
    expect(result.gate.replayCounterexampleMatched).toBe(true);

    expect(result.receipts.some((receipt) => receipt.status === 'survived')).toBe(true);
    expect(
      result.receipts.some(
        (receipt) => receipt.status === 'falsified' && receipt.counterexamples.length > 0,
      ),
    ).toBe(true);
    expect(result.replay.some((replay) => replay.counterexampleMatched)).toBe(true);
    expect(result.graduation).toContain('receipt-carrying.geometry');
  });

  it('exposes the full GENERATE to GRADUATE phase spine', () => {
    const result = runConjectureRunner({ proposedBy: 'codex-test' });

    expect(result.stages.map((stage) => stage.phase)).toEqual([
      'GENERATE',
      'EXECUTE',
      'FALSIFY',
      'CLASSIFY',
      'GRADUATE',
    ]);
    expect(result.stages.every((stage) => stage.status === 'completed')).toBe(true);
  });

  it('emits deterministic runner receipts across repeated runs', () => {
    const input: ConjectureRunnerInput = {
      proposedBy: 'codex-test',
      includeHashBoundary: true,
    };

    const a = runConjectureRunner(input);
    const b = runConjectureRunner(input);

    expect(a.receiptKey).toBe(b.receiptKey);
    expect(a.classifications).toEqual(b.classifications);
    expect(a.replay).toEqual(b.replay);
  });

  it('can run the minimal gate without the optional hash-boundary scenario', () => {
    const result = runConjectureRunner({
      proposedBy: 'codex-test',
      includeHashBoundary: false,
    });

    expect(result.status).toBe('completed');
    expect(result.receipts).toHaveLength(2);
    expect(result.classifications.map((classification) => classification.role)).toEqual([
      'survivor',
      'falsifier',
    ]);
  });

  it('rejects unknown suites before minting receipts', () => {
    expect(() =>
      runConjectureRunner({
        suite: 'unknown-suite' as ConjectureRunnerInput['suite'],
      }),
    ).toThrow(/unsupported suite/);
  });
});
