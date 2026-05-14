/**
 * @fileoverview @platform() Conditional Compilation — Negative Tests & Validation Gaps
 *
 * This test file documents the "rejected" contract for @platform() conditional compilation:
 * - What invalid syntax looks like
 * - How the parser currently handles malformed input
 * - Validation gaps that need to be addressed
 *
 * PROTOTYPE STATUS (2026-05-14):
 * The parser is permissive — it accepts unknown platform names and some malformed syntax
 * without producing errors. This is by design (future-proofing), but means validation
 * must happen at compile-time or via a separate validation pass.
 *
 * What this prototype proves:
 * 1. REPRESENTED: @platform(...) blocks parse into PlatformConstraint AST nodes ✓
 * 2. LOWERED: filterForPlatform() strips non-matching blocks (dead code elimination) ✓
 * 3. REJECTED: Unknown platforms are filtered out (don't match any target) ✓
 *
 * What needs validation added:
 * - Empty @platform() should fail
 * - Unknown platform names should warn
 * - Malformed syntax (missing commas, etc.) should fail
 */

import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../../parser/HoloCompositionParser';
import {
  PlatformConditionalCompilerMixin,
  createPlatformTarget,
} from '../../PlatformConditionalCompilerMixin';
import {
  ALL_PLATFORMS,
  PLATFORM_CATEGORIES,
} from '../PlatformConditional';

// =============================================================================
// HELPERS
// =============================================================================

function parseWithErrors(source: string): { ast: any; errors: any[] } {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  return {
    ast: result.ast,
    errors: result.errors || [],
  };
}

function getValidPlatformNames(): string[] {
  // All specific platforms + all category names + all aliases
  const platforms = ALL_PLATFORMS;
  const categories = Object.keys(PLATFORM_CATEGORIES);
  const aliases = ['phone', 'car'];
  return [...platforms, ...categories, ...aliases];
}

// =============================================================================
// NEGATIVE TESTS: Parser Behavior Documentation
// =============================================================================

describe('@platform() negative tests', () => {
  describe('Unknown platform names (parser accepts, filter rejects)', () => {
    it('@platform(xbox) — xbox is not a valid platform but parser accepts it', () => {
      const { ast, errors } = parseWithErrors(`
        composition "Test" {
          @platform(xbox) object "XBoxObj" { visible: true }
        }
      `);

      // Parser accepts unknown names (future-proofing design)
      // Validation must happen at compile-time or via separate pass
      expect(ast).toBeDefined();
      expect(ast.objects).toHaveLength(1);
      expect(ast.objects[0].platformConstraint).toBeDefined();
      expect(ast.objects[0].platformConstraint!.include).toContain('xbox');
      expect(errors).toHaveLength(0); // No parse errors
    });

    it('@platform(glasses) — glasses is not a valid category', () => {
      const { ast } = parseWithErrors(`
        composition "Test" {
          @platform(glasses) object "GlassesObj" { visible: true }
        }
      `);

      expect(ast.objects[0].platformConstraint!.include).toContain('glasses');
    });

    it('@platform(iphone) — iphone is not valid (use ios)', () => {
      const { ast } = parseWithErrors(`
        composition "Test" {
          @platform(iphone) object "IphoneObj" { visible: true }
        }
      `);

      expect(ast.objects[0].platformConstraint!.include).toContain('iphone');
    });

    it('unknown platforms are filtered out (do not match any target)', () => {
      const { ast } = parseWithErrors(`
        composition "Test" {
          @platform(xbox) object "XBoxOnly" { visible: true }
          object "Universal" { visible: true }
        }
      `);

      const mixin = new PlatformConditionalCompilerMixin();
      const filtered = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));

      // XBoxOnly is filtered out (xbox doesn't match quest3)
      // Universal passes through (no constraint)
      expect(filtered.objects).toHaveLength(1);
      expect(filtered.objects[0].name).toBe('Universal');
    });
  });

  describe('Malformed syntax (parser permissive — needs validation)', () => {
    it('@platform() — empty parentheses parsed without error', () => {
      const { errors, ast } = parseWithErrors(`
        composition "Test" {
          @platform() object "Empty" { visible: true }
        }
      `);

      // Current behavior: parser accepts empty platform list
      // TODO: Add validation to reject empty @platform()
      expect(errors).toHaveLength(0);
      expect(ast.objects[0].platformConstraint).toBeDefined();
    });

    it('@platform(vr ar) — missing comma parsed as both platforms (permissive)', () => {
      const { errors, ast } = parseWithErrors(`
        composition "Test" {
          @platform(vr ar) object "NoComma" { visible: true }
        }
      `);

      // Current behavior: parser is permissive, accepts space-separated identifiers
      // Both "vr" and "ar" are included (whitespace acts as separator)
      // TODO: Add validation to require explicit commas
      expect(errors).toHaveLength(0);
      expect(ast.objects[0].platformConstraint!.include).toEqual(['vr', 'ar']);
    });

    it('@platform vr — missing parentheses fails to parse', () => {
      const { errors } = parseWithErrors(`
        composition "Test" {
          @platform vr object "NoParens" { visible: true }
        }
      `);

      // This DOES fail - parentheses are required
      expect(errors.length).toBeGreaterThan(0);
    });

    it('@platform(vr, ) — trailing comma parsed without error', () => {
      const { errors, ast } = parseWithErrors(`
        composition "Test" {
          @platform(vr, ) object "TrailingComma" { visible: true }
        }
      `);

      // Current behavior: parser accepts trailing comma
      // TODO: Add validation to reject trailing commas
      expect(errors).toHaveLength(0);
      expect(ast.objects[0].platformConstraint!.include).toEqual(['vr']);
    });

    it('@platform(, vr) — leading comma parsed without error (permissive)', () => {
      const { errors, ast } = parseWithErrors(`
        composition "Test" {
          @platform(, vr) object "LeadingComma" { visible: true }
        }
      `);

      // Current behavior: parser is permissive, leading comma is ignored
      // TODO: Add validation to reject leading commas
      expect(errors).toHaveLength(0);
      expect(ast.objects[0].platformConstraint!.include).toEqual(['vr']);
    });
  });

  describe('Invalid negation syntax', () => {
    it('@platform(:not vr) — wrong negation order parsed as "not" and "vr" (colon stripped)', () => {
      const { errors, ast } = parseWithErrors(`
        composition "Test" {
          @platform(:not vr) object "WrongNot" { visible: true }
        }
      `);

      // Current behavior: parser strips colon, treats ":not" as "not" platform name
      // This is permissive but wrong - "not" is a keyword, not a platform
      // TODO: Add validation to reject invalid negation syntax
      expect(errors).toHaveLength(0);
      expect(ast.objects[0].platformConstraint!.include).toEqual(['not', 'vr']);
    });

    it('@platform(NOT vr) — uppercase NOT treated as platform name', () => {
      const { ast, errors } = parseWithErrors(`
        composition "Test" {
          @platform(NOT vr) object "UpperNot" { visible: true }
        }
      `);

      // Parser is case-sensitive - NOT is treated as a platform name
      // This will fail validation (NOT is not a valid platform)
      expect(errors).toHaveLength(0);
      expect(ast.objects[0].platformConstraint!.include).toContain('NOT');
    });

    it('@platform(not: ) — empty exclusion list parsed without error (permissive)', () => {
      const { errors, ast } = parseWithErrors(`
        composition "Test" {
          @platform(not: ) object "EmptyExclude" { visible: true }
        }
      `);

      // Current behavior: parser accepts empty exclusion list
      // TODO: Add validation to reject empty "not:" clauses
      expect(errors).toHaveLength(0);
      expect(ast.objects[0].platformConstraint!.exclude).toEqual([]);
    });

    it('@platform(not: xbox) — unknown platform in exclusion accepted', () => {
      const { ast } = parseWithErrors(`
        composition "Test" {
          @platform(not: xbox) object "NotXbox" { visible: true }
        }
      `);

      // Parser accepts unknown names in exclusion
      expect(ast.objects[0].platformConstraint!.exclude).toContain('xbox');
    });
  });
});

// =============================================================================
// VALIDATION HELPER TESTS
// =============================================================================

describe('Platform validation helper', () => {
  it('getValidPlatformNames returns all platforms + categories + aliases', () => {
    const valid = getValidPlatformNames();

    // Should include all specific platforms
    expect(valid).toContain('quest3');
    expect(valid).toContain('visionos');
    expect(valid).toContain('ios');
    expect(valid).toContain('android-auto');

    // Should include all categories
    expect(valid).toContain('vr');
    expect(valid).toContain('ar');
    expect(valid).toContain('mobile');
    expect(valid).toContain('desktop');
    expect(valid).toContain('automotive');
    expect(valid).toContain('wearable');

    // Should include aliases
    expect(valid).toContain('phone');
    expect(valid).toContain('car');

    // Should NOT include invalid names
    expect(valid).not.toContain('xbox');
    expect(valid).not.toContain('iphone');
    expect(valid).not.toContain('glasses');
    expect(valid).not.toContain('tablet');
  });
});

// =============================================================================
// COMPILER VALIDATION INTEGRATION
// =============================================================================

describe('Compiler validation integration', () => {
  const mixin = new PlatformConditionalCompilerMixin();

  it('filters unknown platforms but does not validate them', () => {
    // The current design: parser accepts unknown names,
    // filtering still works (unknown names just don't match anything)
    const { ast } = parseWithErrors(`
      composition "Test" {
        @platform(xbox) object "XBoxOnly" { visible: true }
        object "Universal" { visible: true }
      }
    `);

    const filtered = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));

    // XBoxOnly is filtered out (xbox doesn't match quest3)
    // Universal passes through (no constraint)
    expect(filtered.objects).toHaveLength(1);
    expect(filtered.objects[0].name).toBe('Universal');
  });

  it('valid platform categories expand correctly', () => {
    const { ast } = parseWithErrors(`
      composition "Test" {
        @platform(vr) object "VROnly" { visible: true }
      }
    `);

    // VR should expand to 4 platforms
    const constraint = ast.objects[0].platformConstraint!;
    expect(constraint.include).toContain('vr');

    // When filtered for quest3, it should match
    const filtered = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));
    expect(filtered.objects).toHaveLength(1);
    expect(filtered.objects[0].name).toBe('VROnly');
  });

  it('alias "phone" expands to mobile category (ios, android)', () => {
    const { ast } = parseWithErrors(`
      composition "Test" {
        @platform(phone) object "PhoneOnly" { visible: true }
      }
    `);

    const filteredIos = mixin.filterForPlatform(ast, createPlatformTarget('ios'));
    const filteredAndroid = mixin.filterForPlatform(ast, createPlatformTarget('android'));
    const filteredQuest = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));

    expect(filteredIos.objects).toHaveLength(1);
    expect(filteredIos.objects[0].name).toBe('PhoneOnly');

    expect(filteredAndroid.objects).toHaveLength(1);
    expect(filteredAndroid.objects[0].name).toBe('PhoneOnly');

    expect(filteredQuest.objects).toHaveLength(0);
  });
});

// =============================================================================
// VALIDATION TODO — Tests that should pass after validation is added
// =============================================================================

describe.skip('VALIDATION TODO — future validation tests', () => {
  it('@platform() empty should fail', () => {
    // TODO: Add validation
    const { errors } = parseWithErrors(`
      composition "Test" {
        @platform() object "Empty" { visible: true }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('@platform(xbox) should warn — unknown platform', () => {
    // TODO: Add compile-time warning for unknown platform names
    const { ast } = parseWithErrors(`
      composition "Test" {
        @platform(xbox) object "XBoxOnly" { visible: true }
      }
    `);
    // Should produce warning: "xbox is not a recognized platform"
    expect(ast).toBeDefined();
  });

  it('@platform(vr ar) should fail — missing comma', () => {
    // TODO: Add validation for malformed syntax
    const { errors } = parseWithErrors(`
      composition "Test" {
        @platform(vr ar) object "NoComma" { visible: true }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('@platform(vr, ) should fail — trailing comma', () => {
    // TODO: Add validation for trailing commas
    const { errors } = parseWithErrors(`
      composition "Test" {
        @platform(vr, ) object "Trailing" { visible: true }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
  });
});
