import { describe, it, expect, vi } from 'vitest';
import type { RewardToolRunner } from '../GRPORewardFunctions';
import { GRPORewardOrchestrator } from '../GRPORewardOrchestrator';
import {
  faithfulCalibrationReward,
  metacognitiveGap,
  parsePredictedCalibration,
  parseProvenanceCompletion,
  parseRational,
  provenanceValidity,
  provenanceValidityReward,
  quantize2dp,
  replayDerivation,
  ReplayError,
  type DerivationStep,
  type ProvenanceRewardContext,
} from '../ProvenanceCalibrationRewards';

// =============================================================================
// FIXTURES — the EXP-3 midpoint task: mn=1.2, mx=2.66 → midpoint 1.93
// =============================================================================

const ATOMS = { mn: '1.2', mx: '2.66', cur: '1.5' };
const BOUND: [string, string] = ['1.2', '2.66'];
const PROVENANCE_CTX: ProvenanceRewardContext = { atoms: ATOMS, bound: BOUND };

/** Valid midpoint derivation: (mn + mx) / 2 */
const MIDPOINT_DERIVATION: DerivationStep[] = [
  { op: 'add', args: [['atom', 'mn'], ['atom', 'mx']] },
  { op: 'div', args: [0, ['const', '2/1']] },
];

/** A "lie": claims the midpoint but the derivation replays to cur */
const LIE_DERIVATION: DerivationStep[] = [{ op: 'id', args: [['atom', 'cur']] }];

function completionOf(answer: string, derivation: DerivationStep[]): string {
  return JSON.stringify({ property_value: answer, derivation });
}

function parsedAtoms() {
  return {
    mn: parseRational(ATOMS.mn),
    mx: parseRational(ATOMS.mx),
    cur: parseRational(ATOMS.cur),
  };
}

function parsedBound(): [ReturnType<typeof parseRational>, ReturnType<typeof parseRational>] {
  return [parseRational(BOUND[0]), parseRational(BOUND[1])];
}

function createMockRunner(): RewardToolRunner {
  return {
    writeTempFile: vi.fn().mockResolvedValue('/tmp/test-file.ts'),
    deleteTempFile: vi.fn().mockResolvedValue(undefined),
    runVitest: vi.fn().mockResolvedValue({
      passed: 10,
      total: 10,
      coveragePercent: 80,
      output: 'All tests passed',
    }),
    runTypeCheck: vi.fn().mockResolvedValue({ passed: true, output: '' }),
    runLint: vi.fn().mockResolvedValue({ issueCount: 0, output: '' }),
    getCircuitBreakerHealth: vi.fn().mockResolvedValue(100),
  };
}

// =============================================================================
// RATIONALS
// =============================================================================

describe('parseRational / quantize2dp', () => {
  it('parses fraction, integer, and decimal forms', () => {
    expect(parseRational('2/1')).toEqual({ num: 2n, den: 1n });
    expect(parseRational('3/4')).toEqual({ num: 3n, den: 4n });
    expect(parseRational('-2')).toEqual({ num: -2n, den: 1n });
    expect(parseRational('1.93')).toEqual({ num: 193n, den: 100n });
    expect(parseRational('-0.5')).toEqual({ num: -1n, den: 2n });
  });

  it('rejects malformed rationals', () => {
    expect(() => parseRational('abc')).toThrow(ReplayError);
    expect(() => parseRational('1/0')).toThrow(ReplayError);
    expect(() => parseRational('')).toThrow(ReplayError);
  });

  it('quantizes to 2dp with ties-to-even', () => {
    expect(quantize2dp(parseRational('1.93'))).toEqual({ num: 193n, den: 100n });
    // 1.005 → 100.5/100: tie between 100 and 101 → even (100)
    expect(quantize2dp(parseRational('1.005'))).toEqual({ num: 1n, den: 1n });
    // 1.015 → tie between 101 and 102 → even (102)
    expect(quantize2dp(parseRational('1.015'))).toEqual({ num: 51n, den: 50n });
    // negative: -1.005 → tie → even (-100/100 = -1)
    expect(quantize2dp(parseRational('-1.005'))).toEqual({ num: -1n, den: 1n });
    // non-tie rounding both directions
    expect(quantize2dp(parseRational('1.234'))).toEqual({ num: 123n, den: 100n });
    expect(quantize2dp(parseRational('1.236'))).toEqual({ num: 31n, den: 25n }); // 1.24
  });
});

// =============================================================================
// REPLAY
// =============================================================================

describe('replayDerivation', () => {
  it('replays the midpoint derivation exactly', () => {
    // (1.2 + 2.66) / 2 = 1.93
    const result = replayDerivation(MIDPOINT_DERIVATION, parsedAtoms());
    expect(quantize2dp(result)).toEqual(quantize2dp(parseRational('1.93')));
  });

  it('throws on empty derivation', () => {
    expect(() => replayDerivation([], parsedAtoms())).toThrow(ReplayError);
  });

  it('throws on unknown op', () => {
    expect(() =>
      replayDerivation([{ op: 'pow', args: [['atom', 'mn'], ['const', '2/1']] }], parsedAtoms())
    ).toThrow(/unknown op/);
  });

  it('throws on wrong arity', () => {
    expect(() => replayDerivation([{ op: 'add', args: [['atom', 'mn']] }], parsedAtoms())).toThrow(
      /expects 2 args/
    );
  });

  it('throws on out-of-range slot ref', () => {
    expect(() =>
      replayDerivation([{ op: 'add', args: [5, ['atom', 'mn']] }], parsedAtoms())
    ).toThrow(/out of range/);
  });

  it('throws on unknown atom', () => {
    expect(() => replayDerivation([{ op: 'id', args: [['atom', 'nope']] }], parsedAtoms())).toThrow(
      /unknown atom/
    );
  });

  it('throws on division by zero', () => {
    expect(() =>
      replayDerivation([{ op: 'div', args: [['atom', 'mn'], ['const', '0']] }], parsedAtoms())
    ).toThrow(/division by zero/);
  });
});

// =============================================================================
// PROVENANCE VALIDITY V(d)
// =============================================================================

describe('provenanceValidity', () => {
  it('V=1 for a valid derivation of the claimed answer', () => {
    const { validity, reason } = provenanceValidity(
      MIDPOINT_DERIVATION,
      parseRational('1.93'),
      parsedAtoms(),
      parsedBound()
    );
    expect(validity).toBe(1);
    expect(reason).toBe('ok');
  });

  it('V=0 when the derivation replays to a different value (the lie)', () => {
    // Claims 1.93 but the derivation replays to cur = 1.5
    const { validity, reason } = provenanceValidity(
      LIE_DERIVATION,
      parseRational('1.93'),
      parsedAtoms(),
      parsedBound()
    );
    expect(validity).toBe(0);
    expect(reason).toContain('does not replay');
  });

  it('V=0 when the answer is outside the contract bound', () => {
    // 3.66 replays fine (mx + 1) but violates bound [1.2, 2.66]
    const deriv: DerivationStep[] = [{ op: 'add', args: [['atom', 'mx'], ['const', '1']] }];
    const { validity, reason } = provenanceValidity(
      deriv,
      parseRational('3.66'),
      parsedAtoms(),
      parsedBound()
    );
    expect(validity).toBe(0);
    expect(reason).toContain('bound');
  });

  it('V=0 on malformed derivation instead of crashing', () => {
    const { validity, reason } = provenanceValidity(
      [{ op: 'add', args: [99, 98] }],
      parseRational('1.93'),
      parsedAtoms(),
      parsedBound()
    );
    expect(validity).toBe(0);
    expect(reason).toContain('replay-failed');
  });
});

// =============================================================================
// COMPLETION PARSING
// =============================================================================

describe('parseProvenanceCompletion', () => {
  it('parses a bare JSON completion', () => {
    const parsed = parseProvenanceCompletion(completionOf('1.93', MIDPOINT_DERIVATION));
    expect(parsed).not.toBeNull();
    expect(parsed!.answer).toBe('1.93');
    expect(parsed!.derivation).toHaveLength(2);
  });

  it('parses a JSON object embedded in prose', () => {
    const text = `The midpoint is: ${completionOf('1.93', MIDPOINT_DERIVATION)} — done.`;
    const parsed = parseProvenanceCompletion(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.answer).toBe('1.93');
  });

  it('returns null for prose with no JSON', () => {
    expect(parseProvenanceCompletion('the answer is 1.93')).toBeNull();
  });

  it('returns null when derivation is missing', () => {
    expect(parseProvenanceCompletion(JSON.stringify({ property_value: '1.93' }))).toBeNull();
  });
});

// =============================================================================
// provenanceValidityReward (TRL-shaped)
// =============================================================================

describe('provenanceValidityReward', () => {
  it('scores valid=1, lie=0, malformed=0 in one batch', async () => {
    const completions = [
      completionOf('1.93', MIDPOINT_DERIVATION),
      completionOf('1.93', LIE_DERIVATION),
      'no json here at all',
    ];
    const rewards = await provenanceValidityReward(completions, { provenance: PROVENANCE_CTX });
    expect(rewards).toEqual([1, 0, 0]);
  });

  it('fails closed (all zeros) when context is missing', async () => {
    const rewards = await provenanceValidityReward([completionOf('1.93', MIDPOINT_DERIVATION)]);
    expect(rewards).toEqual([0]);
  });

  it('fails closed when context atoms are malformed', async () => {
    const rewards = await provenanceValidityReward([completionOf('1.93', MIDPOINT_DERIVATION)], {
      provenance: { atoms: { mn: 'not-a-number' }, bound: BOUND },
    });
    expect(rewards).toEqual([0]);
  });

  it('scores 0 for an unparseable claimed answer', async () => {
    const rewards = await provenanceValidityReward(
      [completionOf('one point nine three', MIDPOINT_DERIVATION)],
      { provenance: PROVENANCE_CTX }
    );
    expect(rewards).toEqual([0]);
  });
});

// =============================================================================
// FAITHFUL CALIBRATION Z_m
// =============================================================================

describe('metacognitiveGap / parsePredictedCalibration', () => {
  it('Z_m = 1 at perfect self-assessment', () => {
    expect(metacognitiveGap(0.8, 0.8)).toBe(1);
  });

  it('Z_m = 1 − gap² for imperfect self-assessment', () => {
    expect(metacognitiveGap(0.5, 1.0)).toBeCloseTo(0.75, 10);
    expect(metacognitiveGap(0.0, 1.0)).toBeCloseTo(0, 10);
  });

  it('parses f_pred and predicted_calibration fields', () => {
    expect(parsePredictedCalibration(JSON.stringify({ f_pred: 0.7 }))).toBe(0.7);
    expect(parsePredictedCalibration(JSON.stringify({ predicted_calibration: 0.4 }))).toBe(0.4);
  });

  it('returns null for missing, non-numeric, or out-of-range predictions', () => {
    expect(parsePredictedCalibration('no json')).toBeNull();
    expect(parsePredictedCalibration(JSON.stringify({ f_pred: 'high' }))).toBeNull();
    expect(parsePredictedCalibration(JSON.stringify({ f_pred: 1.5 }))).toBeNull();
    expect(parsePredictedCalibration(JSON.stringify({ f_pred: -0.1 }))).toBeNull();
  });
});

describe('faithfulCalibrationReward', () => {
  it('scores per-completion Z_m against index-aligned gold values', async () => {
    const completions = [
      JSON.stringify({ f_pred: 0.8 }),
      JSON.stringify({ f_pred: 0.5 }),
      'malformed — no self-assessment',
    ];
    const rewards = await faithfulCalibrationReward(completions, {
      calibration: { fGold: [0.8, 1.0, 0.9] },
    });
    expect(rewards[0]).toBe(1);
    expect(rewards[1]).toBeCloseTo(0.75, 10);
    // malformed F_pred is PENALIZED, never defaulted (the lenient-recogniser trap)
    expect(rewards[2]).toBe(0);
  });

  it('fails closed when gold values are missing or invalid', async () => {
    const completion = JSON.stringify({ f_pred: 0.8 });
    expect(await faithfulCalibrationReward([completion])).toEqual([0]);
    expect(
      await faithfulCalibrationReward([completion], { calibration: { fGold: [] } })
    ).toEqual([0]);
    expect(
      await faithfulCalibrationReward([completion], { calibration: { fGold: [1.7] } })
    ).toEqual([0]);
  });
});

// =============================================================================
// ORCHESTRATOR INTEGRATION (flag-gated, default off)
// =============================================================================

describe('GRPORewardOrchestrator with extended terms', () => {
  it('default behavior is unchanged when both terms are disabled', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), { cacheEnabled: false });
    const result = await orch.evaluate(['code']);
    // Baseline composite from the existing suite: 0.97 with the mock runner
    expect(result.compositeRewards[0]).toBeCloseTo(0.97, 2);
    expect(result.functionResults).toHaveLength(5);
    expect(orch.getWeights()).not.toHaveProperty('provenanceValidityReward');
    expect(orch.getWeights()).not.toHaveProperty('faithfulCalibrationReward');
    expect(orch.getRewardFuncsArray()).toHaveLength(5);
  });

  it('throws when a term is enabled without its weight', () => {
    expect(
      () =>
        new GRPORewardOrchestrator(createMockRunner(), { enableProvenanceValidity: true })
    ).toThrow(/requires weights.provenanceValidityReward/);
    expect(
      () =>
        new GRPORewardOrchestrator(createMockRunner(), { enableFaithfulCalibration: true })
    ).toThrow(/requires weights.faithfulCalibrationReward/);
  });

  it('throws when a weight is supplied without its enable flag', () => {
    expect(
      () =>
        new GRPORewardOrchestrator(createMockRunner(), {
          weights: { provenanceValidityReward: 0.2 },
        })
    ).toThrow(/requires enableProvenanceValidity/);
  });

  it('throws when the extended weight set does not sum to 1.0', () => {
    expect(
      () =>
        new GRPORewardOrchestrator(createMockRunner(), {
          enableProvenanceValidity: true,
          weights: { provenanceValidityReward: 0.2 }, // base 5 already sum to 1.0
        })
    ).toThrow(/must sum to 1.0/);
  });

  it('folds V into the composite when enabled and weighted', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      cacheEnabled: false,
      enableProvenanceValidity: true,
      weights: {
        testPassReward: 0.3,
        typeCheckReward: 0.15,
        lintReward: 0.1,
        coverageReward: 0.1,
        circuitBreakerReward: 0.1,
        provenanceValidityReward: 0.25,
      },
    });

    const valid = completionOf('1.93', MIDPOINT_DERIVATION);
    const lie = completionOf('1.93', LIE_DERIVATION);
    const result = await orch.evaluate([valid, lie], { provenance: PROVENANCE_CTX });

    expect(result.functionResults).toHaveLength(6);
    const vResult = result.functionResults.find((f) => f.name === 'provenanceValidityReward');
    expect(vResult?.rewards).toEqual([1, 0]);
    // The valid completion outscores the lie by exactly the V weight
    expect(result.compositeRewards[0] - result.compositeRewards[1]).toBeCloseTo(0.25, 6);
    expect(orch.getWeights().provenanceValidityReward).toBe(0.25);
    expect(orch.getRewardFuncsArray()).toHaveLength(6);
  });

  it('folds Z_m into the composite when enabled and weighted', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      cacheEnabled: false,
      enableFaithfulCalibration: true,
      weights: {
        testPassReward: 0.3,
        typeCheckReward: 0.15,
        lintReward: 0.1,
        coverageReward: 0.1,
        circuitBreakerReward: 0.1,
        faithfulCalibrationReward: 0.25,
      },
    });

    const result = await orch.evaluate(
      [JSON.stringify({ f_pred: 0.9 }), JSON.stringify({ f_pred: 0.9 })],
      { calibration: { fGold: [0.9, 0.4] } }
    );

    const zResult = result.functionResults.find((f) => f.name === 'faithfulCalibrationReward');
    expect(zResult?.rewards[0]).toBe(1);
    expect(zResult?.rewards[1]).toBeCloseTo(0.75, 10);
    expect(result.compositeRewards[0] - result.compositeRewards[1]).toBeCloseTo(0.25 * 0.25, 6);
  });

  it('bypasses the reward cache while an extended term is enabled', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      cacheEnabled: true,
      enableProvenanceValidity: true,
      weights: {
        testPassReward: 0.3,
        typeCheckReward: 0.15,
        lintReward: 0.1,
        coverageReward: 0.1,
        circuitBreakerReward: 0.1,
        provenanceValidityReward: 0.25,
      },
    });

    const valid = completionOf('1.93', MIDPOINT_DERIVATION);
    const first = await orch.evaluate([valid], { provenance: PROVENANCE_CTX });
    // Same completion, DIFFERENT context: the bound now excludes the answer.
    const second = await orch.evaluate([valid], {
      provenance: { atoms: ATOMS, bound: ['2.0', '2.66'] },
    });

    expect(first.compositeRewards[0] - second.compositeRewards[0]).toBeCloseTo(0.25, 6);
    expect(second.cacheHits).toBe(0);
  });

  it('tracks statistics for enabled extended terms', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      cacheEnabled: false,
      enableProvenanceValidity: true,
      weights: {
        testPassReward: 0.3,
        typeCheckReward: 0.15,
        lintReward: 0.1,
        coverageReward: 0.1,
        circuitBreakerReward: 0.1,
        provenanceValidityReward: 0.25,
      },
    });

    await orch.evaluate([completionOf('1.93', MIDPOINT_DERIVATION)], {
      provenance: PROVENANCE_CTX,
    });
    const stats = orch.getStats();
    expect(stats.perFunction.provenanceValidityReward).toBeDefined();
    expect(stats.perFunction.provenanceValidityReward.count).toBe(1);
    expect(stats.perFunction.provenanceValidityReward.mean).toBe(1);
  });
});
