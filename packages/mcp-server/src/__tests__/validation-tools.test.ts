/**
 * Tests for validate_composition MCP tool
 *
 * Validates trait constraints (requires/conflicts), v6 domain coherence,
 * and proper error reporting for .holo compositions.
 */
import { describe, it, expect } from 'vitest';
import { handleValidationTool } from '../validation-tools';

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
        composition SimpleScene {
          object Cube {
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.stats.totalObjects).toBeGreaterThanOrEqual(1);
    });

    it('returns valid for correctly constrained spatial traits', async () => {
      const result = await validate(`
        composition PhysicsScene {
          object Ball {
            @physics
            @collidable
            @grabbable
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    });
  });

  describe('spatial constraint violations', () => {
    it('detects @grabbable without @physics', async () => {
      const result = await validate(`
        composition BadScene {
          object Ball {
            @grabbable
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.valid).toBe(false);
      const errors = result.diagnostics.filter(d => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.code === 'CONSTRAINT_REQUIRES')).toBe(true);
      expect(errors.some(e => e.message.includes('physics'))).toBe(true);
    });
  });

  describe('parse errors', () => {
    it('returns parse errors for invalid syntax', async () => {
      const result = await validate('this is not valid holoscript {{{');
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some(d => d.code === 'PARSE_ERROR')).toBe(true);
    });
  });

  describe('missing input', () => {
    it('returns error when code is missing', async () => {
      const result = (await handleValidationTool('validate_composition', {})) as {
        valid: boolean;
        diagnostics: Array<{ code: string }>;
      };
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some(d => d.code === 'MISSING_INPUT')).toBe(true);
    });
  });

  describe('handler routing', () => {
    it('returns null for unknown tool names', async () => {
      const result = await handleValidationTool('unknown_tool', { code: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('stats', () => {
    it('reports correct statistics for a composition', async () => {
      const result = await validate(`
        composition StatsTest {
          object A {
            @physics
            @collidable
            position: [0, 0, 0]
          }
          object B {
            @visible
            position: [1, 0, 0]
          }
        }
      `);
      expect(result.stats.totalObjects).toBeGreaterThanOrEqual(2);
      expect(result.stats.constraintsChecked).toBeGreaterThan(0);
    });
  });
});
