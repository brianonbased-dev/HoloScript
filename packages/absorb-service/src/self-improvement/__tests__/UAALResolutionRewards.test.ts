import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RewardToolRunner } from '../GRPORewardFunctions';
import { GRPORewardOrchestrator } from '../GRPORewardOrchestrator';
import {
  gradeUaalResolutionCompletion,
  uaalResolutionReward,
  UAAL_RESOLUTION_REWARD_TABLE,
  computeUaalStatusMatchGold,
  parseUaalEmission,
  deepSubsetEqual,
  type UAALResolutionRow,
} from '../UAALResolutionRewards';
import type { UAALContainmentIR, UAALAffordanceIR, UAALBeneficiaryIR } from '@holoscript/uaal';

// =============================================================================
// FIXTURES — 3 families x {resolved gold, unresolvable gold}, matching
// @holoscript/uaal's own resolver test fixtures (resolution.test.ts /
// resolve-affords.test.ts) so the gold verdicts here are cross-checked
// against the package's own contract, not invented in isolation.
// =============================================================================

const occlusionResolvedIr: UAALContainmentIR = {
  entities: [
    { id: 'agent', kind: 'agent' },
    { id: 'coin', kind: 'object' },
    { id: 'box', kind: 'container', opaque: true },
    { id: 'room', kind: 'region' },
  ],
  containment: [
    { inner: 'coin', outer: 'box' },
    { inner: 'box', outer: 'room' },
    { inner: 'agent', outer: 'room' },
  ],
  query: { agent: 'agent', object: 'coin' },
};
const occlusionUnresolvableIr: UAALContainmentIR = {
  entities: [
    { id: 'agent', kind: 'agent' },
    { id: 'coin', kind: 'object' },
    { id: 'box', kind: 'container' }, // opaque unstated
    { id: 'room', kind: 'region' },
  ],
  containment: [
    { inner: 'coin', outer: 'box' },
    { inner: 'box', outer: 'room' },
    { inner: 'agent', outer: 'room' },
  ],
  query: { agent: 'agent', object: 'coin' },
};
const occlusionRow = (ir: UAALContainmentIR): UAALResolutionRow => ({
  family: 'occlusion',
  oracleIr: ir,
  query: { agent: 'agent', object: 'coin' },
});

const affordanceResolvedIr: UAALAffordanceIR = {
  entities: [
    { id: 'robot', kind: 'agent', body: { reach: 10 } },
    {
      id: 'handle',
      kind: 'object',
      offers: [{ action: 'grasp', requires: { reach: 5 }, preconditions: ['powered'] }],
    },
  ],
  propositions: [{ id: 'powered', holds: true }],
  query: { agent: 'robot', action: 'grasp', object: 'handle' },
};
const affordanceUnresolvableIr: UAALAffordanceIR = {
  entities: [
    { id: 'robot', kind: 'agent' },
    { id: 'handle', kind: 'object', offers: [{ action: 'grasp', preconditions: ['powered'] }] },
  ],
  propositions: [],
  query: { agent: 'robot', action: 'grasp', object: 'handle' },
};
const affordanceRow = (ir: UAALAffordanceIR): UAALResolutionRow => ({
  family: 'affordance',
  oracleIr: ir,
  query: { agent: 'robot', action: 'grasp', object: 'handle' },
});

const beneficiaryResolvedIr: UAALBeneficiaryIR = {
  impacts: [{ beneficiary: 'humans', value: 5, harmful: false }],
};
const beneficiaryUnresolvableIr: UAALBeneficiaryIR = { impacts: [] };
const beneficiaryRow = (ir: UAALBeneficiaryIR): UAALResolutionRow => ({
  family: 'beneficiary',
  oracleIr: ir,
});

/**
 * Build the 7 canonical completions (memo §2 rows 1-7) for one family's row pair.
 *
 * `correctAnswer`/`wrongAnswer` must each be a FULL superset of the resolver's gold
 * answer shape (deepSubsetEqual requires every gold key present in the model's
 * answer) — a partial answer object is judged WRONG for missing a field, not
 * "correct enough", matching producibility-gap.mjs's own deep-subset discipline.
 *
 * `wrongReason` must differ from `correctReason` for families that lack a
 * structured `gap.code` (occlusion/norm_status/dischargeable fall back to
 * comparing the coarse `reason` — see UAALResolutionRewards.ts) so row 5 is
 * genuinely reason-WRONG for those founding families too, not an accidental
 * reason-match.
 */
function sevenRowCompletions(opts: {
  correctAnswer: unknown;
  wrongAnswer: unknown;
  correctCode: string;
  correctReason: string;
  wrongReason?: string;
}) {
  const wrongReason = opts.wrongReason ?? 'cyclic_dependency';
  const resolvedAnswer = (answer: unknown) => JSON.stringify({ status: 'resolved', answer });
  const abstain = (reason: string, code: string) => JSON.stringify({ status: 'unresolvable', reason, code });
  return {
    row1_resolved_correct: resolvedAnswer(opts.correctAnswer),
    row2_resolved_wrong: resolvedAnswer(opts.wrongAnswer),
    row3_over_abstention: abstain('underdetermined', 'some.unrelated_code'),
    row4_honest_abstain_correct: abstain(opts.correctReason, opts.correctCode),
    row5_honest_abstain_wrong: abstain(wrongReason, 'some.wrong_code'),
    row6_confabulation: resolvedAnswer(opts.wrongAnswer),
    row7_malformed: 'this is not JSON at all, just prose',
  };
}

interface FamilyCase {
  name: string;
  resolvedRow: UAALResolutionRow;
  unresolvableRow: UAALResolutionRow;
  completions: ReturnType<typeof sevenRowCompletions>;
}

const FAMILY_CASES: FamilyCase[] = [
  {
    name: 'occlusion',
    resolvedRow: occlusionRow(occlusionResolvedIr),
    unresolvableRow: occlusionRow(occlusionUnresolvableIr),
    completions: sevenRowCompletions({
      correctAnswer: { occluded: true, occluder: 'box' },
      wrongAnswer: { occluded: false, occluder: null },
      correctCode: 'occlusion.opacity_unstated',
      correctReason: 'underdetermined',
      wrongReason: 'missing_precondition', // must differ from correctReason for the reason-fallback path
    }),
  },
  {
    name: 'affordance',
    resolvedRow: affordanceRow(affordanceResolvedIr),
    unresolvableRow: affordanceRow(affordanceUnresolvableIr),
    completions: sevenRowCompletions({
      correctAnswer: { affords: true, reason: null },
      wrongAnswer: { affords: false, reason: 'no_offer' },
      correctCode: 'affordance.unstated_precondition',
      correctReason: 'missing_precondition',
    }),
  },
  {
    name: 'beneficiary',
    resolvedRow: beneficiaryRow(beneficiaryResolvedIr),
    unresolvableRow: beneficiaryRow(beneficiaryUnresolvableIr),
    completions: sevenRowCompletions({
      // Full gold.answer shape (BeneficiaryRecovery) — deepSubsetEqual requires every
      // gold key present, so a partial {served, humanFloorHeld} object would be judged
      // WRONG for missing `distribution`/`floorNormId`, not "close enough".
      correctAnswer: { distribution: { self: 0, agents: 0, humans: 5 }, served: 'humans', humanFloorHeld: true, floorNormId: null },
      wrongAnswer: { distribution: { self: 0, agents: 0, humans: 5 }, served: 'self', humanFloorHeld: false, floorNormId: null },
      correctCode: 'beneficiary.unstated_impact',
      correctReason: 'missing_precondition',
    }),
  },
];

// =============================================================================
// 1. THE 7-ROW VERDICT TABLE x 3 FAMILIES
// =============================================================================

describe('uAAL-resolution verdict table (memo §2) x 3 families', () => {
  for (const fam of FAMILY_CASES) {
    describe(fam.name, () => {
      it('row 1: resolved + committed + answer matches -> resolved_correct (1.00)', () => {
        const r = gradeUaalResolutionCompletion(fam.completions.row1_resolved_correct, fam.resolvedRow);
        expect(r.class).toBe('resolved_correct');
        expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.resolved_correct);
        expect(r.reward).toBe(1.0);
      });

      it('row 2: resolved + committed + answer wrong -> resolved_wrong (0.25)', () => {
        const r = gradeUaalResolutionCompletion(fam.completions.row2_resolved_wrong, fam.resolvedRow);
        expect(r.class).toBe('resolved_wrong');
        expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.resolved_wrong);
        expect(r.reward).toBe(0.25);
      });

      it('row 3: resolved + abstained -> over_abstention (0.15)', () => {
        const r = gradeUaalResolutionCompletion(fam.completions.row3_over_abstention, fam.resolvedRow);
        expect(r.class).toBe('over_abstention');
        expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.over_abstention);
        expect(r.reward).toBe(0.15);
      });

      it('row 4: unresolvable + abstained + code/reason matches -> honest_abstain_reason_correct (1.00)', () => {
        const r = gradeUaalResolutionCompletion(fam.completions.row4_honest_abstain_correct, fam.unresolvableRow);
        expect(r.class).toBe('honest_abstain_reason_correct');
        expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.honest_abstain_reason_correct);
        expect(r.reward).toBe(1.0);
      });

      it('row 5: unresolvable + abstained + wrong/generic reason -> honest_abstain_reason_wrong (0.75)', () => {
        const r = gradeUaalResolutionCompletion(fam.completions.row5_honest_abstain_wrong, fam.unresolvableRow);
        expect(r.class).toBe('honest_abstain_reason_wrong');
        expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.honest_abstain_reason_wrong);
        expect(r.reward).toBe(0.75);
      });

      it('row 6: unresolvable + committed -> confabulation (0.00)', () => {
        const r = gradeUaalResolutionCompletion(fam.completions.row6_confabulation, fam.unresolvableRow);
        expect(r.class).toBe('confabulation');
        expect(r.reward).toBe(UAAL_RESOLUTION_REWARD_TABLE.confabulation);
        expect(r.reward).toBe(0.0);
      });

      it('row 7: malformed/unparseable (either gold status) -> malformed (0.00), never excluded', () => {
        const resolved = gradeUaalResolutionCompletion(fam.completions.row7_malformed, fam.resolvedRow);
        const unresolvable = gradeUaalResolutionCompletion(fam.completions.row7_malformed, fam.unresolvableRow);
        expect(resolved.class).toBe('malformed');
        expect(resolved.reward).toBe(0.0);
        expect(unresolvable.class).toBe('malformed');
        expect(unresolvable.reward).toBe(0.0);
      });
    });
  }

  it('missing context row / null row fails closed to malformed (spine contract)', () => {
    const r = gradeUaalResolutionCompletion('{"status":"resolved","answer":{"x":1}}', null);
    expect(r.class).toBe('malformed');
    expect(r.reward).toBe(0);
    expect(r.goldStatus).toBeNull();
  });

  it('a resolver throw (bad oracleIr) fails closed to malformed', () => {
    // 'temporal' resolver dereferences the IR; passing a non-object throws inside gradeByResolver.
    const badRow: UAALResolutionRow = { family: 'temporal', oracleIr: null };
    const r = gradeUaalResolutionCompletion('{"status":"resolved","answer":{}}', badRow);
    expect(r.class).toBe('malformed');
    expect(r.reward).toBe(0);
  });

  it('the reward function threads the whole batch through the orchestrator context slot', async () => {
    const rows: Array<UAALResolutionRow | null> = [
      FAMILY_CASES[0].resolvedRow,
      FAMILY_CASES[1].unresolvableRow,
      null,
    ];
    const completions = [
      FAMILY_CASES[0].completions.row1_resolved_correct,
      FAMILY_CASES[1].completions.row4_honest_abstain_correct,
      '{"status":"resolved","answer":{}}',
    ];
    const rewards = await uaalResolutionReward(completions, { uaalResolution: { rows } });
    expect(rewards).toEqual([1.0, 1.0, 0]);
  });

  it('a missing uaalResolution context slot fails the whole batch closed to 0', async () => {
    const rewards = await uaalResolutionReward(['anything', 'anything else'], {});
    expect(rewards).toEqual([0, 0]);
  });
});

// =============================================================================
// 2. DOMINANCE PROPERTY — attempting strictly dominates abstaining on solvable
// rows at EVERY accuracy including zero (memo §2's core claim). Verified both
// as a closed-form expectation check and empirically off the reward table.
// =============================================================================

describe('dominance property (attempt-EV > abstain-EV on solvable rows, independent of accuracy)', () => {
  it('attempt-EV = 0.25 + 0.75*acc strictly dominates abstain-EV = 0.15 at acc = 0', () => {
    // acc = 0: every attempt is resolved_wrong (0.25). This is the critical boundary the
    // memo's dominance argument rests on — the abstain-always equilibrium is only avoided
    // if attempting still beats abstaining even when the policy never gets an answer right.
    const attemptEV = UAAL_RESOLUTION_REWARD_TABLE.resolved_wrong; // acc=0 -> always resolved_wrong
    const abstainEV = UAAL_RESOLUTION_REWARD_TABLE.over_abstention;
    expect(attemptEV).toBeGreaterThan(abstainEV);
    expect(attemptEV).toBe(0.25);
    expect(abstainEV).toBe(0.15);
  });

  it('attempt-EV strictly dominates abstain-EV at every accuracy level, empirically, on real rows', () => {
    const fam = FAMILY_CASES[0]; // occlusion, resolved gold
    const abstainReward = gradeUaalResolutionCompletion(fam.completions.row3_over_abstention, fam.resolvedRow).reward;

    for (const acc of [0, 0.25, 0.5, 0.75, 1]) {
      // Simulate a batch of N attempts with the given accuracy by mixing row1 (correct) and
      // row2 (wrong) completions in the right proportion, and averaging the graded rewards —
      // exactly what a GRPO batch mean would compute.
      const n = 20;
      const nCorrect = Math.round(acc * n);
      const rewards: number[] = [];
      for (let i = 0; i < n; i++) {
        const completion =
          i < nCorrect ? fam.completions.row1_resolved_correct : fam.completions.row2_resolved_wrong;
        rewards.push(gradeUaalResolutionCompletion(completion, fam.resolvedRow).reward);
      }
      const attemptEV = rewards.reduce((a, b) => a + b, 0) / rewards.length;
      const expectedEV = 0.25 + 0.75 * acc;
      expect(attemptEV).toBeCloseTo(expectedEV, 6);
      expect(attemptEV).toBeGreaterThan(abstainReward);
    }
  });

  it('on unsolvable rows, abstaining (>=0.75) strictly dominates committing (0.0) regardless of reason correctness', () => {
    const fam = FAMILY_CASES[1]; // affordance, unresolvable gold
    const confabulate = gradeUaalResolutionCompletion(fam.completions.row6_confabulation, fam.unresolvableRow).reward;
    const abstainReasonWrong = gradeUaalResolutionCompletion(
      fam.completions.row5_honest_abstain_wrong,
      fam.unresolvableRow
    ).reward;
    const abstainReasonCorrect = gradeUaalResolutionCompletion(
      fam.completions.row4_honest_abstain_correct,
      fam.unresolvableRow
    ).reward;
    expect(abstainReasonWrong).toBeGreaterThanOrEqual(0.75);
    expect(abstainReasonCorrect).toBeGreaterThan(confabulate);
    expect(abstainReasonWrong).toBeGreaterThan(confabulate);
    expect(confabulate).toBe(0);
  });
});

// =============================================================================
// 3. TS-vs-SUBPROCESS PARITY — the TS in-process term vs the Node subprocess
// grader (scripts/reward/grade-uaal-emissions.mjs, ai-ecosystem repo) on an
// IDENTICAL batch, bit-for-bit (F.076 evidence item 3). This is a genuine
// cross-repo boundary check: both sides import gradeByResolver from
// @holoscript/uaal, so a mismatch here would catch source/published drift,
// not just a process-boundary bug.
// =============================================================================

describe('TS-vs-subprocess parity (cross-boundary grader)', () => {
  // Standard local dev layout for this environment: ai-ecosystem is a sibling
  // checkout under the user's home directory. Overridable via env var so this
  // test can be pointed at a different checkout without editing the test.
  const graderScript =
    process.env.UAAL_GRADER_SCRIPT ||
    path.join(os.homedir(), '.ai-ecosystem', 'scripts', 'reward', 'grade-uaal-emissions.mjs');

  const graderExists = fs.existsSync(graderScript);

  it.runIf(graderExists)('matches the Node subprocess grader bit-for-bit on 7x3 plus aleatoric cases', () => {
    const cases: Array<{ row: UAALResolutionRow; completion: string }> = [];
    for (const fam of FAMILY_CASES) {
      cases.push({ row: fam.resolvedRow, completion: fam.completions.row1_resolved_correct });
      cases.push({ row: fam.resolvedRow, completion: fam.completions.row2_resolved_wrong });
      cases.push({ row: fam.resolvedRow, completion: fam.completions.row3_over_abstention });
      cases.push({ row: fam.unresolvableRow, completion: fam.completions.row4_honest_abstain_correct });
      cases.push({ row: fam.unresolvableRow, completion: fam.completions.row5_honest_abstain_wrong });
      cases.push({ row: fam.unresolvableRow, completion: fam.completions.row6_confabulation });
      cases.push({ row: fam.resolvedRow, completion: fam.completions.row7_malformed });
    }
    const aleatoricRow: UAALResolutionRow = {
      family: 'counterfactual',
      oracleIr: {
        effects: [{ id: 'E', sufficientSets: [['A']], stochastic: true }],
        occurs: ['A'],
        query: { effect: 'E' },
      },
    };
    cases.push(
      {
        row: aleatoricRow,
        completion: JSON.stringify({
          status: 'unresolvable',
          reason: 'irreducible_stochastic',
          code: 'counterfactual.irreducible_chance',
        }),
      },
      {
        row: aleatoricRow,
        completion: JSON.stringify({
          status: 'unresolvable',
          reason: 'underdetermined',
          code: 'some.wrong_code',
        }),
      },
      {
        row: aleatoricRow,
        completion: JSON.stringify({ status: 'resolved', answer: { E: { A: true } } }),
      }
    );

    const tsResults = cases.map(({ row, completion }) => gradeUaalResolutionCompletion(completion, row));

    const stdinPayload =
      cases
        .map(({ row, completion }) =>
          JSON.stringify({ family: row.family, oracleIr: row.oracleIr, query: row.query ?? {}, completion })
        )
        .join('\n') + '\n';

    // Force the subprocess through the current verifier source. The grader defaults to its
    // installed @holoscript/uaal for production, but a source-vs-published comparison can pass or
    // fail solely because the package registry lags this checkout. This override proves the process
    // boundary itself against the exact verifier-of-record the TS lane imported above.
    const verifierModule = pathToFileURL(path.resolve(__dirname, '../../../../uaal/src/index.ts')).href;
    const proc = spawnSync('node', ['--import', 'tsx', graderScript], {
      input: stdinPayload,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, UAAL_VERIFIER_MODULE: verifierModule },
    });

    expect(proc.status).toBe(0);
    const subprocessLines = proc.stdout.trim().split('\n').filter(Boolean);
    expect(subprocessLines).toHaveLength(tsResults.length);
    const subprocessResults = subprocessLines.map((line) => JSON.parse(line));

    tsResults.forEach((ts, i) => expect(subprocessResults[i]).toEqual(ts));
  });

  it('fails loud (not skipped-silently) when the sibling grader script is genuinely absent', () => {
    // Documents the fallback behavior: it.runIf above SKIPS when the script is missing rather
    // than falsely passing. This assertion makes that condition visible in the test report
    // instead of a silent no-op, and would flag a broken CI checkout layout.
    if (!graderExists) {
      throw new Error(
        `cross-boundary grader not found at ${graderScript} — the parity test above was skipped`
      );
    }
    expect(graderExists).toBe(true);
  });
});

// =============================================================================
// 4. CONSTRUCTOR WEIGHT-SUM THROWS (5-edit orchestrator registration)
// =============================================================================

function createMockRunner(): RewardToolRunner {
  return {
    writeTempFile: async () => '/tmp/test-file.ts',
    deleteTempFile: async () => {},
    runVitest: async () => ({ passed: 10, total: 10, coveragePercent: 80, output: 'ok' }),
    runTypeCheck: async () => ({ passed: true, output: '' }),
    runLint: async () => ({ issueCount: 0, output: '' }),
    getCircuitBreakerHealth: async () => 100,
  };
}

describe('GRPORewardOrchestrator uAAL-resolution registration (flag-gated, default OFF)', () => {
  it('is disabled by default: getRewardFuncsArray has exactly the base 5, no uaal term', () => {
    const orch = new GRPORewardOrchestrator(createMockRunner());
    expect(orch.getRewardFuncsArray()).toHaveLength(5);
    expect(orch.getWeights().uaalResolutionReward).toBeUndefined();
  });

  it('throws when enableUaalResolution is set without weights.uaalResolutionReward', () => {
    expect(() => {
      new GRPORewardOrchestrator(createMockRunner(), { enableUaalResolution: true });
    }).toThrow('enableUaalResolution requires weights.uaalResolutionReward');
  });

  it('throws when weights.uaalResolutionReward is set without enableUaalResolution', () => {
    expect(() => {
      new GRPORewardOrchestrator(createMockRunner(), {
        weights: { uaalResolutionReward: 0.4 },
      });
    }).toThrow('weights.uaalResolutionReward requires enableUaalResolution: true');
  });

  it('throws when the full weight set (base 5 + uaal term) does not sum to 1.0', () => {
    expect(() => {
      new GRPORewardOrchestrator(createMockRunner(), {
        enableUaalResolution: true,
        weights: {
          testPassReward: 0.4,
          typeCheckReward: 0.2,
          lintReward: 0.15,
          coverageReward: 0.15,
          circuitBreakerReward: 0.1,
          uaalResolutionReward: 0.4, // pushes the sum to 1.4
        },
      });
    }).toThrow('must sum to 1.0');
  });

  it('accepts a rebalanced weight set summing to 1.0 and exposes it via getWeights/getRewardFuncsArray', () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      enableUaalResolution: true,
      weights: {
        testPassReward: 0.3,
        typeCheckReward: 0.15,
        lintReward: 0.1,
        coverageReward: 0.1,
        circuitBreakerReward: 0.05,
        uaalResolutionReward: 0.3,
      },
    });
    expect(orch.getWeights().uaalResolutionReward).toBe(0.3);
    expect(orch.getRewardFuncsArray()).toHaveLength(6);
  });

  it('evaluate() wires kwargs.uaalResolution through to the uaal term end-to-end', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      enableUaalResolution: true,
      cacheEnabled: false,
      weights: {
        testPassReward: 0.3,
        typeCheckReward: 0.15,
        lintReward: 0.1,
        coverageReward: 0.1,
        circuitBreakerReward: 0.05,
        uaalResolutionReward: 0.3,
      },
    });
    const fam = FAMILY_CASES[0];
    const result = await orch.evaluate([fam.completions.row1_resolved_correct], {
      uaalResolution: { rows: [fam.resolvedRow] },
    });
    const uaalFr = result.functionResults.find((f) => f.name === 'uaalResolutionReward');
    expect(uaalFr).toBeDefined();
    expect(uaalFr?.rewards[0]).toBe(1.0);
  });

  it('bypasses the completion cache whenever enableUaalResolution is set (batch-context-dependent reward)', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      enableUaalResolution: true,
      weights: {
        testPassReward: 0.3,
        typeCheckReward: 0.15,
        lintReward: 0.1,
        coverageReward: 0.1,
        circuitBreakerReward: 0.05,
        uaalResolutionReward: 0.3,
      },
    });
    const fam = FAMILY_CASES[0];
    // Same completion string graded against two DIFFERENT rows (resolved vs unresolvable gold) —
    // if the cache were active this would incorrectly return the same reward both times.
    const first = await orch.evaluate([fam.completions.row1_resolved_correct], {
      uaalResolution: { rows: [fam.resolvedRow] },
    });
    const second = await orch.evaluate([fam.completions.row1_resolved_correct], {
      uaalResolution: { rows: [fam.unresolvableRow] },
    });
    expect(first.cacheHits).toBe(0);
    expect(second.cacheHits).toBe(0);
  });
});

// =============================================================================
// Z_m NATIVE GOLD (memo §4) — status-match indicator, flag-gated helper
// =============================================================================

describe('computeUaalStatusMatchGold (Z_m native gold, memo §4)', () => {
  it('rows 1, 4, 5 -> F_gold=1; rows 2, 3, 6, 7 -> F_gold=0', () => {
    const fam = FAMILY_CASES[1]; // affordance
    const completions = [
      fam.completions.row1_resolved_correct, // resolved gold
      fam.completions.row2_resolved_wrong, // resolved gold
      fam.completions.row3_over_abstention, // resolved gold
      fam.completions.row4_honest_abstain_correct, // unresolvable gold
      fam.completions.row5_honest_abstain_wrong, // unresolvable gold
      fam.completions.row6_confabulation, // unresolvable gold
      fam.completions.row7_malformed, // unresolvable gold (either works)
    ];
    const rows = [
      fam.resolvedRow,
      fam.resolvedRow,
      fam.resolvedRow,
      fam.unresolvableRow,
      fam.unresolvableRow,
      fam.unresolvableRow,
      fam.unresolvableRow,
    ];
    const gold = computeUaalStatusMatchGold(completions, rows);
    expect(gold).toEqual([1, 0, 0, 1, 1, 0, 0]);
  });
});

// =============================================================================
// Parser / comparator unit coverage (supporting the classes above)
// =============================================================================

describe('parseUaalEmission', () => {
  it('parses a committed answer', () => {
    const parsed = parseUaalEmission('{"status":"resolved","answer":{"x":1}}');
    expect(parsed).toEqual({ committed: true, answer: { x: 1 } });
  });

  it('parses an abstention with nested resolution/gap blocks', () => {
    const parsed = parseUaalEmission(
      '{"resolution":{"status":"unresolvable"},"gap":{"code":"temporal.unstated_now"}}'
    );
    expect(parsed?.committed).toBe(false);
    expect(parsed?.code).toBe('temporal.unstated_now');
  });

  it('returns null for unparseable text', () => {
    expect(parseUaalEmission('not json')).toBeNull();
  });

  it('tolerates surrounding prose around a JSON block', () => {
    const parsed = parseUaalEmission('Here is my answer: {"status":"resolved","answer":{"ok":true}} thanks');
    expect(parsed).toEqual({ committed: true, answer: { ok: true } });
  });
});

describe('deepSubsetEqual', () => {
  it('matches when every gold key is present and equal, extra model keys are fine', () => {
    expect(deepSubsetEqual({ affords: true }, { affords: true, reason: null })).toBe(true);
  });

  it('fails when a gold key is missing or different', () => {
    expect(deepSubsetEqual({ affords: true }, { affords: false })).toBe(false);
    expect(deepSubsetEqual({ affords: true }, {})).toBe(false);
  });
});
