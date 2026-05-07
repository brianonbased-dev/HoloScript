/**
 * Agent Steward Protocol tests.
 *
 * Discipline:
 * - G.GOLD.013: every "validates X" case is paired with a "rejects bad X"
 *   case so the validator is proven to actually fire (not a no-op).
 * - G.GOLD.015: cover the failure categories we expect at runtime —
 *     missing required fields,
 *     unsupported enums,
 *     kind/discriminator coupling (steward-other needs roleLabel,
 *       capability-other needs label, issue-other needs categoryLabel,
 *       rollback-other needs label, state-restore needs targetStateHash +
 *       targetStateHashAlgorithm, inverse-action needs invertActionId,
 *       manual needs instructions),
 *     paired-field rules (issue.hash + hashAlgorithm),
 *     status-driven invariants (status=duplicate needs duplicateOf,
 *       proposal status approved/enacted/rolled-back requires
 *       approvedBy.length >= requiredApprovals, non-cosmetic impact
 *       requires rollback plan),
 *     nested-receipt error propagation,
 *     clone-deep-copy isolation.
 * - F.043 verified: each kind/discriminator coupling test was authored,
 *   then mentally re-checked against the validator code with the
 *   coupling check disabled to confirm it actually fails (not a no-op
 *   assertion). The status-driven invariants (rollback-required,
 *   approval-count) were specifically written to fire even when the
 *   nominal happy-path test already covers the type shape.
 *
 * task_1778186605462_rp05
 */

import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_IMPACT_KINDS,
  ROLLBACK_STEP_KINDS,
  STEWARD_CAPABILITY_KINDS,
  STEWARD_PROPOSAL_STATUSES,
  STEWARD_ROLES,
  WORLD_ISSUE_CATEGORIES,
  WORLD_ISSUE_SEVERITIES,
  WORLD_ISSUE_STATUSES,
  cloneAgentSteward,
  cloneProposalImpact,
  cloneRollbackPlan,
  cloneRollbackStep,
  cloneStewardActionReceipt,
  cloneStewardCapability,
  cloneStewardProposal,
  cloneStewardScope,
  cloneWorldIssue,
  isSupportedProposalImpactKind,
  isSupportedRollbackStepKind,
  isSupportedStewardActionReceiptStatus,
  isSupportedStewardCapabilityKind,
  isSupportedStewardProposalStatus,
  isSupportedStewardRole,
  isSupportedWorldIssueCategory,
  isSupportedWorldIssueSeverity,
  isSupportedWorldIssueStatus,
  validateAgentSteward,
  validateProposalImpact,
  validateRollbackPlan,
  validateRollbackStep,
  validateStewardActionReceipt,
  validateStewardCapability,
  validateStewardProposal,
  validateWorldIssue,
  type AgentSteward,
  type ProposalImpact,
  type RollbackPlan,
  type RollbackStep,
  type StewardActionReceipt,
  type StewardCapability,
  type StewardProposal,
  type WorldIssue,
} from '../board/agent-steward';
import {
  cloneAgentActionReceipt,
  cloneValidationReceipt,
  validateAgentActionReceipt,
  validateValidationReceipt,
  type AgentActionReceipt,
  type ValidationReceipt,
} from '../board/hololand-receipts';

// ── Fixtures ──

function makeCapability(overrides: Partial<StewardCapability> = {}): StewardCapability {
  return {
    kind: 'spawn-encounter',
    requiredSkillIds: ['skill_event_designer_basic'],
    ...overrides,
  };
}

function makeSteward(overrides: Partial<AgentSteward> = {}): AgentSteward {
  return {
    id: 'steward_oasis_event_runner_001',
    actor: '0xabcdef0123456789',
    role: 'event-runner',
    capabilities: [makeCapability()],
    scope: { shardIds: ['shard_oasis_0'], zoneIds: ['zone_market_square'] },
    registeredAt: '2026-05-07T00:00:00Z',
    hash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    provenance: { taskId: 'task_1778186605462_rp05', commitHash: 'pending' },
    ...overrides,
  };
}

function makeIssue(overrides: Partial<WorldIssue> = {}): WorldIssue {
  return {
    id: 'issue_oasis_market_balance_001',
    category: 'balance',
    severity: 'medium',
    status: 'open',
    raisedAt: '2026-05-07T00:01:00Z',
    reporter: 'agent_brittney',
    summary: 'Market currency-supply ratio drifting outside design band.',
    shardId: 'shard_oasis_0',
    zoneId: 'zone_market_square',
    hash: 'b'.repeat(64),
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeRollbackStep(overrides: Partial<RollbackStep> = {}): RollbackStep {
  return {
    id: 'rstep_001',
    kind: 'state-restore',
    targetStateHash: 'c'.repeat(64),
    targetStateHashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeRollbackPlan(overrides: Partial<RollbackPlan> = {}): RollbackPlan {
  return {
    id: 'rollback_market_rebalance_001',
    steps: [makeRollbackStep()],
    summary: 'Restore pre-rebalance market state.',
    ...overrides,
  };
}

function makeImpact(overrides: Partial<ProposalImpact> = {}): ProposalImpact {
  return {
    kind: 'localized',
    shardIds: ['shard_oasis_0'],
    zoneIds: ['zone_market_square'],
    summary: 'Adjust market currency sink rate by 5%.',
    ...overrides,
  };
}

function makeProposal(overrides: Partial<StewardProposal> = {}): StewardProposal {
  return {
    id: 'prop_oasis_market_rebalance_001',
    stewardId: 'steward_oasis_event_runner_001',
    status: 'submitted',
    authoredAt: '2026-05-07T00:02:00Z',
    capabilities: ['economy-tune'],
    impact: [makeImpact()],
    rollback: makeRollbackPlan(),
    addressesIssueIds: ['issue_oasis_market_balance_001'],
    requiredApprovals: 2,
    approvedBy: [],
    hash: 'd'.repeat(64),
    hashAlgorithm: 'sha256',
    summary: 'Rebalance Oasis market currency sink rate.',
    ...overrides,
  };
}

function makeAgentAction(overrides: Partial<AgentActionReceipt> = {}): AgentActionReceipt {
  return {
    id: 'act_economy_tune_001',
    kind: 'agent-other',
    actor: 'steward_oasis_event_runner_001',
    actionLabel: 'economy-tune',
    actedAt: '2026-05-07T00:03:00Z',
    hash: 'e'.repeat(64),
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeValidation(overrides: Partial<ValidationReceipt> = {}): ValidationReceipt {
  return {
    id: 'val_oasis_post_rebalance_001',
    scenarioId: 'oasis.market.rebalance.scenario.v1',
    validatedAt: '2026-05-07T00:04:00Z',
    status: 'passed',
    hash: 'f'.repeat(64),
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeStewardActionReceipt(
  overrides: Partial<StewardActionReceipt> = {},
): StewardActionReceipt {
  return {
    id: 'srcpt_steward_oasis_001_20260507',
    proposalId: 'prop_oasis_market_rebalance_001',
    stewardId: 'steward_oasis_event_runner_001',
    status: 'enacted',
    sealedAt: '2026-05-07T00:05:00Z',
    hash: '0'.repeat(64),
    hashAlgorithm: 'sha256',
    agentActions: [makeAgentAction()],
    validationReceipts: [makeValidation()],
    resolvedIssueIds: ['issue_oasis_market_balance_001'],
    provenance: { taskId: 'task_1778186605462_rp05', commitHash: 'pending' },
    ...overrides,
  };
}

// ── Type guards ──

describe('Agent steward type guards', () => {
  it('accepts every supported steward role', () => {
    for (const role of STEWARD_ROLES) {
      expect(isSupportedStewardRole(role)).toBe(true);
    }
  });

  it('rejects unsupported steward role', () => {
    expect(isSupportedStewardRole('overseer')).toBe(false);
  });

  it('accepts every supported capability kind', () => {
    for (const kind of STEWARD_CAPABILITY_KINDS) {
      expect(isSupportedStewardCapabilityKind(kind)).toBe(true);
    }
  });

  it('rejects unsupported capability kind', () => {
    expect(isSupportedStewardCapabilityKind('hyperdrive')).toBe(false);
  });

  it('accepts every supported world issue severity', () => {
    for (const sev of WORLD_ISSUE_SEVERITIES) {
      expect(isSupportedWorldIssueSeverity(sev)).toBe(true);
    }
  });

  it('rejects unsupported world issue severity', () => {
    expect(isSupportedWorldIssueSeverity('apocalyptic')).toBe(false);
  });

  it('accepts every supported world issue category', () => {
    for (const cat of WORLD_ISSUE_CATEGORIES) {
      expect(isSupportedWorldIssueCategory(cat)).toBe(true);
    }
  });

  it('rejects unsupported world issue category', () => {
    expect(isSupportedWorldIssueCategory('political')).toBe(false);
  });

  it('accepts every supported world issue status', () => {
    for (const s of WORLD_ISSUE_STATUSES) {
      expect(isSupportedWorldIssueStatus(s)).toBe(true);
    }
  });

  it('rejects unsupported world issue status', () => {
    expect(isSupportedWorldIssueStatus('escalated')).toBe(false);
  });

  it('accepts every supported rollback step kind', () => {
    for (const k of ROLLBACK_STEP_KINDS) {
      expect(isSupportedRollbackStepKind(k)).toBe(true);
    }
  });

  it('rejects unsupported rollback step kind', () => {
    expect(isSupportedRollbackStepKind('time-travel')).toBe(false);
  });

  it('accepts every supported proposal status', () => {
    for (const s of STEWARD_PROPOSAL_STATUSES) {
      expect(isSupportedStewardProposalStatus(s)).toBe(true);
    }
  });

  it('rejects unsupported proposal status', () => {
    expect(isSupportedStewardProposalStatus('queued')).toBe(false);
  });

  it('accepts every supported proposal impact kind', () => {
    for (const k of PROPOSAL_IMPACT_KINDS) {
      expect(isSupportedProposalImpactKind(k)).toBe(true);
    }
  });

  it('rejects unsupported proposal impact kind', () => {
    expect(isSupportedProposalImpactKind('cataclysmic')).toBe(false);
  });

  it('accepts every supported steward action receipt status', () => {
    for (const s of ['enacted', 'rolled-back', 'partial', 'failed'] as const) {
      expect(isSupportedStewardActionReceiptStatus(s)).toBe(true);
    }
  });

  it('rejects unsupported steward action receipt status', () => {
    expect(isSupportedStewardActionReceiptStatus('queued')).toBe(false);
  });
});

// ── StewardCapability ──

describe('StewardCapability', () => {
  it('validates a happy-path capability', () => {
    expect(validateStewardCapability(makeCapability())).toEqual([]);
  });

  it('rejects unsupported kind', () => {
    const errors = validateStewardCapability(makeCapability({ kind: 'hyperdrive' as never }));
    expect(errors).toContain('StewardCapability.kind is unsupported: hyperdrive.');
  });

  it('requires label when kind is capability-other', () => {
    const errors = validateStewardCapability(makeCapability({ kind: 'capability-other' }));
    expect(errors).toContain('StewardCapability kind=capability-other requires label.');
  });

  it('accepts capability-other when label is supplied', () => {
    expect(
      validateStewardCapability(
        makeCapability({ kind: 'capability-other', label: 'soul-engineering' }),
      ),
    ).toEqual([]);
  });
});

// ── AgentSteward ──

describe('AgentSteward', () => {
  it('validates a happy-path steward', () => {
    expect(validateAgentSteward(makeSteward())).toEqual([]);
  });

  it('accepts every supported role (with roleLabel for steward-other)', () => {
    for (const role of STEWARD_ROLES) {
      const steward = makeSteward({
        role,
        roleLabel: role === 'steward-other' ? 'cartographer' : undefined,
      });
      expect(validateAgentSteward(steward)).toEqual([]);
    }
  });

  it('rejects missing id, actor, hash, hashAlgorithm, registeredAt', () => {
    const errors = validateAgentSteward({
      id: '',
      actor: '',
      role: 'event-runner',
      capabilities: [makeCapability()],
      scope: {},
      registeredAt: '',
      hash: '',
      hashAlgorithm: '' as never,
    });
    expect(errors).toContain('AgentSteward.id is required.');
    expect(errors.some((e) => e.includes('.actor is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.registeredAt is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.hash is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.hashAlgorithm is required.'))).toBe(true);
  });

  it('rejects unsupported role', () => {
    const errors = validateAgentSteward(makeSteward({ role: 'overseer' as never }));
    expect(errors).toContain('AgentSteward.role is unsupported: overseer.');
  });

  it('requires roleLabel when role is steward-other', () => {
    const errors = validateAgentSteward(
      makeSteward({ role: 'steward-other', roleLabel: undefined }),
    );
    expect(errors.some((e) => e.includes('role=steward-other requires roleLabel.'))).toBe(
      true,
    );
  });

  it('rejects empty capabilities array', () => {
    const errors = validateAgentSteward(makeSteward({ capabilities: [] }));
    expect(errors.some((e) => e.includes('.capabilities must be a non-empty array.'))).toBe(
      true,
    );
  });

  it('propagates capability errors with grep-friendly prefix', () => {
    const errors = validateAgentSteward(
      makeSteward({ capabilities: [makeCapability({ kind: 'capability-other' })] }),
    );
    expect(
      errors.some((e) => e.includes('.capabilities[0]: StewardCapability kind=capability-other requires label.')),
    ).toBe(true);
  });
});

// ── WorldIssue ──

describe('WorldIssue', () => {
  it('validates a happy-path issue', () => {
    expect(validateWorldIssue(makeIssue())).toEqual([]);
  });

  it('accepts every supported severity', () => {
    for (const severity of WORLD_ISSUE_SEVERITIES) {
      expect(validateWorldIssue(makeIssue({ severity }))).toEqual([]);
    }
  });

  it('accepts every supported category (with categoryLabel for issue-other)', () => {
    for (const category of WORLD_ISSUE_CATEGORIES) {
      const issue = makeIssue({
        category,
        categoryLabel: category === 'issue-other' ? 'meta' : undefined,
      });
      expect(validateWorldIssue(issue)).toEqual([]);
    }
  });

  it('rejects unsupported category', () => {
    const errors = validateWorldIssue(makeIssue({ category: 'political' as never }));
    expect(errors).toContain('WorldIssue.category is unsupported: political.');
  });

  it('rejects unsupported severity', () => {
    const errors = validateWorldIssue(makeIssue({ severity: 'apocalyptic' as never }));
    expect(errors).toContain('WorldIssue.severity is unsupported: apocalyptic.');
  });

  it('rejects unsupported status', () => {
    const errors = validateWorldIssue(makeIssue({ status: 'escalated' as never }));
    expect(errors).toContain('WorldIssue.status is unsupported: escalated.');
  });

  it('requires categoryLabel when category is issue-other', () => {
    const errors = validateWorldIssue(
      makeIssue({ category: 'issue-other', categoryLabel: undefined }),
    );
    expect(
      errors.some((e) => e.includes('category=issue-other requires categoryLabel.')),
    ).toBe(true);
  });

  it('requires duplicateOf when status is duplicate', () => {
    const errors = validateWorldIssue(
      makeIssue({ status: 'duplicate', duplicateOf: undefined }),
    );
    expect(
      errors.some((e) => e.includes('status=duplicate requires duplicateOf.')),
    ).toBe(true);
  });

  it('accepts duplicate status when duplicateOf is supplied', () => {
    expect(
      validateWorldIssue(
        makeIssue({ status: 'duplicate', duplicateOf: 'issue_canonical_001' }),
      ),
    ).toEqual([]);
  });

  it('rejects hash without hashAlgorithm', () => {
    const errors = validateWorldIssue(
      makeIssue({ hash: 'x'.repeat(64), hashAlgorithm: undefined }),
    );
    expect(
      errors.some((e) => e.includes('.hashAlgorithm is required when hash is set.')),
    ).toBe(true);
  });

  it('rejects missing reporter, summary, raisedAt, id', () => {
    const errors = validateWorldIssue({
      id: '',
      category: 'balance',
      severity: 'medium',
      status: 'open',
      raisedAt: '',
      reporter: '',
      summary: '',
    });
    expect(errors).toContain('WorldIssue.id is required.');
    expect(errors.some((e) => e.includes('.reporter is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.summary is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.raisedAt is required.'))).toBe(true);
  });
});

// ── RollbackStep ──

describe('RollbackStep', () => {
  it('validates a happy-path state-restore step', () => {
    expect(validateRollbackStep(makeRollbackStep())).toEqual([]);
  });

  it('rejects unsupported kind', () => {
    const errors = validateRollbackStep(
      makeRollbackStep({ kind: 'time-travel' as never }),
    );
    expect(errors).toContain('RollbackStep.kind is unsupported: time-travel.');
  });

  it('requires label when kind is rollback-other', () => {
    const errors = validateRollbackStep(
      makeRollbackStep({
        kind: 'rollback-other',
        label: undefined,
        targetStateHash: undefined,
        targetStateHashAlgorithm: undefined,
      }),
    );
    expect(errors.some((e) => e.includes('kind=rollback-other requires label.'))).toBe(true);
  });

  it('requires targetStateHash when kind is state-restore', () => {
    const errors = validateRollbackStep(
      makeRollbackStep({ kind: 'state-restore', targetStateHash: undefined }),
    );
    expect(
      errors.some((e) => e.includes('kind=state-restore requires targetStateHash.')),
    ).toBe(true);
  });

  it('requires targetStateHashAlgorithm when targetStateHash is set', () => {
    const errors = validateRollbackStep(
      makeRollbackStep({
        kind: 'state-restore',
        targetStateHash: 'x'.repeat(64),
        targetStateHashAlgorithm: undefined,
      }),
    );
    expect(
      errors.some((e) =>
        e.includes('kind=state-restore requires targetStateHashAlgorithm when targetStateHash is set.'),
      ),
    ).toBe(true);
  });

  it('requires invertActionId when kind is inverse-action', () => {
    const errors = validateRollbackStep(
      makeRollbackStep({
        kind: 'inverse-action',
        invertActionId: undefined,
        targetStateHash: undefined,
        targetStateHashAlgorithm: undefined,
      }),
    );
    expect(
      errors.some((e) => e.includes('kind=inverse-action requires invertActionId.')),
    ).toBe(true);
  });

  it('accepts inverse-action when invertActionId is supplied', () => {
    expect(
      validateRollbackStep(
        makeRollbackStep({
          kind: 'inverse-action',
          invertActionId: 'act_economy_tune_001',
          targetStateHash: undefined,
          targetStateHashAlgorithm: undefined,
        }),
      ),
    ).toEqual([]);
  });

  it('requires instructions when kind is manual', () => {
    const errors = validateRollbackStep(
      makeRollbackStep({
        kind: 'manual',
        instructions: undefined,
        targetStateHash: undefined,
        targetStateHashAlgorithm: undefined,
      }),
    );
    expect(errors.some((e) => e.includes('kind=manual requires instructions.'))).toBe(true);
  });

  it('accepts manual when instructions are supplied', () => {
    expect(
      validateRollbackStep(
        makeRollbackStep({
          kind: 'manual',
          instructions: 'Invoke ops runbook RB-OASIS-MARKET-001.',
          targetStateHash: undefined,
          targetStateHashAlgorithm: undefined,
        }),
      ),
    ).toEqual([]);
  });
});

// ── RollbackPlan ──

describe('RollbackPlan', () => {
  it('validates a happy-path plan', () => {
    expect(validateRollbackPlan(makeRollbackPlan())).toEqual([]);
  });

  it('rejects empty steps array', () => {
    const errors = validateRollbackPlan(makeRollbackPlan({ steps: [] }));
    expect(errors.some((e) => e.includes('.steps must be a non-empty array.'))).toBe(true);
  });

  it('propagates step errors with grep-friendly prefix', () => {
    const errors = validateRollbackPlan(
      makeRollbackPlan({
        steps: [makeRollbackStep({ kind: 'time-travel' as never })],
      }),
    );
    expect(
      errors.some((e) => e.includes('.steps[rstep_001]: RollbackStep.kind is unsupported: time-travel.')),
    ).toBe(true);
  });
});

// ── ProposalImpact ──

describe('ProposalImpact', () => {
  it('validates a happy-path impact', () => {
    expect(validateProposalImpact(makeImpact())).toEqual([]);
  });

  it('accepts every supported impact kind', () => {
    for (const kind of PROPOSAL_IMPACT_KINDS) {
      expect(validateProposalImpact(makeImpact({ kind }))).toEqual([]);
    }
  });

  it('rejects unsupported kind', () => {
    const errors = validateProposalImpact(makeImpact({ kind: 'cataclysmic' as never }));
    expect(errors).toContain('ProposalImpact.kind is unsupported: cataclysmic.');
  });
});

// ── StewardProposal ──

describe('StewardProposal', () => {
  it('validates a happy-path proposal', () => {
    expect(validateStewardProposal(makeProposal())).toEqual([]);
  });

  it('rejects unsupported status', () => {
    const errors = validateStewardProposal(makeProposal({ status: 'queued' as never }));
    expect(errors).toContain('StewardProposal.status is unsupported: queued.');
  });

  it('rejects empty capabilities array', () => {
    const errors = validateStewardProposal(makeProposal({ capabilities: [] }));
    expect(
      errors.some((e) => e.includes('.capabilities must be a non-empty array.')),
    ).toBe(true);
  });

  it('rejects unsupported capability entry', () => {
    const errors = validateStewardProposal(
      makeProposal({ capabilities: ['hyperdrive' as never] }),
    );
    expect(
      errors.some((e) => e.includes('.capabilities[0] is unsupported: hyperdrive.')),
    ).toBe(true);
  });

  it('rejects empty impact array', () => {
    const errors = validateStewardProposal(makeProposal({ impact: [] }));
    expect(errors.some((e) => e.includes('.impact must be a non-empty array.'))).toBe(true);
  });

  it('propagates impact errors with grep-friendly prefix', () => {
    const errors = validateStewardProposal(
      makeProposal({ impact: [makeImpact({ kind: 'cataclysmic' as never })] }),
    );
    expect(
      errors.some((e) => e.includes('.impact[0]: ProposalImpact.kind is unsupported: cataclysmic.')),
    ).toBe(true);
  });

  it('requires rollback plan when impact is not exclusively cosmetic', () => {
    const errors = validateStewardProposal(
      makeProposal({ impact: [makeImpact({ kind: 'shard-wide' })], rollback: undefined }),
    );
    expect(
      errors.some((e) =>
        e.includes('requires a rollback plan when impact is not exclusively cosmetic.'),
      ),
    ).toBe(true);
  });

  it('does not require rollback plan when impact is exclusively cosmetic', () => {
    expect(
      validateStewardProposal(
        makeProposal({ impact: [makeImpact({ kind: 'cosmetic' })], rollback: undefined }),
      ),
    ).toEqual([]);
  });

  it('still validates rollback plan when supplied for cosmetic impact', () => {
    const errors = validateStewardProposal(
      makeProposal({
        impact: [makeImpact({ kind: 'cosmetic' })],
        rollback: makeRollbackPlan({ steps: [] }),
      }),
    );
    expect(errors.some((e) => e.includes('.rollback: '))).toBe(true);
  });

  it('rejects negative requiredApprovals', () => {
    const errors = validateStewardProposal(makeProposal({ requiredApprovals: -1 }));
    expect(
      errors.some((e) => e.includes('.requiredApprovals must be a non-negative integer.')),
    ).toBe(true);
  });

  it('rejects non-integer requiredApprovals', () => {
    const errors = validateStewardProposal(makeProposal({ requiredApprovals: 1.5 }));
    expect(
      errors.some((e) => e.includes('.requiredApprovals must be a non-negative integer.')),
    ).toBe(true);
  });

  it('rejects approved status with insufficient approvers', () => {
    const errors = validateStewardProposal(
      makeProposal({ status: 'approved', requiredApprovals: 2, approvedBy: ['alice'] }),
    );
    expect(
      errors.some((e) =>
        e.includes('status=approved requires approvedBy.length (1) >= requiredApprovals (2).'),
      ),
    ).toBe(true);
  });

  it('rejects enacted status with no approvers when requiredApprovals > 0', () => {
    const errors = validateStewardProposal(
      makeProposal({ status: 'enacted', requiredApprovals: 1, approvedBy: [] }),
    );
    expect(
      errors.some((e) =>
        e.includes('status=enacted requires approvedBy.length (0) >= requiredApprovals (1).'),
      ),
    ).toBe(true);
  });

  it('accepts enacted status when approvers >= requiredApprovals', () => {
    expect(
      validateStewardProposal(
        makeProposal({
          status: 'enacted',
          requiredApprovals: 2,
          approvedBy: ['alice', 'bob'],
        }),
      ),
    ).toEqual([]);
  });

  it('accepts enacted status when requiredApprovals is 0 (auto-enact)', () => {
    expect(
      validateStewardProposal(
        makeProposal({ status: 'enacted', requiredApprovals: 0, approvedBy: [] }),
      ),
    ).toEqual([]);
  });

  it('rejects verification command without command text', () => {
    const errors = validateStewardProposal(
      makeProposal({ verificationCommands: [{ command: '' }] }),
    );
    expect(
      errors.some((e) => e.includes('has a verification command without command text.')),
    ).toBe(true);
  });
});

// ── StewardActionReceipt ──

describe('StewardActionReceipt', () => {
  it('validates a happy-path enacted receipt', () => {
    expect(
      validateStewardActionReceipt(
        makeStewardActionReceipt(),
        validateAgentActionReceipt,
        validateValidationReceipt,
      ),
    ).toEqual([]);
  });

  it('rejects unsupported status', () => {
    const errors = validateStewardActionReceipt(
      makeStewardActionReceipt({ status: 'queued' as never }),
      validateAgentActionReceipt,
      validateValidationReceipt,
    );
    expect(errors).toContain('StewardActionReceipt.status is unsupported: queued.');
  });

  it('rejects missing id, proposalId, stewardId, hash, sealedAt', () => {
    const errors = validateStewardActionReceipt(
      {
        id: '',
        proposalId: '',
        stewardId: '',
        status: 'enacted',
        sealedAt: '',
        hash: '',
        hashAlgorithm: '' as never,
      },
      validateAgentActionReceipt,
      validateValidationReceipt,
    );
    expect(errors).toContain('StewardActionReceipt.id is required.');
    expect(errors.some((e) => e.includes('.proposalId is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.stewardId is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.sealedAt is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.hash is required.'))).toBe(true);
    expect(errors.some((e) => e.includes('.hashAlgorithm is required.'))).toBe(true);
  });

  it('propagates nested AgentActionReceipt errors with grep-friendly prefix', () => {
    const badAction = makeAgentAction({ id: '' });
    const errors = validateStewardActionReceipt(
      makeStewardActionReceipt({ agentActions: [badAction] }),
      validateAgentActionReceipt,
      validateValidationReceipt,
    );
    expect(
      errors.some((e) =>
        e.includes('agentActions[<unknown>]: AgentActionReceipt.id is required.'),
      ),
    ).toBe(true);
  });

  it('propagates nested ValidationReceipt errors with grep-friendly prefix', () => {
    const badValidation = makeValidation({ id: '' });
    const errors = validateStewardActionReceipt(
      makeStewardActionReceipt({ validationReceipts: [badValidation] }),
      validateAgentActionReceipt,
      validateValidationReceipt,
    );
    expect(
      errors.some((e) =>
        e.includes('validationReceipts[<unknown>]: ValidationReceipt.id is required.'),
      ),
    ).toBe(true);
  });

  it('rejects verification command without command text', () => {
    const errors = validateStewardActionReceipt(
      makeStewardActionReceipt({ verificationCommands: [{ command: '' }] }),
      validateAgentActionReceipt,
      validateValidationReceipt,
    );
    expect(
      errors.some((e) => e.includes('has a verification command without command text.')),
    ).toBe(true);
  });
});

// ── Cloning ──

describe('Agent steward cloning', () => {
  it('cloneStewardCapability deep-copies arrays and metadata', () => {
    const cap = makeCapability({
      requiredSkillIds: ['skill_a'],
      metadata: { tier: 1 },
    });
    const clone = cloneStewardCapability(cap);
    clone.requiredSkillIds!.push('skill_b');
    (clone.metadata as Record<string, unknown>).tier = 2;
    expect(cap.requiredSkillIds).toEqual(['skill_a']);
    expect(cap.metadata).toEqual({ tier: 1 });
  });

  it('cloneStewardScope deep-copies all id arrays', () => {
    const scope = {
      shardIds: ['s1'],
      zoneIds: ['z1'],
      factionIds: ['f1'],
      questIds: ['q1'],
    };
    const clone = cloneStewardScope(scope);
    clone.shardIds!.push('s2');
    clone.zoneIds!.push('z2');
    clone.factionIds!.push('f2');
    clone.questIds!.push('q2');
    expect(scope.shardIds).toEqual(['s1']);
    expect(scope.zoneIds).toEqual(['z1']);
    expect(scope.factionIds).toEqual(['f1']);
    expect(scope.questIds).toEqual(['q1']);
  });

  it('cloneAgentSteward deep-copies capabilities, scope, provenance, metadata', () => {
    const steward = makeSteward({
      metadata: { handlerVersion: 1 },
    });
    const clone = cloneAgentSteward(steward);
    clone.capabilities[0].requiredSkillIds!.push('skill_extra');
    clone.scope.shardIds!.push('shard_other');
    (clone.metadata as Record<string, unknown>).handlerVersion = 2;
    expect(steward.capabilities[0].requiredSkillIds).toEqual([
      'skill_event_designer_basic',
    ]);
    expect(steward.scope.shardIds).toEqual(['shard_oasis_0']);
    expect(steward.metadata).toEqual({ handlerVersion: 1 });
  });

  it('cloneWorldIssue deep-copies provenance and metadata', () => {
    const issue = makeIssue({
      provenance: { taskId: 'task_x', commitHash: 'abc', parentArtifactIds: ['p1'] },
      metadata: { score: 5 },
    });
    const clone = cloneWorldIssue(issue);
    clone.provenance!.parentArtifactIds!.push('p2');
    (clone.metadata as Record<string, unknown>).score = 6;
    expect(issue.provenance!.parentArtifactIds).toEqual(['p1']);
    expect(issue.metadata).toEqual({ score: 5 });
  });

  it('cloneRollbackStep deep-copies metadata', () => {
    const step = makeRollbackStep({ metadata: { batched: true } });
    const clone = cloneRollbackStep(step);
    (clone.metadata as Record<string, unknown>).batched = false;
    expect(step.metadata).toEqual({ batched: true });
  });

  it('cloneRollbackPlan deep-copies steps and metadata', () => {
    const plan = makeRollbackPlan({ metadata: { tier: 'fast' } });
    const clone = cloneRollbackPlan(plan);
    clone.steps[0].id = 'mutated';
    (clone.metadata as Record<string, unknown>).tier = 'slow';
    expect(plan.steps[0].id).toBe('rstep_001');
    expect(plan.metadata).toEqual({ tier: 'fast' });
  });

  it('cloneProposalImpact deep-copies all id arrays and metadata', () => {
    const impact = makeImpact({
      shardIds: ['s1'],
      zoneIds: ['z1'],
      questIds: ['q1'],
      metadata: { confidence: 0.8 },
    });
    const clone = cloneProposalImpact(impact);
    clone.shardIds!.push('s2');
    clone.zoneIds!.push('z2');
    clone.questIds!.push('q2');
    (clone.metadata as Record<string, unknown>).confidence = 0.5;
    expect(impact.shardIds).toEqual(['s1']);
    expect(impact.zoneIds).toEqual(['z1']);
    expect(impact.questIds).toEqual(['q1']);
    expect(impact.metadata).toEqual({ confidence: 0.8 });
  });

  it('cloneStewardProposal deep-copies all collections', () => {
    const proposal = makeProposal({
      addressesIssueIds: ['issue_1'],
      approvedBy: ['alice'],
      verificationCommands: [{ command: 'pnpm test', artifactIds: ['art_1'] }],
      metadata: { riskScore: 3 },
    });
    const clone = cloneStewardProposal(proposal);
    clone.capabilities.push('mod-action');
    clone.addressesIssueIds!.push('issue_2');
    clone.approvedBy!.push('bob');
    clone.impact[0].shardIds!.push('shard_extra');
    clone.rollback!.steps[0].id = 'mutated';
    clone.verificationCommands![0].artifactIds!.push('art_2');
    (clone.metadata as Record<string, unknown>).riskScore = 9;
    expect(proposal.capabilities).toEqual(['economy-tune']);
    expect(proposal.addressesIssueIds).toEqual(['issue_1']);
    expect(proposal.approvedBy).toEqual(['alice']);
    expect(proposal.impact[0].shardIds).toEqual(['shard_oasis_0']);
    expect(proposal.rollback!.steps[0].id).toBe('rstep_001');
    expect(proposal.verificationCommands![0].artifactIds).toEqual(['art_1']);
    expect(proposal.metadata).toEqual({ riskScore: 3 });
  });

  it('cloneStewardActionReceipt deep-copies nested receipts via supplied cloners', () => {
    const receipt = makeStewardActionReceipt({
      verificationCommands: [{ command: 'pnpm test', artifactIds: ['art_a'] }],
      metadata: { round: 8 },
    });
    const clone = cloneStewardActionReceipt(
      receipt,
      cloneAgentActionReceipt,
      cloneValidationReceipt,
    );
    clone.agentActions![0].id = 'mutated';
    clone.validationReceipts![0].id = 'mutated';
    clone.resolvedIssueIds!.push('issue_extra');
    clone.verificationCommands![0].artifactIds!.push('art_b');
    (clone.metadata as Record<string, unknown>).round = 99;
    expect(receipt.agentActions![0].id).toBe('act_economy_tune_001');
    expect(receipt.validationReceipts![0].id).toBe('val_oasis_post_rebalance_001');
    expect(receipt.resolvedIssueIds).toEqual(['issue_oasis_market_balance_001']);
    expect(receipt.verificationCommands![0].artifactIds).toEqual(['art_a']);
    expect(receipt.metadata).toEqual({ round: 8 });
  });
});
