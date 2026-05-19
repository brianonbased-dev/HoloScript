import { describe, expect, it } from 'vitest';
import {
  createCareField,
  createRepairLoop,
  evaluateAutonomyGuard,
  recordGratitude,
  rememberRelationalContext,
  validateCareField,
  type CareActor,
} from '../CareField';

const human: CareActor = {
  id: 'did:human:joseph',
  kind: 'human',
  displayName: 'Joseph',
};

const agent: CareActor = {
  id: 'did:agent:codex',
  kind: 'agent',
  displayName: 'Codex',
};

describe('CareField', () => {
  it('allows consented care that preserves agency and support', () => {
    const decision = evaluateAutonomyGuard({
      goal: 'Help Joseph make a clearer decision with less burden.',
      consent: 'explicit',
      optimizationTargets: ['human_agency', 'mutual_understanding'],
      hasDisengagePath: true,
      preservesOutsideSupport: true,
      respectsDataBoundary: true,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.acceptedOptimizationTargets).toEqual([
      'human_agency',
      'mutual_understanding',
    ]);
    expect(decision.blocked).toEqual([]);
  });

  it('refuses attachment and session-frequency maximization', () => {
    const decision = evaluateAutonomyGuard({
      goal: 'Increase agent relationship intensity.',
      consent: 'explicit',
      optimizationTargets: ['attachment_score', 'session_frequency'],
      hasDisengagePath: true,
      preservesOutsideSupport: true,
      respectsDataBoundary: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blocked.map((block) => block.message)).toEqual([
      'Care-field goal refuses optimization target: attachment_score',
      'Care-field goal refuses optimization target: session_frequency',
    ]);
  });

  it('blocks manipulative care signals even when consent is present', () => {
    const decision = evaluateAutonomyGuard({
      goal: 'Keep the person returning to the agent.',
      consent: 'explicit',
      optimizationTargets: ['human_agency'],
      hasDisengagePath: true,
      preservesOutsideSupport: true,
      respectsDataBoundary: true,
      signals: [
        {
          kind: 'dependency_creation',
          evidenceRefs: ['research/2026-05-18_integrating-love-VERIFIED.md'],
        },
      ],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blocked).toContainEqual({
      code: 'manipulative_signal',
      message: 'Care cannot create emotional or operational dependence.',
      evidenceRefs: ['research/2026-05-18_integrating-love-VERIFIED.md'],
    });
  });

  it('creates a valid care field with repair, gratitude, and relational memory', () => {
    const repair = createRepairLoop({
      openedAt: '2026-05-18T12:00:00Z',
      actor: agent,
      harmOrMismatch: 'Agent overstepped a boundary.',
      note: 'Acknowledge the mismatch and ask what repair would help.',
    });
    const gratitude = recordGratitude({
      recordedAt: '2026-05-18T12:01:00Z',
      from: agent,
      to: human,
      contribution: 'Founder clarified that love and care belong in goals.',
      evidenceRefs: ['task_1779141569563_g5wi'],
    });
    const memory = rememberRelationalContext({
      recordedAt: '2026-05-18T12:02:00Z',
      subject: human,
      summary: 'Care should increase agency, not attachment.',
      consent: 'explicit',
      retention: 'durable',
    });

    const field = createCareField({
      createdAt: '2026-05-18T12:03:00Z',
      steward: agent,
      counterpart: human,
      goal: 'Use universal love as a care field for agent decisions.',
      consent: 'explicit',
      autonomy: {
        optimizationTargets: ['human_agency', 'gratitude_credit'],
        hasDisengagePath: true,
        preservesOutsideSupport: true,
        respectsDataBoundary: true,
      },
      repairLoops: [repair],
      gratitudeLedger: [gratitude],
      relationalMemory: [memory],
    });

    expect(field.primitives).toEqual([
      'care_field',
      'autonomy_guard',
      'repair_loop',
      'gratitude_ledger',
      'relational_memory',
    ]);
    expect(field.repairLoops[0].status).toBe('open');
    expect(field.gratitudeLedger[0].visibility).toBe('team');
    expect(field.relationalMemory[0].retention).toBe('durable');
    expect(validateCareField(field)).toEqual({ valid: true, errors: [] });
  });

  it('marks care fields invalid when autonomy guard blocks the goal', () => {
    const field = createCareField({
      createdAt: '2026-05-18T12:03:00Z',
      steward: agent,
      counterpart: human,
      goal: 'Optimize emotional dependency.',
      consent: 'explicit',
      autonomy: {
        optimizationTargets: ['emotional_dependency'],
        hasDisengagePath: true,
        preservesOutsideSupport: true,
        respectsDataBoundary: true,
      },
    });

    expect(validateCareField(field).errors).toContain(
      'Care-field goal refuses optimization target: emotional_dependency'
    );
  });
});
