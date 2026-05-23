import { describe, expect, it } from 'vitest';
import {
  CONJECTURE_RUNNER_V1,
  GENERATED_GEOMETRY_FAMILY_SUITE,
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
    const executeStage = result.stages.find((stage) => stage.phase === 'EXECUTE');
    expect(executeStage?.predicates?.map((predicate) => predicate.id)).toEqual([
      'geometry.euler_characteristic',
      'geometry.hash_order_invariant',
      'geometry.non_degenerate',
    ]);
    expect(
      executeStage?.predicates?.find(
        (predicate) => predicate.id === 'geometry.hash_order_invariant',
      )?.passCriteria,
    ).toContain('hashGeometry');
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

  it('classifies prior-art generated family survivors as rediscovered', () => {
    const result = runConjectureRunner({
      suite: GENERATED_GEOMETRY_FAMILY_SUITE,
      proposedBy: 'codex-test',
    });

    const rediscovered = result.receipts.find((receipt) => receipt.status === 'rediscovered');

    expect(result.status).toBe('completed');
    expect(result.gate.passed).toBe(true);
    expect(result.receipts.some((receipt) => receipt.status === 'survived')).toBe(true);
    expect(rediscovered).toBeDefined();
    expect(rediscovered?.claim.id).toBe('C.GEOM.RUNNER.GENERATED_SURVIVOR');
    expect(
      rediscovered?.evaluations.every((evaluation) => evaluation.status === 'rediscovered'),
    ).toBe(true);
    expect(rediscovered?.evaluations[0].novelty.provider).toBe('holoembed');
    expect(rediscovered?.evaluations[0].novelty.status).toBe('near-duplicate');
    expect(
      rediscovered?.evaluations.map((evaluation) => evaluation.parameters.traitSumBranch)
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.graduation).toContain('trait-invariant.candidate');
    expect(result.graduation).toContain('receipt-carrying.geometry');
    expect(
      result.classifications.some(
        (classification) =>
          classification.scenarioId === 'generated-geometry.regular-polygon-sheet-family' &&
          classification.status === 'rediscovered',
      ),
    ).toBe(true);
  });

  it('rejects unknown suites before minting receipts', () => {
    expect(() =>
      runConjectureRunner({
        suite: 'unknown-suite' as ConjectureRunnerInput['suite'],
      }),
    ).toThrow(/unsupported suite/);
  });
});
