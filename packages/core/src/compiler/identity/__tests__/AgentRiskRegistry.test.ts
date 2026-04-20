/**
 * Tests for AgentRiskRegistry — per-agent confabulation risk tier layer.
 *
 * Covers:
 *   - Score accrual + decay
 *   - Tier classification
 *   - Success-based decay
 *   - Administrative tier overrides
 *   - Snapshot diagnostics
 *   - AgentRBAC.checkAccessWithRiskGate() integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AgentRole,
  WorkflowStep,
  AgentConfig,
  generateAgentKeyPair,
} from '../AgentIdentity';
import { AgentTokenIssuer, TokenRequest, resetTokenIssuer } from '../AgentTokenIssuer';
import { AgentRBAC, ResourceType, resetRBAC } from '../AgentRBAC';
import {
  AgentRiskRegistry,
  RiskTier,
  TIER_COMPOSITION_RISK_CAP,
  isDangerousOperation,
  resetAgentRiskRegistry,
  getAgentRiskRegistry,
} from '../AgentRiskRegistry';
import {
  ConfabulationValidator,
  resetConfabulationValidator,
  type ConfabulationValidationResult,
  type ConfabulationError,
  ConfabulationErrorCode,
} from '../ConfabulationValidator';
import type { HoloComposition } from '../../../parser/HoloCompositionTypes';

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function makeError(severity: number): ConfabulationError {
  return {
    code: ConfabulationErrorCode.UNKNOWN_PROPERTY,
    message: 'unknown property test',
    riskContribution: severity,
  };
}

function makeResult(opts: {
  valid: boolean;
  riskScore: number;
  errors?: ConfabulationError[];
}): ConfabulationValidationResult {
  return {
    valid: opts.valid,
    riskScore: opts.riskScore,
    errors: opts.errors ?? [],
    warnings: [],
    traitsChecked: 1,
    propertiesChecked: 1,
    validationTimeMs: 0,
  };
}

function makeComposition(opts: {
  withConfabulation?: boolean;
}): HoloComposition {
  if (opts.withConfabulation) {
    // Apply unknown property to known trait → guaranteed schema warning,
    // and a known property out of range → guaranteed error.
    return {
      type: 'Composition',
      name: 'test',
      objects: [
        {
          type: 'Object',
          name: 'cube',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'physics',
              // mass=999 ok, restitution=5 (out of [0,1]) → error
              config: { restitution: 5, gravity: true },
            },
          ],
        },
      ],
      templates: [],
      spatialGroups: [],
      lights: [],
      imports: [],
      timelines: [],
      audio: [],
    } as unknown as HoloComposition;
  }
  // Empty composition → no traits → valid
  return {
    type: 'Composition',
    name: 'test',
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
  } as unknown as HoloComposition;
}

// -----------------------------------------------------------------------------
// SUITE 1: AgentRiskRegistry pure behavior
// -----------------------------------------------------------------------------

describe('AgentRiskRegistry — pure behavior', () => {
  let now = 0;
  let registry: AgentRiskRegistry;

  beforeEach(() => {
    now = 1_000_000_000_000;
    registry = new AgentRiskRegistry({
      halfLifeMs: 60_000, // 1 minute for fast decay in tests
      now: () => now,
      successCreditPerOp: 5,
    });
  });

  afterEach(() => {
    resetAgentRiskRegistry();
  });

  it('reports score 0 and tier LOW for unknown agent', () => {
    expect(registry.getScore('agent:unknown')).toBe(0);
    expect(registry.getTier('agent:unknown')).toBe(RiskTier.LOW);
  });

  it('accrues score from a single confabulation event', () => {
    registry.recordValidation(
      'agent:bad',
      makeResult({ valid: false, riskScore: 30, errors: [makeError(30)] })
    );
    expect(registry.getScore('agent:bad')).toBeCloseTo(30, 0);
    expect(registry.getTier('agent:bad')).toBe(RiskTier.MEDIUM);
  });

  it('decays score by 50% after one half-life', () => {
    registry.recordValidation(
      'agent:bad',
      makeResult({ valid: false, riskScore: 60, errors: [makeError(60)] })
    );
    expect(registry.getScore('agent:bad')).toBeCloseTo(60, 0);
    now += 60_000; // advance one half-life
    expect(registry.getScore('agent:bad')).toBeCloseTo(30, 0);
    now += 60_000;
    expect(registry.getScore('agent:bad')).toBeCloseTo(15, 0);
  });

  it('classifies tiers correctly', () => {
    // LOW
    registry.recordValidation(
      'agent:l',
      makeResult({ valid: false, riskScore: 5, errors: [makeError(5)] })
    );
    expect(registry.getTier('agent:l')).toBe(RiskTier.LOW);

    // MEDIUM
    registry.recordValidation(
      'agent:m',
      makeResult({ valid: false, riskScore: 25, errors: [makeError(25)] })
    );
    expect(registry.getTier('agent:m')).toBe(RiskTier.MEDIUM);

    // HIGH
    registry.recordValidation(
      'agent:h',
      makeResult({ valid: false, riskScore: 50, errors: [makeError(50)] })
    );
    expect(registry.getTier('agent:h')).toBe(RiskTier.HIGH);

    // QUARANTINED
    registry.recordValidation(
      'agent:q',
      makeResult({ valid: false, riskScore: 80, errors: [makeError(80)] })
    );
    expect(registry.getTier('agent:q')).toBe(RiskTier.QUARANTINED);
  });

  it('records success as negative event that lowers score', () => {
    registry.recordValidation(
      'agent:s',
      makeResult({ valid: false, riskScore: 30, errors: [makeError(30)] })
    );
    expect(registry.getScore('agent:s')).toBeCloseTo(30, 0);
    registry.recordSuccess('agent:s');
    registry.recordSuccess('agent:s');
    // 30 - 5 - 5 = 20 (no decay yet — same instant)
    expect(registry.getScore('agent:s')).toBeCloseTo(20, 0);
  });

  it('clamps score floor at 0 even with many successes', () => {
    for (let i = 0; i < 10; i++) registry.recordSuccess('agent:happy');
    expect(registry.getScore('agent:happy')).toBe(0);
  });

  it('clamps score ceiling at 100 even with extreme severity', () => {
    for (let i = 0; i < 5; i++) {
      registry.recordValidation(
        'agent:terrible',
        makeResult({ valid: false, riskScore: 95, errors: [makeError(95)] })
      );
    }
    expect(registry.getScore('agent:terrible')).toBe(100);
  });

  it('treats valid result as success', () => {
    registry.recordValidation(
      'agent:before',
      makeResult({ valid: false, riskScore: 30, errors: [makeError(30)] })
    );
    registry.recordValidation('agent:before', makeResult({ valid: true, riskScore: 0 }));
    // Last call recorded a success, so score = 30 - 5 = 25
    expect(registry.getScore('agent:before')).toBeCloseTo(25, 0);
  });

  it('honors maxEventsPerAgent (oldest discarded)', () => {
    const r = new AgentRiskRegistry({
      halfLifeMs: 60_000,
      maxEventsPerAgent: 3,
      now: () => now,
      successCreditPerOp: 0,
    });
    for (let i = 0; i < 5; i++) {
      r.recordEvent({ agentId: 'a', severity: 10, reason: `e${i}`, timestamp: now });
    }
    // 5 - 3 = 2 dropped, 3 remain → ~30
    expect(r.getScore('a')).toBeCloseTo(30, 0);
  });

  it('setTier puts agent at the lower bound of requested tier', () => {
    registry.setTier('agent:set', RiskTier.HIGH);
    expect(registry.getTier('agent:set')).toBe(RiskTier.HIGH);
    registry.setTier('agent:set', RiskTier.QUARANTINED);
    expect(registry.getTier('agent:set')).toBe(RiskTier.QUARANTINED);
    registry.setTier('agent:set', RiskTier.LOW);
    expect(registry.getTier('agent:set')).toBe(RiskTier.LOW);
  });

  it('clear removes all history for an agent', () => {
    registry.recordValidation(
      'agent:c',
      makeResult({ valid: false, riskScore: 50, errors: [makeError(50)] })
    );
    expect(registry.getScore('agent:c')).toBeCloseTo(50, 0);
    registry.clear('agent:c');
    expect(registry.getScore('agent:c')).toBe(0);
    expect(registry.getTier('agent:c')).toBe(RiskTier.LOW);
  });

  it('snapshot reports score, tier, counts, and last event time', () => {
    registry.recordValidation(
      'agent:snap',
      makeResult({ valid: false, riskScore: 60, errors: [makeError(60)] })
    );
    const t1 = now;
    now += 10_000; // 10s later: 60 * 0.5^(10/60) ≈ 53.4
    registry.recordSuccess('agent:snap'); // - 5 = ~48.4 → still HIGH
    const snap = registry.getSnapshot('agent:snap');
    expect(snap.tier).toBe(RiskTier.HIGH);
    expect(snap.recentEventCount).toBe(1); // success doesn't count as positive event
    expect(snap.lifetimeEventCount).toBe(1);
    expect(snap.lifetimeSuccessCount).toBe(1);
    expect(snap.lastEventAt).toBe(t1);
  });

  it('listAgents returns all tracked agents', () => {
    registry.recordEvent({ agentId: 'a1', severity: 10, reason: 'e', timestamp: now });
    registry.recordEvent({ agentId: 'a2', severity: 10, reason: 'e', timestamp: now });
    expect(registry.listAgents().sort()).toEqual(['a1', 'a2']);
  });

  it('rejects invalid threshold ordering at construction', () => {
    expect(
      () =>
        new AgentRiskRegistry({
          tierThresholds: { medium: 50, high: 40, quarantined: 70 },
        })
    ).toThrow(/medium must be < high/);
    expect(
      () =>
        new AgentRiskRegistry({
          tierThresholds: { medium: 10, high: 50, quarantined: 50 },
        })
    ).toThrow(/high must be < quarantined/);
  });

  it('rejects non-positive halfLife at construction', () => {
    expect(() => new AgentRiskRegistry({ halfLifeMs: 0 })).toThrow(/halfLifeMs/);
    expect(() => new AgentRiskRegistry({ halfLifeMs: -1 })).toThrow(/halfLifeMs/);
  });

  it('isDangerousOperation classifies write/transform/execute as dangerous', () => {
    expect(isDangerousOperation('write')).toBe(true);
    expect(isDangerousOperation('transform')).toBe(true);
    expect(isDangerousOperation('execute')).toBe(true);
    expect(isDangerousOperation('read')).toBe(false);
  });

  it('TIER_COMPOSITION_RISK_CAP exposes monotonic caps', () => {
    expect(TIER_COMPOSITION_RISK_CAP[RiskTier.LOW]).toBeGreaterThan(
      TIER_COMPOSITION_RISK_CAP[RiskTier.MEDIUM]
    );
    expect(TIER_COMPOSITION_RISK_CAP[RiskTier.MEDIUM]).toBeGreaterThan(
      TIER_COMPOSITION_RISK_CAP[RiskTier.HIGH]
    );
    expect(TIER_COMPOSITION_RISK_CAP[RiskTier.QUARANTINED]).toBeLessThan(0);
  });

  it('singleton getAgentRiskRegistry returns same instance', () => {
    const r1 = getAgentRiskRegistry();
    const r2 = getAgentRiskRegistry();
    expect(r1).toBe(r2);
    resetAgentRiskRegistry();
    const r3 = getAgentRiskRegistry();
    expect(r3).not.toBe(r1);
  });
});

// -----------------------------------------------------------------------------
// SUITE 2: AgentRBAC.checkAccessWithRiskGate integration
// -----------------------------------------------------------------------------

describe('AgentRBAC.checkAccessWithRiskGate — integration', () => {
  let tokenIssuer: AgentTokenIssuer;
  let rbac: AgentRBAC;
  let registry: AgentRiskRegistry;

  beforeEach(async () => {
    tokenIssuer = new AgentTokenIssuer({
      issuer: 'test',
      jwtSecret: 'test-secret-key',
      tokenExpiration: '1h',
      strictWorkflowValidation: false,
    });
    rbac = new AgentRBAC(tokenIssuer);
    registry = new AgentRiskRegistry({
      halfLifeMs: 60_000,
      successCreditPerOp: 5,
    });
    // Reset confabulation validator singleton so its config is fresh.
    resetConfabulationValidator();
  });

  afterEach(() => {
    resetTokenIssuer();
    resetRBAC();
    resetAgentRiskRegistry();
    resetConfabulationValidator();
  });

  async function issueToken(role: AgentRole, step: WorkflowStep): Promise<string> {
    const config: AgentConfig = { role, name: `${role}-test`, version: '1.0.0' };
    const keyPair = await generateAgentKeyPair(role);
    const request: TokenRequest = {
      agentConfig: config,
      workflowStep: step,
      workflowId: `wf-${Date.now()}-${Math.random()}`,
      initiatedBy: AgentRole.ORCHESTRATOR,
      keyPair,
    };
    return tokenIssuer.issueToken(request);
  }

  it('grants dangerous op to LOW-tier agent on clean composition', async () => {
    const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
    const decision = rbac.checkAccessWithRiskGate(
      {
        token,
        resourceType: ResourceType.AST,
        operation: 'write',
      },
      makeComposition({ withConfabulation: false }),
      { registry }
    );
    expect(decision.allowed).toBe(true);
    expect(decision.riskTier).toBe(RiskTier.LOW);
    expect(decision.confabulation?.valid).toBe(true);
  });

  it('blocks dangerous op when composition risk exceeds tier cap', async () => {
    const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
    // First, push agent into HIGH tier so the cap is 10.
    const agentSub = `agent:${AgentRole.AST_OPTIMIZER}:${AgentRole.AST_OPTIMIZER}-test`;
    registry.setTier(agentSub, RiskTier.HIGH);

    const decision = rbac.checkAccessWithRiskGate(
      {
        token,
        resourceType: ResourceType.AST,
        operation: 'write',
      },
      makeComposition({ withConfabulation: true }),
      { registry }
    );
    expect(decision.allowed).toBe(false);
    expect(decision.riskTier).toBe(RiskTier.HIGH);
    expect(decision.appliedRiskCap).toBe(TIER_COMPOSITION_RISK_CAP[RiskTier.HIGH]);
    expect(decision.reason).toMatch(/exceeds tier high cap/);
  });

  it('blocks all dangerous ops for QUARANTINED agents', async () => {
    const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
    const agentSub = `agent:${AgentRole.AST_OPTIMIZER}:${AgentRole.AST_OPTIMIZER}-test`;
    registry.setTier(agentSub, RiskTier.QUARANTINED);

    const decision = rbac.checkAccessWithRiskGate(
      {
        token,
        resourceType: ResourceType.AST,
        operation: 'write',
      },
      makeComposition({ withConfabulation: false }), // even clean composition
      { registry }
    );
    expect(decision.allowed).toBe(false);
    expect(decision.riskTier).toBe(RiskTier.QUARANTINED);
    expect(decision.reason).toMatch(/quarantined/i);
  });

  it('allows read ops even for QUARANTINED agents on valid compositions', async () => {
    // AST_OPTIMIZER has READ_AST permission by default.
    const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
    const agentSub = `agent:${AgentRole.AST_OPTIMIZER}:${AgentRole.AST_OPTIMIZER}-test`;
    registry.setTier(agentSub, RiskTier.QUARANTINED);

    const decision = rbac.checkAccessWithRiskGate(
      {
        token,
        resourceType: ResourceType.AST,
        operation: 'read',
      },
      makeComposition({ withConfabulation: false }),
      { registry }
    );
    // Read ops bypass the quarantine check (read does not propagate confab).
    expect(decision.allowed).toBe(true);
  });

  it('records validation outcome into registry by default', async () => {
    const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
    const agentSub = `agent:${AgentRole.AST_OPTIMIZER}:${AgentRole.AST_OPTIMIZER}-test`;

    rbac.checkAccessWithRiskGate(
      {
        token,
        resourceType: ResourceType.AST,
        operation: 'read',
      },
      makeComposition({ withConfabulation: true }),
      { registry }
    );
    // Confabulated composition recorded → score should be > 0 now.
    expect(registry.getScore(agentSub)).toBeGreaterThan(0);
  });

  it('dryRun does NOT mutate registry state', async () => {
    const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
    const agentSub = `agent:${AgentRole.AST_OPTIMIZER}:${AgentRole.AST_OPTIMIZER}-test`;

    rbac.checkAccessWithRiskGate(
      {
        token,
        resourceType: ResourceType.AST,
        operation: 'read',
      },
      makeComposition({ withConfabulation: true }),
      { registry, dryRun: true }
    );
    expect(registry.getScore(agentSub)).toBe(0);
  });

  it('returns rbac failure unchanged when permission missing', async () => {
    // SYNTAX_ANALYZER has no WRITE_OUTPUT — should fail at RBAC step,
    // before risk gate runs.
    const token = await issueToken(AgentRole.SYNTAX_ANALYZER, WorkflowStep.PARSE_TOKENS);
    const decision = rbac.checkAccessWithRiskGate(
      {
        token,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
      },
      makeComposition({ withConfabulation: false }),
      { registry }
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/Missing required permission/);
    // No risk fields populated when RBAC fails first.
    expect(decision.riskTier).toBeUndefined();
  });

  it('getAgentRiskTier returns tier for a valid token', async () => {
    const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
    const agentSub = `agent:${AgentRole.AST_OPTIMIZER}:${AgentRole.AST_OPTIMIZER}-test`;
    registry.setTier(agentSub, RiskTier.MEDIUM);

    const tier = rbac.getAgentRiskTier(token, registry);
    expect(tier).toBe(RiskTier.MEDIUM);
  });

  it('getAgentRiskTier returns null for invalid token', () => {
    const tier = rbac.getAgentRiskTier('not-a-jwt', registry);
    expect(tier).toBeNull();
  });
});
