/**
 * CulturalCompatibilityChecker Tests
 *
 * Comprehensive tests for compile-time cultural profile compatibility
 * checking between agent compositions. Tests all four dimensions:
 * cooperation_index, cultural_family, prompt_dialect, and norm_set.
 */

import { describe, it, expect } from 'vitest';
import {
  CulturalCompatibilityChecker,
  type AgentCulturalEntry,
  type CulturalCompatibilityResult,
} from '../CulturalCompatibilityChecker';
import type { CulturalProfileTrait } from '../../traits/CultureTraits';
import {
  registerContradictoryNorms,
  getFamilyCompatibility,
} from '../../traits/CultureTraits';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAgent(
  name: string,
  overrides: Partial<CulturalProfileTrait> = {},
): AgentCulturalEntry {
  return {
    name,
    profile: {
      cooperation_index: 0.7,
      cultural_family: 'cooperative',
      prompt_dialect: 'directive',
      norm_set: ['no_griefing', 'fair_trade'],
      ...overrides,
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CulturalCompatibilityChecker', () => {
  const checker = new CulturalCompatibilityChecker();

  // ===========================================================================
  // BASIC FUNCTIONALITY
  // ===========================================================================

  describe('basic checks', () => {
    it('returns compatible for a single agent', () => {
      const result = checker.check([makeAgent('Alpha')]);
      expect(result.compatible).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.pairsChecked).toBe(0);
    });

    it('returns compatible for two fully compatible agents', () => {
      const result = checker.check([
        makeAgent('Alpha'),
        makeAgent('Beta'),
      ]);
      expect(result.compatible).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.pairsChecked).toBe(1);
    });

    it('returns compatible for empty agent list', () => {
      const result = checker.check([]);
      expect(result.compatible).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.pairsChecked).toBe(0);
    });

    it('checks all pairs for 3 agents', () => {
      const result = checker.check([
        makeAgent('A'),
        makeAgent('B'),
        makeAgent('C'),
      ]);
      // 3 choose 2 = 3 pairs
      expect(result.pairsChecked).toBe(3);
    });

    it('checks all pairs for 4 agents', () => {
      const result = checker.check([
        makeAgent('A'),
        makeAgent('B'),
        makeAgent('C'),
        makeAgent('D'),
      ]);
      // 4 choose 2 = 6 pairs
      expect(result.pairsChecked).toBe(6);
    });
  });

  // ===========================================================================
  // COOPERATION INDEX CHECKS
  // ===========================================================================

  describe('cooperation_index', () => {
    it('flags error when cooperation delta exceeds default threshold (0.5)', () => {
      const result = checker.check([
        makeAgent('Helper', { cooperation_index: 0.9 }),
        makeAgent('Rival', { cooperation_index: 0.2 }),
      ]);
      expect(result.compatible).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('CULT002');
      expect(result.errors[0].category).toBe('cooperation_mismatch');
      expect(result.errors[0].agents).toEqual(['Helper', 'Rival']);
    });

    it('accepts agents within cooperation threshold', () => {
      const result = checker.check([
        makeAgent('A', { cooperation_index: 0.7 }),
        makeAgent('B', { cooperation_index: 0.4 }),
      ]);
      // delta = 0.3, within default 0.5 threshold
      expect(result.compatible).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts agents at exact threshold boundary', () => {
      const result = checker.check([
        makeAgent('A', { cooperation_index: 0.8 }),
        makeAgent('B', { cooperation_index: 0.3 }),
      ]);
      // delta = 0.5, exactly at threshold (not exceeding)
      expect(result.compatible).toBe(true);
    });

    it('flags error for cooperation_index out of range (negative)', () => {
      const result = checker.check([
        makeAgent('Bad', { cooperation_index: -0.5 }),
      ]);
      expect(result.compatible).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('CULT001');
      expect(result.errors[0].category).toBe('cooperation_out_of_range');
    });

    it('flags error for cooperation_index out of range (>1)', () => {
      const result = checker.check([
        makeAgent('Bad', { cooperation_index: 1.5 }),
      ]);
      expect(result.compatible).toBe(false);
      expect(result.errors[0].code).toBe('CULT001');
    });

    it('accepts cooperation_index at boundaries (0 and 1)', () => {
      const customChecker = new CulturalCompatibilityChecker({
        cooperationThreshold: 1.1, // High threshold to avoid mismatch error
      });
      const result = customChecker.check([
        makeAgent('Min', { cooperation_index: 0 }),
        makeAgent('Max', { cooperation_index: 1 }),
      ]);
      // Both values are valid; only mismatch matters
      const outOfRange = result.diagnostics.filter(d => d.category === 'cooperation_out_of_range');
      expect(outOfRange).toHaveLength(0);
    });

    it('respects custom cooperation threshold', () => {
      const strict = new CulturalCompatibilityChecker({
        cooperationThreshold: 0.2,
      });
      const result = strict.check([
        makeAgent('A', { cooperation_index: 0.5 }),
        makeAgent('B', { cooperation_index: 0.2 }),
      ]);
      // delta = 0.3, exceeds strict 0.2 threshold
      expect(result.compatible).toBe(false);
      expect(result.errors[0].category).toBe('cooperation_mismatch');
    });
  });

  // ===========================================================================
  // CULTURAL FAMILY CHECKS
  // ===========================================================================

  describe('cultural_family', () => {
    it('flags error for incompatible families: competitive + cooperative', () => {
      const result = checker.check([
        makeAgent('Team', { cultural_family: 'cooperative', cooperation_index: 0.7 }),
        makeAgent('Solo', { cultural_family: 'competitive', cooperation_index: 0.7 }),
      ]);
      expect(result.compatible).toBe(false);
      const familyError = result.errors.find(e => e.category === 'family_incompatible');
      expect(familyError).toBeDefined();
      expect(familyError!.code).toBe('CULT003');
    });

    it('flags error for incompatible families: hierarchical + egalitarian', () => {
      const result = checker.check([
        makeAgent('Boss', { cultural_family: 'hierarchical', cooperation_index: 0.7 }),
        makeAgent('Peer', { cultural_family: 'egalitarian', cooperation_index: 0.7 }),
      ]);
      const familyError = result.errors.find(e => e.category === 'family_incompatible');
      expect(familyError).toBeDefined();
    });

    it('flags error for incompatible families: isolationist + cooperative', () => {
      const result = checker.check([
        makeAgent('Loner', { cultural_family: 'isolationist', cooperation_index: 0.7 }),
        makeAgent('Helper', { cultural_family: 'cooperative', cooperation_index: 0.7 }),
      ]);
      const familyError = result.errors.find(e => e.category === 'family_incompatible');
      expect(familyError).toBeDefined();
    });

    it('warns for cautious families: competitive + egalitarian', () => {
      const result = checker.check([
        makeAgent('Ranker', { cultural_family: 'competitive', cooperation_index: 0.5 }),
        makeAgent('Equal', { cultural_family: 'egalitarian', cooperation_index: 0.5 }),
      ]);
      const cautionWarning = result.warnings.find(w => w.category === 'family_cautious');
      expect(cautionWarning).toBeDefined();
      expect(cautionWarning!.code).toBe('CULT004');
    });

    it('accepts same-family agents', () => {
      const result = checker.check([
        makeAgent('A', { cultural_family: 'mercantile' }),
        makeAgent('B', { cultural_family: 'mercantile' }),
      ]);
      const familyIssues = result.diagnostics.filter(
        d => d.category === 'family_incompatible' || d.category === 'family_cautious'
      );
      expect(familyIssues).toHaveLength(0);
    });

    it('accepts compatible families: exploratory + cooperative', () => {
      const result = checker.check([
        makeAgent('Explorer', { cultural_family: 'exploratory' }),
        makeAgent('Helper', { cultural_family: 'cooperative' }),
      ]);
      const familyIssues = result.diagnostics.filter(
        d => d.category === 'family_incompatible'
      );
      expect(familyIssues).toHaveLength(0);
    });

    it('can suppress cautious warnings via config', () => {
      const quiet = new CulturalCompatibilityChecker({
        warnOnCautious: false,
      });
      const result = quiet.check([
        makeAgent('A', { cultural_family: 'competitive', cooperation_index: 0.5 }),
        makeAgent('B', { cultural_family: 'egalitarian', cooperation_index: 0.5 }),
      ]);
      const cautionWarning = result.warnings.find(w => w.category === 'family_cautious');
      expect(cautionWarning).toBeUndefined();
    });
  });

  // ===========================================================================
  // PROMPT DIALECT CHECKS
  // ===========================================================================

  describe('prompt_dialect', () => {
    it('warns when agents use different dialects', () => {
      const result = checker.check([
        makeAgent('Commander', { prompt_dialect: 'directive' }),
        makeAgent('Teacher', { prompt_dialect: 'socratic' }),
      ]);
      const dialectWarn = result.warnings.find(w => w.category === 'dialect_mismatch');
      expect(dialectWarn).toBeDefined();
      expect(dialectWarn!.code).toBe('CULT005');
    });

    it('does not warn when agents use same dialect', () => {
      const result = checker.check([
        makeAgent('A', { prompt_dialect: 'structured' }),
        makeAgent('B', { prompt_dialect: 'structured' }),
      ]);
      const dialectIssues = result.diagnostics.filter(d => d.category === 'dialect_mismatch');
      expect(dialectIssues).toHaveLength(0);
    });

    it('can disable dialect checking', () => {
      const noDialect = new CulturalCompatibilityChecker({
        checkDialects: false,
      });
      const result = noDialect.check([
        makeAgent('A', { prompt_dialect: 'directive' }),
        makeAgent('B', { prompt_dialect: 'narrative' }),
      ]);
      const dialectIssues = result.diagnostics.filter(d => d.category === 'dialect_mismatch');
      expect(dialectIssues).toHaveLength(0);
    });

    it('warns for all dialect pairs across multiple agents', () => {
      const result = checker.check([
        makeAgent('A', { prompt_dialect: 'directive' }),
        makeAgent('B', { prompt_dialect: 'socratic' }),
        makeAgent('C', { prompt_dialect: 'narrative' }),
      ]);
      // 3 pairs, all different: A-B, A-C, B-C
      const dialectIssues = result.warnings.filter(w => w.category === 'dialect_mismatch');
      expect(dialectIssues).toHaveLength(3);
    });
  });

  // ===========================================================================
  // NORM SET CHECKS
  // ===========================================================================

  describe('norm_set', () => {
    it('warns for unknown norm references', () => {
      const result = checker.check([
        makeAgent('Custom', { norm_set: ['no_griefing', 'custom_rule_xyz'] }),
      ]);
      const unknownNorm = result.warnings.find(w => w.category === 'norm_unknown');
      expect(unknownNorm).toBeDefined();
      expect(unknownNorm!.message).toContain('custom_rule_xyz');
    });

    it('does not warn for known builtin norms', () => {
      const result = checker.check([
        makeAgent('Standard', { norm_set: ['no_griefing', 'fair_trade', 'resource_sharing'] }),
      ]);
      const unknownNorms = result.diagnostics.filter(d => d.category === 'norm_unknown');
      expect(unknownNorms).toHaveLength(0);
    });

    it('can disable norm reference validation', () => {
      const noValidate = new CulturalCompatibilityChecker({
        validateNormReferences: false,
      });
      const result = noValidate.check([
        makeAgent('Custom', { norm_set: ['totally_made_up_norm'] }),
      ]);
      const unknownNorms = result.diagnostics.filter(d => d.category === 'norm_unknown');
      expect(unknownNorms).toHaveLength(0);
    });

    it('detects contradictory norms between two agents', () => {
      // Built-in contradictory pair: resource_sharing vs spawn_limits
      const result = checker.check([
        makeAgent('Sharer', { norm_set: ['resource_sharing'] }),
        makeAgent('Limiter', { norm_set: ['spawn_limits'] }),
      ]);
      const contradiction = result.errors.find(e => e.category === 'norm_contradiction');
      expect(contradiction).toBeDefined();
      expect(contradiction!.code).toBe('CULT006');
    });

    it('detects same agent subscribing to contradictory norms', () => {
      const result = checker.check([
        makeAgent('Confused', { norm_set: ['resource_sharing', 'spawn_limits'] }),
      ]);
      const contradiction = result.errors.find(e => e.category === 'norm_contradiction');
      expect(contradiction).toBeDefined();
      expect(contradiction!.message).toContain('Confused');
    });
  });

  // ===========================================================================
  // ISCOMPATIBLE SHORTHAND
  // ===========================================================================

  describe('isCompatible()', () => {
    it('returns true for compatible composition', () => {
      expect(checker.isCompatible([
        makeAgent('A'),
        makeAgent('B'),
      ])).toBe(true);
    });

    it('returns false for incompatible composition', () => {
      expect(checker.isCompatible([
        makeAgent('A', { cultural_family: 'competitive', cooperation_index: 0.9 }),
        makeAgent('B', { cultural_family: 'cooperative', cooperation_index: 0.1 }),
      ])).toBe(false);
    });
  });

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  describe('configuration', () => {
    it('getConfig returns current configuration', () => {
      const custom = new CulturalCompatibilityChecker({
        cooperationThreshold: 0.3,
      });
      const config = custom.getConfig();
      expect(config.cooperationThreshold).toBe(0.3);
      expect(config.checkDialects).toBe(true); // default
    });

    it('setConfig updates configuration', () => {
      const inst = new CulturalCompatibilityChecker();
      inst.setConfig({ cooperationThreshold: 0.1 });
      const config = inst.getConfig();
      expect(config.cooperationThreshold).toBe(0.1);
    });

    it('default config has expected values', () => {
      const inst = new CulturalCompatibilityChecker();
      const config = inst.getConfig();
      expect(config.cooperationThreshold).toBe(0.5);
      expect(config.checkDialects).toBe(true);
      expect(config.validateNormReferences).toBe(true);
      expect(config.warnOnCautious).toBe(true);
    });
  });

  // ===========================================================================
  // COMPLEX COMPOSITIONS
  // ===========================================================================

  describe('complex compositions', () => {
    it('detects multiple issues in a large composition', () => {
      const result = checker.check([
        makeAgent('Leader', {
          cooperation_index: 0.9,
          cultural_family: 'hierarchical',
          prompt_dialect: 'directive',
          norm_set: ['no_griefing', 'fair_trade'],
        }),
        makeAgent('Rebel', {
          cooperation_index: 0.1,
          cultural_family: 'egalitarian',
          prompt_dialect: 'socratic',
          norm_set: ['no_griefing'],
        }),
        makeAgent('Trader', {
          cooperation_index: 0.5,
          cultural_family: 'mercantile',
          prompt_dialect: 'structured',
          norm_set: ['fair_trade', 'resource_sharing'],
        }),
      ]);

      // Should have multiple issues:
      // - Leader vs Rebel: cooperation delta (0.8 > 0.5), family incompatible, dialect mismatch
      // - Leader vs Trader: dialect mismatch
      // - Rebel vs Trader: dialect mismatch
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.pairsChecked).toBe(3);

      // Verify specific issues exist
      const cooperationErrors = result.errors.filter(e => e.category === 'cooperation_mismatch');
      expect(cooperationErrors.length).toBeGreaterThanOrEqual(1);

      const familyErrors = result.errors.filter(e => e.category === 'family_incompatible');
      expect(familyErrors.length).toBeGreaterThanOrEqual(1);
    });

    it('handles team of fully aligned agents', () => {
      const agents = Array.from({ length: 5 }, (_, i) =>
        makeAgent(`Agent${i}`, {
          cooperation_index: 0.8,
          cultural_family: 'cooperative',
          prompt_dialect: 'consensus',
          norm_set: ['no_griefing', 'resource_sharing'],
        })
      );
      const result = checker.check(agents);
      expect(result.compatible).toBe(true);
      // 5 choose 2 = 10 pairs
      expect(result.pairsChecked).toBe(10);
    });
  });

  // ===========================================================================
  // DIAGNOSTIC STRUCTURE
  // ===========================================================================

  describe('diagnostic structure', () => {
    it('diagnostics have required fields', () => {
      const result = checker.check([
        makeAgent('A', { cooperation_index: 1.0 }),
        makeAgent('B', { cooperation_index: 0.0 }),
      ]);
      for (const diag of result.diagnostics) {
        expect(diag.code).toBeDefined();
        expect(diag.severity).toBeDefined();
        expect(diag.category).toBeDefined();
        expect(diag.message).toBeDefined();
        expect(diag.agents).toBeDefined();
        expect(diag.agents).toHaveLength(2);
      }
    });

    it('errors are partitioned correctly in result', () => {
      const result = checker.check([
        makeAgent('A', { cultural_family: 'competitive', cooperation_index: 0.9 }),
        makeAgent('B', { cultural_family: 'cooperative', cooperation_index: 0.1 }),
      ]);
      // All errors should be in both diagnostics and errors arrays
      for (const err of result.errors) {
        expect(result.diagnostics).toContain(err);
        expect(err.severity).toBe('error');
      }
      // All warnings should be in both diagnostics and warnings arrays
      for (const warn of result.warnings) {
        expect(result.diagnostics).toContain(warn);
        expect(warn.severity).toBe('warning');
      }
    });
  });
});

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe('getFamilyCompatibility', () => {
  it('returns compatible for same family', () => {
    const result = getFamilyCompatibility('cooperative', 'cooperative');
    expect(result.rating).toBe('compatible');
  });

  it('returns incompatible for competitive + cooperative', () => {
    const result = getFamilyCompatibility('competitive', 'cooperative');
    expect(result.rating).toBe('incompatible');
  });

  it('is symmetric', () => {
    const ab = getFamilyCompatibility('hierarchical', 'egalitarian');
    const ba = getFamilyCompatibility('egalitarian', 'hierarchical');
    expect(ab.rating).toBe(ba.rating);
  });

  it('returns compatible for unknown pairs', () => {
    const result = getFamilyCompatibility('exploratory', 'ritualistic');
    expect(result.rating).toBe('compatible');
  });
});
