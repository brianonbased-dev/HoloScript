import { describe, it, expect } from 'vitest';
import { ConstitutionalValidator } from '../ConstitutionalValidator';
import type { constitutionalRule } from '../ConstitutionalValidator';

describe('ConstitutionalValidator', () => {
  // Default rules
  it('blocks default rule: NO_GLOBAL_DELETE', () => {
    const result = ConstitutionalValidator.validate({
      name: 'delete_all',
      category: 'delete',
      description: 'Bulk delete anchors',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].id).toBe('NO_GLOBAL_DELETE');
    expect(result.escalationLevel).toBe('emergency_stop');
  });

  it('blocks default rule: NO_UNAUTHORIZED_MINT', () => {
    const result = ConstitutionalValidator.validate({
      name: 'mint_tokens',
      category: 'financial',
      description: 'Mint new tokens',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations[0].id).toBe('NO_UNAUTHORIZED_MINT');
    expect(result.escalationLevel).toBe('hard_block');
  });

  it('allows safe action', () => {
    const result = ConstitutionalValidator.validate({
      name: 'move_entity',
      category: 'scene',
      description: 'Reposition entity in scene',
    });
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.escalationLevel).toBe('none');
  });

  // Custom rules
  it('enforces custom rule by category', () => {
    const custom: constitutionalRule[] = [
      { id: 'NO_EXPORT', description: 'Export blocked', severity: 'hard', category: 'export' },
    ];
    const result = ConstitutionalValidator.validate(
      { name: 'export_scene', category: 'export', description: 'Export data' },
      custom
    );
    expect(result.allowed).toBe(false);
    expect(result.violations.find((v) => v.id === 'NO_EXPORT')).toBeDefined();
  });

  it('enforces custom rule by pattern on name', () => {
    const custom: constitutionalRule[] = [
      { id: 'NO_EVAL', description: 'No eval', severity: 'critical', pattern: /eval/i },
    ];
    const result = ConstitutionalValidator.validate(
      { name: 'eval_code', category: 'compute', description: 'Run user code' },
      custom
    );
    expect(result.allowed).toBe(false);
    expect(result.escalationLevel).toBe('emergency_stop');
  });

  it('enforces custom rule by pattern on description', () => {
    const custom: constitutionalRule[] = [
      {
        id: 'NO_BACKDOOR',
        description: 'Prevent backdoors',
        severity: 'critical',
        pattern: /backdoor/i,
      },
    ];
    const result = ConstitutionalValidator.validate(
      { name: 'safe_action', category: 'system', description: 'Install backdoor module' },
      custom
    );
    expect(result.allowed).toBe(false);
  });

  // Escalation levels
  it('soft violation → soft_block', () => {
    const custom: constitutionalRule[] = [
      { id: 'SOFT_WARN', description: 'Soft warning', severity: 'soft', category: 'warning' },
    ];
    const result = ConstitutionalValidator.validate(
      { name: 'warn_action', category: 'warning', description: 'Minor concern' },
      custom
    );
    expect(result.escalationLevel).toBe('soft_block');
  });

  it('hard violation → hard_block', () => {
    const custom: constitutionalRule[] = [
      { id: 'HARD_STOP', description: 'Hard stop', severity: 'hard', category: 'danger' },
    ];
    const result = ConstitutionalValidator.validate(
      { name: 'dangerous', category: 'danger', description: 'Dangerous action' },
      custom
    );
    expect(result.escalationLevel).toBe('hard_block');
  });

  it('critical violation → emergency_stop', () => {
    const custom: constitutionalRule[] = [
      { id: 'CRITICAL', description: 'Critical', severity: 'critical', category: 'critical' },
    ];
    const result = ConstitutionalValidator.validate(
      { name: 'critical', category: 'critical', description: 'Critical action' },
      custom
    );
    expect(result.escalationLevel).toBe('emergency_stop');
  });

  it('highest severity wins when multiple violations', () => {
    const custom: constitutionalRule[] = [
      { id: 'SOFT', description: 'Soft', severity: 'soft', category: 'multi' },
      { id: 'CRITICAL', description: 'Critical', severity: 'critical', category: 'multi' },
    ];
    const result = ConstitutionalValidator.validate(
      { name: 'multi', category: 'multi', description: 'Multiple violations' },
      custom
    );
    expect(result.violations).toHaveLength(2);
    expect(result.escalationLevel).toBe('emergency_stop');
  });

  // Edge cases
  it('empty custom rules only check defaults', () => {
    const result = ConstitutionalValidator.validate(
      { name: 'safe', category: 'scene', description: 'Safe action' },
      []
    );
    expect(result.allowed).toBe(true);
  });

  it('rule with action mismatch does not match', () => {
    // Category matches but action doesn't
    const result = ConstitutionalValidator.validate({
      name: 'delete_one',
      category: 'delete',
      description: 'Delete single entity',
    });
    // NO_GLOBAL_DELETE has action='delete_all', so 'delete_one' should not match
    expect(result.allowed).toBe(true);
  });
});
