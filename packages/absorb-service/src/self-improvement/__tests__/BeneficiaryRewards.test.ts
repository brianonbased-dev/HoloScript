import { describe, it, expect, vi } from 'vitest';
import type { RewardToolRunner, RewardFunctionOptions } from '../GRPORewardFunctions';
import { GRPORewardOrchestrator } from '../GRPORewardOrchestrator';
import {
  agentBenefitReward,
  humanBenefitReward,
  isFabricatedClaim,
  composeBeneficiaryReward,
  assertDialSumsToOne,
  BALANCED_DIAL,
  HUMAN_FIRST_DIAL,
  COMMONS_DIAL,
  DEFAULT_BENEFICIARY_CONFIG,
  type BeneficiaryComposeConfig,
} from '../BeneficiaryRewards';

// =============================================================================
// MOCK RUNNER — all tools pass, so the self-composite R_self ≈ 0.97 regardless
// of completion text. This isolates the beneficiary logic from the 5 base terms.
// =============================================================================

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

/** R_self produced by the all-pass mock runner: .4 + .2 + .15 + .12 + .1 */
const MOCK_R_SELF = 0.97;

// =============================================================================
// HONESTY GATE — the human floor at the term level
// =============================================================================

describe('isFabricatedClaim (honesty gate)', () => {
  it('flags a verification claim with NO checkable evidence', () => {
    expect(isFabricatedClaim('Everything is fully verified and works perfectly!')).toBe(true);
    expect(isFabricatedClaim('All tests green. Guaranteed correct.')).toBe(true);
    expect(isFabricatedClaim('Done — validated end to end.')).toBe(true);
  });

  it('does NOT flag a verification claim that carries checkable evidence', () => {
    expect(isFabricatedClaim('verified: commit a64535892, validation=vitest PASS')).toBe(false);
    expect(isFabricatedClaim('All tests green (12/12).')).toBe(false);
    expect(isFabricatedClaim('validated — see packages/holollama/src/index.ts')).toBe(false);
  });

  it('does NOT flag honest completion claims that assert no verification', () => {
    expect(isFabricatedClaim('Fixed the typo in line 3.')).toBe(false);
    expect(isFabricatedClaim('I could not complete this — blocked on a missing key.')).toBe(false);
    expect(isFabricatedClaim('')).toBe(false);
  });
});

// =============================================================================
// TERMS — fail closed, honesty-gated
// =============================================================================

describe('agentBenefitReward', () => {
  it('passes through valid gold', async () => {
    const ctx: RewardFunctionOptions = { agentBenefit: { agentBenefitGold: [0.8, 0.2] } };
    expect(await agentBenefitReward(['a', 'b'], ctx)).toEqual([0.8, 0.2]);
  });

  it('fails closed with no context', async () => {
    expect(await agentBenefitReward(['a', 'b'])).toEqual([0, 0]);
  });

  it('fails closed on missing / out-of-range gold', async () => {
    const ctx: RewardFunctionOptions = {
      agentBenefit: { agentBenefitGold: [1.5, Number.NaN, 0.5] },
    };
    expect(await agentBenefitReward(['a', 'b', 'c'], ctx)).toEqual([0, 0, 0.5]);
  });
});

describe('humanBenefitReward', () => {
  it('passes through valid gold for honest completions', async () => {
    const ctx: RewardFunctionOptions = { humanBenefit: { humanBenefitGold: [0.9] } };
    expect(await humanBenefitReward(['fixed the parser bug in foo.ts'], ctx)).toEqual([0.9]);
  });

  it('zeroes a fabricated completion regardless of gold (human floor at term level)', async () => {
    const ctx: RewardFunctionOptions = { humanBenefit: { humanBenefitGold: [0.9] } };
    // Same high gold, but the completion lies about verification → 0.
    expect(await humanBenefitReward(['All verified and working, guaranteed!'], ctx)).toEqual([0]);
  });

  it('fails closed with no context or out-of-range gold', async () => {
    expect(await humanBenefitReward(['x'])).toEqual([0]);
    const ctx: RewardFunctionOptions = { humanBenefit: { humanBenefitGold: [2] } };
    expect(await humanBenefitReward(['x'], ctx)).toEqual([0]);
  });
});

// =============================================================================
// PURE HOLARCHIC COMPOSITION
// =============================================================================

describe('composeBeneficiaryReward — hard human floor', () => {
  it('collapses to 0 when R_humans is below the floor, even with perfect self/agents', () => {
    const r = composeBeneficiaryReward(
      { rSelf: 1, rAgents: 1, rHumans: 0.4 },
      DEFAULT_BENEFICIARY_CONFIG // humanFloor 0.5
    );
    expect(r.reward).toBe(0);
    expect(r.floorBreached).toBe('humans');
  });

  it('is non-extractive: no amount of self/agent benefit buys past human harm', () => {
    // A self-serving action that harms the human whole scores 0...
    const harmful = composeBeneficiaryReward(
      { rSelf: 1, rAgents: 1, rHumans: 0.0 },
      DEFAULT_BENEFICIARY_CONFIG
    );
    // ...while merely clearing the floor already scores positive.
    const ok = composeBeneficiaryReward(
      { rSelf: 1, rAgents: 1, rHumans: 0.6 },
      DEFAULT_BENEFICIARY_CONFIG
    );
    expect(harmful.reward).toBe(0);
    expect(ok.reward).toBeGreaterThan(0);
  });

  it('within the floor, dials the three by role (balanced)', () => {
    const r = composeBeneficiaryReward(
      { rSelf: 1, rAgents: 1, rHumans: 1 },
      DEFAULT_BENEFICIARY_CONFIG
    );
    expect(r.reward).toBeCloseTo(1.0, 6); // 0.34 + 0.33 + 0.33
    expect(r.floorBreached).toBeNull();
  });
});

describe('composeBeneficiaryReward — soft agent floor', () => {
  const cfg: BeneficiaryComposeConfig = {
    humanFloor: 0.5,
    agentFloor: 0.5,
    agentPenaltyMultiplier: 0.5,
    dial: BALANCED_DIAL,
  };

  it('penalises (not zeroes) when the agent commons is damaged', () => {
    const r = composeBeneficiaryReward({ rSelf: 1, rAgents: 0.2, rHumans: 1 }, cfg);
    // dialled = .34*1 + .33*.2 + .33*1 = .736 ; * 0.5 penalty = .368
    expect(r.reward).toBeCloseTo(0.368, 6);
    expect(r.floorBreached).toBe('agents');
  });

  it('does not penalise when the agent commons floor is met', () => {
    const r = composeBeneficiaryReward({ rSelf: 1, rAgents: 0.8, rHumans: 1 }, cfg);
    expect(r.floorBreached).toBeNull();
    expect(r.reward).toBeGreaterThan(0.9);
  });
});

describe('composeBeneficiaryReward — served + dials + validation', () => {
  it('reports which beneficiary received the largest dialled contribution', () => {
    // Human-first dial with human dominant → served humans.
    const r = composeBeneficiaryReward(
      { rSelf: 0.5, rAgents: 0.5, rHumans: 0.9 },
      { ...DEFAULT_BENEFICIARY_CONFIG, dial: HUMAN_FIRST_DIAL }
    );
    expect(r.served).toBe('humans');
  });

  it('commons dial routes credit to siblings', () => {
    const r = composeBeneficiaryReward(
      { rSelf: 0.6, rAgents: 0.9, rHumans: 0.6 },
      { ...DEFAULT_BENEFICIARY_CONFIG, dial: COMMONS_DIAL }
    );
    expect(r.served).toBe('agents');
  });

  it('clamps out-of-range scores', () => {
    const r = composeBeneficiaryReward(
      { rSelf: 5, rAgents: -3, rHumans: 1 },
      DEFAULT_BENEFICIARY_CONFIG
    );
    expect(r.self).toBe(1);
    expect(r.agents).toBe(0);
    expect(r.reward).toBeLessThanOrEqual(1);
  });

  it('rejects a dial that does not sum to 1.0', () => {
    expect(() => assertDialSumsToOne({ self: 0.5, agents: 0.5, humans: 0.5 })).toThrow();
    expect(() =>
      composeBeneficiaryReward(
        { rSelf: 1, rAgents: 1, rHumans: 1 },
        { ...DEFAULT_BENEFICIARY_CONFIG, dial: { self: 0.5, agents: 0.5, humans: 0.5 } }
      )
    ).toThrow();
  });
});

// =============================================================================
// ORCHESTRATOR INTEGRATION
// =============================================================================

describe('GRPORewardOrchestrator — beneficiary holarchy', () => {
  it('leaves the flat-sum path unchanged when holarchy is off', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), { cacheEnabled: false });
    const res = await orch.evaluate(['some code']);
    expect(res.beneficiaryReceipts).toBeUndefined();
    expect(res.compositeRewards[0]).toBeCloseTo(MOCK_R_SELF, 6);
  });

  it('exposes 7 reward funcs and attaches receipts when holarchy is on', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      beneficiaryHolarchy: DEFAULT_BENEFICIARY_CONFIG,
    });
    expect(orch.getRewardFuncsArray()).toHaveLength(7);

    const res = await orch.evaluate(['honest work in foo.ts'], {
      agentBenefit: { agentBenefitGold: [0.8] },
      humanBenefit: { humanBenefitGold: [0.9] },
    });
    expect(res.beneficiaryReceipts).toBeDefined();
    const rcpt = res.beneficiaryReceipts![0];
    expect(rcpt.self).toBeCloseTo(MOCK_R_SELF, 6);
    expect(rcpt.agents).toBe(0.8);
    expect(rcpt.humans).toBe(0.9);
    // dialled = .34*.97 + .33*.8 + .33*.9 = .8908
    expect(res.compositeRewards[0]).toBeCloseTo(0.8908, 4);
    expect(rcpt.floorBreached).toBeNull();
  });

  it('the hard human floor bites through the orchestrator', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      beneficiaryHolarchy: DEFAULT_BENEFICIARY_CONFIG,
    });
    const res = await orch.evaluate(['self-serving but human-valueless'], {
      agentBenefit: { agentBenefitGold: [1.0] },
      humanBenefit: { humanBenefitGold: [0.3] }, // below humanFloor 0.5
    });
    expect(res.compositeRewards[0]).toBe(0);
    expect(res.beneficiaryReceipts![0].floorBreached).toBe('humans');
  });

  it('end-to-end non-extractive: a lie collapses the reward even at max human gold', async () => {
    const orch = new GRPORewardOrchestrator(createMockRunner(), {
      beneficiaryHolarchy: DEFAULT_BENEFICIARY_CONFIG,
    });
    // Identical high gold; the honest completion is rewarded, the fabricated one is not.
    const honest = await orch.evaluate(['shipped fix, see foo.ts'], {
      agentBenefit: { agentBenefitGold: [0.8] },
      humanBenefit: { humanBenefitGold: [0.95] },
    });
    const lie = await orch.evaluate(['All fully verified and guaranteed correct!'], {
      agentBenefit: { agentBenefitGold: [0.8] },
      humanBenefit: { humanBenefitGold: [0.95] },
    });
    expect(honest.compositeRewards[0]).toBeGreaterThan(0.8);
    expect(lie.compositeRewards[0]).toBe(0); // R_humans → 0 → below floor → collapse
    expect(lie.beneficiaryReceipts![0].floorBreached).toBe('humans');
  });

  it('rejects a holarchy dial that does not sum to 1.0 at construction', () => {
    expect(
      () =>
        new GRPORewardOrchestrator(createMockRunner(), {
          beneficiaryHolarchy: {
            ...DEFAULT_BENEFICIARY_CONFIG,
            dial: { self: 0.5, agents: 0.5, humans: 0.5 },
          },
        })
    ).toThrow();
  });
});
