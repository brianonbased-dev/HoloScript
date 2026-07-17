/**
 * Tests for validate_composition MCP tool
 *
 * Validates trait constraints (requires/conflicts), v6 domain coherence,
 * and proper error reporting for .holo compositions.
 */
import { describe, it, expect } from 'vitest';
import { handleValidationTool } from '../validation-tools';
import { ConfabulationValidator, DERIVED_TRAIT_CONFLICTS } from '@holoscript/core';

// =============================================================================
// HELPERS
// =============================================================================

async function validate(code: string) {
  return handleValidationTool('validate_composition', { code }) as Promise<{
    valid: boolean;
    diagnostics: Array<{
      severity: string;
      code: string;
      message: string;
      source?: string;
      suggestion?: string;
    }>;
    stats: {
      totalTraits: number;
      totalObjects: number;
      totalDomainBlocks: number;
      domainsUsed: string[];
      constraintsChecked: number;
    };
  }>;
}

// =============================================================================
// TESTS
// =============================================================================

describe('validate_composition', () => {
  describe('valid compositions', () => {
    it('returns valid for a simple composition with no traits', async () => {
      const result = await validate(`
        composition "SimpleScene" {
          object Cube {
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('returns valid for correctly constrained spatial traits', async () => {
      const result = await validate(`
        composition "PhysicsScene" {
          object Ball {
            @physics
            @collidable
            @grabbable
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });
  });

  describe('spatial constraint violations', () => {
    it('detects @grabbable without @physics', async () => {
      const result = await validate(`
        composition "BadScene" {
          object Ball {
            @grabbable
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.valid).toBe(false);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.code === 'CONSTRAINT_REQUIRES')).toBe(true);
      expect(errors.some((e) => e.message.includes('physics'))).toBe(true);
    });
  });

  describe('empty / minimal input', () => {
    it('returns valid for empty composition (no objects = no violations)', async () => {
      const result = await validate('composition "Empty" {}');
      expect(result.valid).toBe(true);
      expect(result.stats.totalTraits).toBe(0);
      expect(result.stats.totalObjects).toBe(0);
    });
  });

  describe('missing input', () => {
    it('returns error when code is missing', async () => {
      const result = (await handleValidationTool('validate_composition', {})) as {
        valid: boolean;
        diagnostics: Array<{ code: string }>;
      };
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'MISSING_INPUT')).toBe(true);
    });
  });

  describe('handler routing', () => {
    it('returns null for unknown tool names', async () => {
      const result = await handleValidationTool('unknown_tool', { code: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('stats', () => {
    it('reports trait count for objects with traits', async () => {
      const result = await validate(`
        composition "StatsTest" {
          object A {
            @physics
            @collidable
            position: [0, 0, 0]
          }
        }
      `);
      expect(result.stats.totalTraits).toBeGreaterThanOrEqual(2);
      expect(result.stats.totalObjects).toBeGreaterThanOrEqual(1);
      expect(result.stats.constraintsChecked).toBeGreaterThan(0);
    });
  });

  describe('constraint suggestion messages', () => {
    it('provides actionable suggestion for constraint violations', async () => {
      const result = await validate(`
        composition "SuggestTest" {
          object Sword {
            @grabbable
            position: [0, 1, 0]
          }
        }
      `);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.suggestion && e.suggestion.length > 0)).toBe(true);
    });
  });

  // Phase 1 — advisory per-trait prop-schema check (enum/type). Warnings only; never flips
  // `valid`; suppresses traits with unresolved .holo-vs-.holo conflicts.
  describe('advisory prop-schema warnings', () => {
    it('surfaces an invalid enum value as a WARNING without flipping valid', async () => {
      const result = await validate(`
        composition "RigidScene" {
          object Ball {
            @rigid(type: "not_a_body_type")
            position: [0, 1, 0]
          }
        }
      `);
      // Advisory only: an invalid enum must NOT make the composition invalid.
      expect(result.valid).toBe(true);
      const enumWarn = result.diagnostics.find(
        (d) =>
          d.severity === 'warning' &&
          d.code === 'CONFAB_INVALID_ENUM_VALUE' &&
          d.source === 'rigid'
      );
      expect(enumWarn).toBeDefined();
    });

    it('does not warn for a valid enum value', async () => {
      const result = await validate(`
        composition "RigidScene" {
          object Ball {
            @rigid(type: "dynamic")
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.diagnostics.some((d) => d.code === 'CONFAB_INVALID_ENUM_VALUE')).toBe(false);
    });

    it('suppresses advisory warnings for traits with unresolved .holo conflicts', async () => {
      // Dynamically pick a still-conflicted trait that declares an enum prop, so this test
      // survives the frdb collision cleanup (which shrinks DERIVED_TRAIT_CONFLICTS over time).
      const v = new ConfabulationValidator({ includeDerivedSchemas: true });
      let picked: string | undefined;
      let enumProp: string | undefined;
      for (const name of DERIVED_TRAIT_CONFLICTS) {
        const schema = v.getTraitSchema(name);
        const p = schema?.properties.find(
          (pr) => pr.type === 'enum' && (pr.enumValues?.length ?? 0) > 0
        );
        if (p) {
          picked = name;
          enumProp = p.name;
          break;
        }
      }
      // If no conflicted trait declares an enum anymore, suppression has nothing to act on.
      if (!picked || !enumProp) return;
      const result = await validate(`
        composition "ConflictScene" {
          object O {
            @${picked}(${enumProp}: "__definitely_not_a_valid_enum_value__")
            position: [0, 1, 0]
          }
        }
      `);
      // Trait is in DERIVED_TRAIT_CONFLICTS — its advisory is suppressed until the conflict is triaged.
      const warn = result.diagnostics.find(
        (d) => d.source === picked && d.code.startsWith('CONFAB')
      );
      expect(warn).toBeUndefined();
    });
  });
});
