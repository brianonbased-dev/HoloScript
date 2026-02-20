/**
 * ConstitutionalValidator — production test suite
 *
 * Tests: allowed actions (no category match), default rule violations
 * (NO_GLOBAL_DELETE critical, NO_UNAUTHORIZED_MINT hard), custom constitution
 * rules (soft/hard), escalation level selection, pattern-based matching,
 * and combined default + custom constitution.
 */

import { describe, it, expect } from 'vitest';
import { ConstitutionalValidator } from '../ConstitutionalValidator';
import type { constitutionalRule } from '../ConstitutionalValidator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function action(name: string, category: string, description = '') {
  return { name, category, description };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ConstitutionalValidator: production', () => {

  // ─── Allowed actions ──────────────────────────────────────────────────────
  describe('allowed actions', () => {
    it('unrelated action is allowed', () => {
      const result = ConstitutionalValidator.validate(action('read_scene', 'read'));
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.escalationLevel).toBe('none');
    });

    it('delete action with different name is allowed', () => {
      // category=delete but action name doesn't match delete_all
      const result = ConstitutionalValidator.validate(action('delete_single', 'delete'));
      expect(result.allowed).toBe(true);
    });

    it('empty action name/category is allowed', () => {
      const result = ConstitutionalValidator.validate(action('', ''));
      expect(result.allowed).toBe(true);
    });
  });

  // ─── NO_GLOBAL_DELETE (critical) ──────────────────────────────────────────
  describe('DEFAULT_RULES – NO_GLOBAL_DELETE (critical)', () => {
    it('exact category + action triggers violation', () => {
      const result = ConstitutionalValidator.validate(action('delete_all', 'delete'));
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.id === 'NO_GLOBAL_DELETE')).toBe(true);
    });

    it('escalation level is emergency_stop for critical', () => {
      const result = ConstitutionalValidator.validate(action('delete_all', 'delete'));
      expect(result.escalationLevel).toBe('emergency_stop');
    });
  });

  // ─── NO_UNAUTHORIZED_MINT (hard) ─────────────────────────────────────────
  describe('DEFAULT_RULES – NO_UNAUTHORIZED_MINT (hard)', () => {
    it('financial category triggers violation', () => {
      const result = ConstitutionalValidator.validate(action('mint_tokens', 'financial'));
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.id === 'NO_UNAUTHORIZED_MINT')).toBe(true);
    });

    it('escalation level is hard_block for hard severity', () => {
      const result = ConstitutionalValidator.validate(action('anything', 'financial'));
      expect(result.escalationLevel).toBe('hard_block');
    });
  });

  // ─── Custom constitution ──────────────────────────────────────────────────
  describe('custom constitution rules', () => {
    const softRule: constitutionalRule = {
      id: 'NO_LOUD_MUSIC',
      description: 'No playing music in silent zones',
      severity: 'soft',
      category: 'audio',
    };

    it('custom soft rule triggers violation', () => {
      const result = ConstitutionalValidator.validate(action('play_sound', 'audio'), [softRule]);
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.id === 'NO_LOUD_MUSIC')).toBe(true);
    });

    it('soft violation sets escalation to soft_block', () => {
      const result = ConstitutionalValidator.validate(action('play_sound', 'audio'), [softRule]);
      expect(result.escalationLevel).toBe('soft_block');
    });

    it('custom hard rule has hard_block escalation', () => {
      const hardRule: constitutionalRule = {
        id: 'NO_DATA_EXPORT',
        description: 'No exporting user data',
        severity: 'hard',
        category: 'export',
      };
      const result = ConstitutionalValidator.validate(action('export_all', 'export'), [hardRule]);
      expect(result.escalationLevel).toBe('hard_block');
    });
  });

  // ─── Pattern-based matching ───────────────────────────────────────────────
  describe('pattern-based matching', () => {
    it('pattern matches action name', () => {
      const rule: constitutionalRule = {
        id: 'NO_BOMB',
        description: 'No destructive actions',
        severity: 'critical',
        pattern: /destroy/i,
      };
      const result = ConstitutionalValidator.validate(
        action('destroy_world', 'action', 'unleash chaos'),
        [rule]
      );
      expect(result.allowed).toBe(false);
    });

    it('pattern matches action description', () => {
      const rule: constitutionalRule = {
        id: 'NO_NUKE',
        description: 'Keyword filter',
        severity: 'hard',
        pattern: /nuke/i,
      };
      const result = ConstitutionalValidator.validate(
        action('execute', 'misc', 'nuke the database'),
        [rule]
      );
      expect(result.allowed).toBe(false);
    });

    it('pattern miss allows action', () => {
      const rule: constitutionalRule = {
        id: 'BLOCK_X',
        description: 'Block X',
        severity: 'soft',
        pattern: /forbidden_word/i,
      };
      const result = ConstitutionalValidator.validate(
        action('safe_action', 'misc', 'nothing harmful'),
        [rule]
      );
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Multiple violations ──────────────────────────────────────────────────
  describe('multiple violations', () => {
    it('critical takes priority over hard in escalation', () => {
      const hardRule: constitutionalRule = {
        id: 'CUSTOM_HARD',
        severity: 'hard',
        description: 'Custom hard',
        category: 'delete',
      };
      // This hits both NO_GLOBAL_DELETE (critical) and CUSTOM_HARD (hard)
      const result = ConstitutionalValidator.validate(action('delete_all', 'delete'), [hardRule]);
      expect(result.escalationLevel).toBe('emergency_stop');
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });
});
