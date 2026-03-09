import { describe, it, expect } from 'vitest';
import {
  compileNormBlock,
  compileNormCreation,
  compileNormRepresentation,
  compileNormSpreading,
  compileNormEvaluation,
  compileNormCompliance,
  compileMetanormBlock,
  compileMetanormRules,
  compileMetanormEscalation,
  validateCompiledNorm,
  validateCompiledMetanorm,
  generateNormEnforcementCode,
  generateMetanormGovernanceCode,
} from '../NormLifecycleCompilerMixin';
import type {
  HoloNormBlock,
  HoloNormCreation,
  HoloNormRepresentation,
  HoloNormSpreading,
  HoloNormEvaluation,
  HoloNormCompliance,
  HoloMetanorm,
  HoloMetanormRules,
  HoloMetanormEscalation,
} from '../../parser/HoloCompositionTypes';

// Helper to build a minimal norm block
function makeNormBlock(overrides: Partial<HoloNormBlock> = {}): HoloNormBlock {
  return {
    type: 'NormBlock',
    name: 'TestNorm',
    traits: [],
    properties: {},
    ...overrides,
  } as HoloNormBlock;
}

function makePhase<T>(type: string, props: Record<string, unknown> = {}): T {
  return { type, properties: props } as T;
}

// ─── compileNormCreation ─────────────────────────────────────────────────────

describe('compileNormCreation', () => {
  it('extracts author and rationale', () => {
    const phase = makePhase<HoloNormCreation>('NormCreation', {
      author: 'AgentSmith',
      rationale: 'Safety first',
    });
    const result = compileNormCreation(phase);
    expect(result.author).toBe('AgentSmith');
    expect(result.rationale).toBe('Safety first');
  });

  it('extracts initial_status and created_at', () => {
    const phase = makePhase<HoloNormCreation>('NormCreation', {
      initial_status: 'proposed',
      created_at: 1700000000,
    });
    const result = compileNormCreation(phase);
    expect(result.initialStatus).toBe('proposed');
    expect(result.createdAt).toBe(1700000000);
  });

  it('preserves all properties in the properties bag', () => {
    const phase = makePhase<HoloNormCreation>('NormCreation', { custom: 'val' });
    const result = compileNormCreation(phase);
    expect(result.properties.custom).toBe('val');
  });
});

// ─── compileNormRepresentation ───────────────────────────────────────────────

describe('compileNormRepresentation', () => {
  it('extracts condition and scope', () => {
    const phase = makePhase<HoloNormRepresentation>('NormRepresentation', {
      condition: 'agent.level >= 5',
      scope: 'all_agents',
    });
    const result = compileNormRepresentation(phase);
    expect(result.condition).toBe('agent.level >= 5');
    expect(result.scope).toBe('all_agents');
  });

  it('handles exceptions array', () => {
    const phase = makePhase<HoloNormRepresentation>('NormRepresentation', {
      exceptions: ['admin', 'moderator'],
    });
    const result = compileNormRepresentation(phase);
    expect(result.exceptions).toEqual(['admin', 'moderator']);
  });

  it('returns undefined exceptions when not an array', () => {
    const phase = makePhase<HoloNormRepresentation>('NormRepresentation', {
      exceptions: 'not_an_array',
    });
    const result = compileNormRepresentation(phase);
    expect(result.exceptions).toBeUndefined();
  });

  it('extracts temporal bounds', () => {
    const phase = makePhase<HoloNormRepresentation>('NormRepresentation', {
      valid_from: 100,
      valid_until: 200,
    });
    const result = compileNormRepresentation(phase);
    expect(result.validFrom).toBe(100);
    expect(result.validUntil).toBe(200);
  });
});

// ─── compileNormSpreading ────────────────────────────────────────────────────

describe('compileNormSpreading', () => {
  it('extracts mechanism and visibility', () => {
    const phase = makePhase<HoloNormSpreading>('NormSpreading', {
      mechanism: 'broadcast',
      visibility: 'public',
    });
    const result = compileNormSpreading(phase);
    expect(result.mechanism).toBe('broadcast');
    expect(result.visibility).toBe('public');
  });

  it('extracts adoption_incentive and channels', () => {
    const phase = makePhase<HoloNormSpreading>('NormSpreading', {
      adoption_incentive: 0.8,
      channels: ['chat', 'broadcast'],
    });
    const result = compileNormSpreading(phase);
    expect(result.adoptionIncentive).toBe(0.8);
    expect(result.channels).toEqual(['chat', 'broadcast']);
  });
});

// ─── compileNormEvaluation ───────────────────────────────────────────────────

describe('compileNormEvaluation', () => {
  it('extracts voting config', () => {
    const phase = makePhase<HoloNormEvaluation>('NormEvaluation', {
      voting: 'supermajority',
      quorum: 0.6,
      approval_threshold: 0.67,
    });
    const result = compileNormEvaluation(phase);
    expect(result.voting).toBe('supermajority');
    expect(result.quorum).toBe(0.6);
    expect(result.approvalThreshold).toBe(0.67);
  });

  it('extracts review_period and auto_adopt', () => {
    const phase = makePhase<HoloNormEvaluation>('NormEvaluation', {
      review_period: 86400,
      auto_adopt: true,
      max_rounds: 3,
    });
    const result = compileNormEvaluation(phase);
    expect(result.reviewPeriod).toBe(86400);
    expect(result.autoAdopt).toBe(true);
    expect(result.maxRounds).toBe(3);
  });
});

// ─── compileNormCompliance ───────────────────────────────────────────────────

describe('compileNormCompliance', () => {
  it('extracts monitoring and violation threshold', () => {
    const phase = makePhase<HoloNormCompliance>('NormCompliance', {
      monitoring: 'continuous',
      violation_threshold: 3,
    });
    const result = compileNormCompliance(phase);
    expect(result.monitoring).toBe('continuous');
    expect(result.violationThreshold).toBe(3);
  });

  it('extracts sanctions array', () => {
    const phase = makePhase<HoloNormCompliance>('NormCompliance', {
      sanctions: ['warn', 'restrict', 'suspend'],
      appeal_allowed: true,
      grace_period: 3600,
      sanction_cooldown: 600,
    });
    const result = compileNormCompliance(phase);
    expect(result.sanctions).toEqual(['warn', 'restrict', 'suspend']);
    expect(result.appealAllowed).toBe(true);
    expect(result.gracePeriod).toBe(3600);
    expect(result.sanctionCooldown).toBe(600);
  });
});

// ─── compileNormBlock ────────────────────────────────────────────────────────

describe('compileNormBlock', () => {
  it('compiles a full norm with all CRSEC phases', () => {
    const block = makeNormBlock({
      name: 'NoGriefing',
      traits: ['@enforceable'],
      properties: {
        description: 'No griefing allowed',
        category: 'safety',
        priority: 1,
        status: 'adopted',
      },
      creation: makePhase<HoloNormCreation>('NormCreation', { author: 'Admin' }),
      representation: makePhase<HoloNormRepresentation>('NormRepresentation', {
        condition: 'agent.griefCount === 0',
      }),
      spreading: makePhase<HoloNormSpreading>('NormSpreading', { mechanism: 'broadcast' }),
      evaluation: makePhase<HoloNormEvaluation>('NormEvaluation', { voting: 'majority' }),
      compliance: makePhase<HoloNormCompliance>('NormCompliance', {
        monitoring: 'continuous',
        sanctions: ['warn', 'suspend'],
      }),
    });

    const result = compileNormBlock(block);
    expect(result.name).toBe('NoGriefing');
    expect(result.traits).toEqual(['@enforceable']);
    expect(result.description).toBe('No griefing allowed');
    expect(result.category).toBe('safety');
    expect(result.priority).toBe(1);
    expect(result.status).toBe('adopted');
    expect(result.creation?.author).toBe('Admin');
    expect(result.representation?.condition).toBe('agent.griefCount === 0');
    expect(result.spreading?.mechanism).toBe('broadcast');
    expect(result.evaluation?.voting).toBe('majority');
    expect(result.compliance?.monitoring).toBe('continuous');
    expect(result.hasEventHandlers).toBe(false);
  });

  it('defaults status to draft when not specified', () => {
    const block = makeNormBlock({ properties: {} });
    const result = compileNormBlock(block);
    expect(result.status).toBe('draft');
  });

  it('detects event handlers', () => {
    const block = makeNormBlock({
      eventHandlers: [{ event: 'on_violation', handler: 'notifyAdmin' }],
    } as any);
    const result = compileNormBlock(block);
    expect(result.hasEventHandlers).toBe(true);
  });

  it('handles missing lifecycle phases gracefully', () => {
    const block = makeNormBlock();
    const result = compileNormBlock(block);
    expect(result.creation).toBeUndefined();
    expect(result.representation).toBeUndefined();
    expect(result.spreading).toBeUndefined();
    expect(result.evaluation).toBeUndefined();
    expect(result.compliance).toBeUndefined();
  });
});

// ─── compileMetanormBlock ────────────────────────────────────────────────────

describe('compileMetanormBlock', () => {
  it('compiles a full metanorm with rules and escalation', () => {
    const block: HoloMetanorm = {
      type: 'Metanorm',
      name: 'GovernancePolicy',
      traits: ['@governance'],
      properties: {
        description: 'Amendment process',
        applies_to: 'all_norms',
      },
      rules: makePhase<HoloMetanormRules>('MetanormRules', {
        amendment_quorum: 0.5,
        amendment_voting: 'supermajority',
        cooldown_period: 86400,
        max_amendments_per_cycle: 3,
        retroactive_allowed: false,
      }),
      escalation: makePhase<HoloMetanormEscalation>('MetanormEscalation', {
        authority: 'council',
        override_threshold: 0.9,
        appeal_levels: 2,
      }),
    } as any;

    const result = compileMetanormBlock(block);
    expect(result.name).toBe('GovernancePolicy');
    expect(result.description).toBe('Amendment process');
    expect(result.appliesTo).toBe('all_norms');
    expect(result.rules?.amendmentQuorum).toBe(0.5);
    expect(result.rules?.amendmentVoting).toBe('supermajority');
    expect(result.rules?.cooldownPeriod).toBe(86400);
    expect(result.rules?.maxAmendmentsPerCycle).toBe(3);
    expect(result.rules?.retroactiveAllowed).toBe(false);
    expect(result.escalation?.authority).toBe('council');
    expect(result.escalation?.overrideThreshold).toBe(0.9);
    expect(result.escalation?.appealLevels).toBe(2);
  });

  it('handles missing rules and escalation', () => {
    const block: HoloMetanorm = {
      type: 'Metanorm',
      name: 'Simple',
      traits: [],
      properties: {},
    } as any;
    const result = compileMetanormBlock(block);
    expect(result.rules).toBeUndefined();
    expect(result.escalation).toBeUndefined();
  });
});

// ─── validateCompiledNorm ────────────────────────────────────────────────────

describe('validateCompiledNorm', () => {
  it('returns empty issues for a valid norm', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'ValidNorm',
        properties: {},
        evaluation: makePhase<HoloNormEvaluation>('NormEvaluation', { quorum: 0.5 }),
      })
    );
    const issues = validateCompiledNorm(norm);
    expect(issues).toHaveLength(0);
  });

  it('detects unnamed norm', () => {
    const norm = compileNormBlock(makeNormBlock({ name: 'unnamed' }));
    const issues = validateCompiledNorm(norm);
    expect(issues).toContain('Norm must have a name');
  });

  it('detects quorum out of range', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'Bad',
        evaluation: makePhase<HoloNormEvaluation>('NormEvaluation', { quorum: 1.5 }),
      })
    );
    const issues = validateCompiledNorm(norm);
    expect(issues.some((i) => i.includes('quorum must be between 0 and 1'))).toBe(true);
  });

  it('detects approval_threshold out of range', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'Bad',
        evaluation: makePhase<HoloNormEvaluation>('NormEvaluation', { approval_threshold: -0.1 }),
      })
    );
    const issues = validateCompiledNorm(norm);
    expect(issues.some((i) => i.includes('approval_threshold must be between 0 and 1'))).toBe(
      true
    );
  });

  it('detects out-of-order sanctions', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'Bad',
        compliance: makePhase<HoloNormCompliance>('NormCompliance', {
          sanctions: ['ban', 'warn'],
        }),
      })
    );
    const issues = validateCompiledNorm(norm);
    expect(issues.some((i) => i.includes('sanctions should be ordered by severity'))).toBe(true);
  });

  it('detects violation_threshold below 1', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'Bad',
        compliance: makePhase<HoloNormCompliance>('NormCompliance', { violation_threshold: 0 }),
      })
    );
    const issues = validateCompiledNorm(norm);
    expect(issues.some((i) => i.includes('violation_threshold must be at least 1'))).toBe(true);
  });
});

// ─── validateCompiledMetanorm ────────────────────────────────────────────────

describe('validateCompiledMetanorm', () => {
  it('detects unnamed metanorm', () => {
    const mn = compileMetanormBlock({
      type: 'Metanorm',
      name: '',
      traits: [],
      properties: {},
    } as any);
    const issues = validateCompiledMetanorm(mn);
    expect(issues).toContain('Metanorm must have a name');
  });

  it('detects amendment_quorum out of range', () => {
    const mn = compileMetanormBlock({
      type: 'Metanorm',
      name: 'Bad',
      traits: [],
      properties: {},
      rules: makePhase<HoloMetanormRules>('MetanormRules', { amendment_quorum: 2.0 }),
    } as any);
    const issues = validateCompiledMetanorm(mn);
    expect(issues.some((i) => i.includes('amendment_quorum must be between 0 and 1'))).toBe(true);
  });

  it('detects max_amendments_per_cycle below 1', () => {
    const mn = compileMetanormBlock({
      type: 'Metanorm',
      name: 'Bad',
      traits: [],
      properties: {},
      rules: makePhase<HoloMetanormRules>('MetanormRules', { max_amendments_per_cycle: 0 }),
    } as any);
    const issues = validateCompiledMetanorm(mn);
    expect(issues.some((i) => i.includes('max_amendments_per_cycle must be at least 1'))).toBe(
      true
    );
  });

  it('detects override_threshold out of range', () => {
    const mn = compileMetanormBlock({
      type: 'Metanorm',
      name: 'Bad',
      traits: [],
      properties: {},
      escalation: makePhase<HoloMetanormEscalation>('MetanormEscalation', {
        override_threshold: 1.5,
      }),
    } as any);
    const issues = validateCompiledMetanorm(mn);
    expect(issues.some((i) => i.includes('override_threshold must be between 0 and 1'))).toBe(
      true
    );
  });
});

// ─── generateNormEnforcementCode ─────────────────────────────────────────────

describe('generateNormEnforcementCode', () => {
  it('generates code with norm name and status', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'NoSpam',
        properties: { description: 'Prevent spamming', category: 'conduct', priority: 2 },
      })
    );
    const code = generateNormEnforcementCode(norm);
    expect(code).toContain('// Norm: NoSpam');
    expect(code).toContain('// Prevent spamming');
    expect(code).toContain('name: "NoSpam"');
    expect(code).toContain('category: "conduct"');
    expect(code).toContain('priority: 2');
    expect(code).toContain('status: "draft"');
  });

  it('includes representation condition check', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'X',
        representation: makePhase<HoloNormRepresentation>('NormRepresentation', {
          condition: 'agent.spamCount === 0',
          scope: 'global',
        }),
      })
    );
    const code = generateNormEnforcementCode(norm);
    expect(code).toContain('check: (agent, context) => agent.spamCount === 0');
    expect(code).toContain('scope: "global"');
  });

  it('includes evaluation voting config', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'V',
        evaluation: makePhase<HoloNormEvaluation>('NormEvaluation', {
          voting: 'consensus',
          quorum: 0.8,
          approval_threshold: 0.95,
        }),
      })
    );
    const code = generateNormEnforcementCode(norm);
    expect(code).toContain('voting: "consensus"');
    expect(code).toContain('quorum: 0.8');
    expect(code).toContain('approvalThreshold: 0.95');
  });

  it('includes compliance sanctions', () => {
    const norm = compileNormBlock(
      makeNormBlock({
        name: 'C',
        compliance: makePhase<HoloNormCompliance>('NormCompliance', {
          monitoring: 'periodic',
          violation_threshold: 5,
          severity: 'major',
          sanctions: ['warn', 'penalize'],
          appeal_allowed: true,
          grace_period: 1800,
        }),
      })
    );
    const code = generateNormEnforcementCode(norm);
    expect(code).toContain('monitoring: "periodic"');
    expect(code).toContain('violationThreshold: 5');
    expect(code).toContain('severity: "major"');
    expect(code).toContain('"warn", "penalize"');
    expect(code).toContain('appealAllowed: true');
    expect(code).toContain('gracePeriod: 1800');
  });

  it('sanitizes identifier names', () => {
    const norm = compileNormBlock(makeNormBlock({ name: 'no-grief zone!' }));
    const code = generateNormEnforcementCode(norm);
    expect(code).toContain('const norm_no_grief_zone_');
  });
});

// ─── generateMetanormGovernanceCode ──────────────────────────────────────────

describe('generateMetanormGovernanceCode', () => {
  it('generates governance code with rules and escalation', () => {
    const mn = compileMetanormBlock({
      type: 'Metanorm',
      name: 'Council',
      traits: [],
      properties: { description: 'Council governance', applies_to: 'safety_norms' },
      rules: makePhase<HoloMetanormRules>('MetanormRules', {
        amendment_quorum: 0.6,
        amendment_voting: 'supermajority',
        cooldown_period: 7200,
        max_amendments_per_cycle: 2,
        retroactive_allowed: false,
      }),
      escalation: makePhase<HoloMetanormEscalation>('MetanormEscalation', {
        authority: 'elder_council',
        override_threshold: 0.95,
        appeal_levels: 3,
      }),
    } as any);

    const code = generateMetanormGovernanceCode(mn);
    expect(code).toContain('// Metanorm: Council');
    expect(code).toContain('// Council governance');
    expect(code).toContain('appliesTo: "safety_norms"');
    expect(code).toContain('amendmentQuorum: 0.6');
    expect(code).toContain('amendmentVoting: "supermajority"');
    expect(code).toContain('cooldownPeriod: 7200');
    expect(code).toContain('maxAmendmentsPerCycle: 2');
    expect(code).toContain('retroactiveAllowed: false');
    expect(code).toContain('authority: "elder_council"');
    expect(code).toContain('overrideThreshold: 0.95');
    expect(code).toContain('appealLevels: 3');
  });
});
