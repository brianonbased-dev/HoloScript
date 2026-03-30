/**
 * Tests for holoscript_code_health MCP tool
 *
 * Validates health scoring across HoloScript and TypeScript code,
 * grade assignment, breakdown dimensions, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { handleCodeHealthTool } from '../code-health-tools';

// =============================================================================
// HELPERS
// =============================================================================

async function health(code: string, filePath = 'input.holo') {
  return handleCodeHealthTool('holoscript_code_health', { code, filePath }) as Promise<{
    score: number;
    grade: string;
    breakdown: {
      complexity: number;
      traitCoherence: number;
      documentation: number;
      testPresence: number;
      issueDensity: number;
    };
    issues: string[];
    suggestions: string[];
    filesAnalyzed: number;
  }>;
}

// =============================================================================
// TESTS
// =============================================================================

describe('holoscript_code_health', () => {
  describe('handler routing', () => {
    it('returns null for unknown tool names', async () => {
      const result = await handleCodeHealthTool('unknown_tool', { code: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('empty input', () => {
    it('returns grade F for empty code', async () => {
      const result = await health('');
      expect(result.score).toBe(0);
      expect(result.grade).toBe('F');
      expect(result.filesAnalyzed).toBe(0);
      expect(result.issues).toContain('Empty or missing code input');
    });

    it('returns grade F for whitespace-only code', async () => {
      const result = await health('   \n  \n  ');
      expect(result.score).toBe(0);
      expect(result.grade).toBe('F');
    });
  });

  describe('HoloScript analysis', () => {
    it('returns score in 0-10 range for a simple composition', async () => {
      const result = await health(`
        // A simple scene
        composition "SimpleScene" {
          object Cube {
            @physics
            @collidable
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.filesAnalyzed).toBe(1);
    });

    it('returns a valid grade string', async () => {
      const result = await health(`
        composition "GradeTest" {
          object Ball {
            @physics
            position: [0, 0, 0]
          }
        }
      `);
      expect(result.grade).toMatch(/^[A-F][+-]?$/);
    });

    it('reports all 5 breakdown dimensions', async () => {
      const result = await health(`
        composition "BreakdownTest" {
          object Cube {
            @grabbable
            position: [0, 1, 0]
          }
        }
      `);
      expect(result.breakdown).toHaveProperty('complexity');
      expect(result.breakdown).toHaveProperty('traitCoherence');
      expect(result.breakdown).toHaveProperty('documentation');
      expect(result.breakdown).toHaveProperty('testPresence');
      expect(result.breakdown).toHaveProperty('issueDensity');
      // Each dimension should be 0-10
      for (const value of Object.values(result.breakdown)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(11); // docScore can get +1 for JSDoc
      }
    });
  });

  describe('TypeScript analysis', () => {
    it('analyzes TypeScript code when filePath has .ts extension', async () => {
      const result = await health(
        `
        /** User service module */
        export function getUser(id: string): User {
          return db.findById(id);
        }
        `,
        'src/user-service.ts'
      );
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.grade).toMatch(/^[A-F][+-]?$/);
    });

    it('penalizes code with many TODO markers', async () => {
      const cleanCode = `
        export function clean(): void {
          return;
        }
      `;
      const dirtyCode = `
        // TODO: fix this
        // FIXME: broken
        // HACK: temporary
        // XXX: bad
        // TODO: more stuff
        export function dirty(): any {
          return null as any;
        }
      `;
      const cleanResult = await health(cleanCode, 'clean.ts');
      const dirtyResult = await health(dirtyCode, 'dirty.ts');
      expect(cleanResult.breakdown.issueDensity).toBeGreaterThan(
        dirtyResult.breakdown.issueDensity
      );
    });

    it('detects deeply nested code', async () => {
      const deepCode = `
        function deep() {
          if (true) {
            if (true) {
              if (true) {
                if (true) {
                  if (true) {
                    if (true) {
                      return 'deep';
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const result = await health(deepCode, 'deep.ts');
      expect(result.issues.some((i) => i.includes('nesting'))).toBe(true);
    });
  });

  describe('test file detection', () => {
    it('gives higher test presence score for test files', async () => {
      const code = `
        import { describe, it, expect } from 'vitest';
        describe('test', () => {
          it('works', () => {
            expect(true).toBe(true);
          });
        });
      `;
      const testResult = await health(code, 'src/__tests__/foo.test.ts');
      const srcResult = await health('export function foo() { return 1; }', 'src/foo.ts');
      expect(testResult.breakdown.testPresence).toBeGreaterThan(srcResult.breakdown.testPresence);
    });
  });
});
