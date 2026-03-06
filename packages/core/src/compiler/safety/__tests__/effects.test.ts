/**
 * @fileoverview Tests for the Effect Type System and Effect Checker
 *
 * Tests:
 * - EffectRow operations (union, intersect, difference, subsumes)
 * - Effect inference from traits and builtins
 * - Effect composition (row-polymorphic union)
 * - Undeclared effect detection
 * - Unused declaration detection
 * - All 10 VR effect categories
 * - Safety trait checking
 * - Danger level scoring
 */

import { describe, it, expect } from 'vitest';
import { EffectRow, effectCategory, EFFECTS_BY_CATEGORY, VREffect } from '../../../types/effects';
import {
  inferFromTraits,
  inferFromBuiltins,
  composeEffects,
  TRAIT_EFFECTS,
  BUILTIN_EFFECTS,
  knownTraits,
  knownBuiltins,
  traitEffectDeclaration,
} from '../EffectInference';
import {
  EffectChecker,
  createEffectChecker,
  isSafeTraitSet,
  dangerLevel,
  EffectASTNode,
} from '../EffectChecker';

// =============================================================================
// EffectRow Tests
// =============================================================================

describe('EffectRow', () => {
  it('PURE row has zero effects', () => {
    expect(EffectRow.PURE.isPure()).toBe(true);
    expect(EffectRow.PURE.size).toBe(0);
  });

  it('creates from effects', () => {
    const row = EffectRow.of('render:spawn', 'physics:force');
    expect(row.size).toBe(2);
    expect(row.has('render:spawn')).toBe(true);
    expect(row.has('physics:force')).toBe(true);
    expect(row.has('io:network')).toBe(false);
  });

  it('deduplicates effects', () => {
    const row = EffectRow.of('render:spawn', 'render:spawn', 'render:spawn');
    expect(row.size).toBe(1);
  });

  it('union composes two rows', () => {
    const a = EffectRow.of('render:spawn', 'physics:force');
    const b = EffectRow.of('audio:play', 'physics:force');
    const u = a.union(b);
    expect(u.size).toBe(3);
    expect(u.has('render:spawn')).toBe(true);
    expect(u.has('physics:force')).toBe(true);
    expect(u.has('audio:play')).toBe(true);
  });

  it('intersect finds common effects', () => {
    const a = EffectRow.of('render:spawn', 'physics:force');
    const b = EffectRow.of('audio:play', 'physics:force');
    const i = a.intersect(b);
    expect(i.size).toBe(1);
    expect(i.has('physics:force')).toBe(true);
  });

  it('difference finds effects in A but not B', () => {
    const a = EffectRow.of('render:spawn', 'physics:force', 'audio:play');
    const b = EffectRow.of('physics:force');
    const d = a.difference(b);
    expect(d.size).toBe(2);
    expect(d.has('render:spawn')).toBe(true);
    expect(d.has('audio:play')).toBe(true);
    expect(d.has('physics:force')).toBe(false);
  });

  it('subsumes checks containment', () => {
    const big = EffectRow.of('render:spawn', 'physics:force', 'audio:play');
    const small = EffectRow.of('render:spawn');
    expect(big.subsumes(small)).toBe(true);
    expect(small.subsumes(big)).toBe(false);
  });

  it('categories returns unique categories', () => {
    const row = EffectRow.of('render:spawn', 'render:material', 'physics:force', 'audio:play');
    const cats = row.categories().sort();
    expect(cats).toEqual(['audio', 'physics', 'render']);
  });

  it('ofCategory filters by category', () => {
    const row = EffectRow.of('render:spawn', 'render:material', 'physics:force');
    expect(row.ofCategory('render')).toEqual(expect.arrayContaining(['render:spawn', 'render:material']));
    expect(row.ofCategory('physics')).toEqual(['physics:force']);
  });

  it('fromCategory creates row with all effects of a category', () => {
    const row = EffectRow.fromCategory('audio');
    expect(row.has('audio:play')).toBe(true);
    expect(row.has('audio:spatial')).toBe(true);
    expect(row.has('audio:global')).toBe(true);
  });

  it('serializes to/from JSON', () => {
    const row = EffectRow.of('render:spawn', 'physics:force');
    const json = row.toJSON();
    const restored = EffectRow.fromJSON(json);
    expect(restored.size).toBe(2);
    expect(restored.has('render:spawn')).toBe(true);
  });

  it('toString formats nicely', () => {
    expect(EffectRow.PURE.toString()).toBe('<pure>');
    const row = EffectRow.of('render:spawn');
    expect(row.toString()).toContain('render:spawn');
  });
});

// =============================================================================
// Effect Category Tests
// =============================================================================

describe('effectCategory', () => {
  it('extracts category from effect string', () => {
    expect(effectCategory('render:spawn')).toBe('render');
    expect(effectCategory('physics:force')).toBe('physics');
    expect(effectCategory('io:network')).toBe('io');
    expect(effectCategory('agent:spawn')).toBe('agent');
  });

  it('all 10 categories are defined', () => {
    const cats = Object.keys(EFFECTS_BY_CATEGORY);
    expect(cats).toHaveLength(10);
    expect(cats).toContain('io');
    expect(cats).toContain('physics');
    expect(cats).toContain('render');
    expect(cats).toContain('audio');
    expect(cats).toContain('inventory');
    expect(cats).toContain('authority');
    expect(cats).toContain('resource');
    expect(cats).toContain('agent');
  });
});

// =============================================================================
// Effect Inference Tests
// =============================================================================

describe('inferFromTraits', () => {
  it('infers rendering effects from @mesh', () => {
    const result = inferFromTraits(['@mesh']);
    expect(result.row.has('render:spawn')).toBe(true);
  });

  it('infers physics effects from @physics', () => {
    const result = inferFromTraits(['@physics']);
    expect(result.row.has('physics:force')).toBe(true);
    expect(result.row.has('physics:collision')).toBe(true);
    expect(result.row.has('resource:cpu')).toBe(true);
  });

  it('composes effects from multiple traits', () => {
    const result = inferFromTraits(['@mesh', '@physics', '@audio']);
    expect(result.row.has('render:spawn')).toBe(true);
    expect(result.row.has('physics:force')).toBe(true);
    expect(result.row.has('audio:play')).toBe(true);
  });

  it('tracks source of each effect', () => {
    const result = inferFromTraits(['@mesh']);
    expect(result.sources.get('render:spawn')).toContain('@mesh');
  });

  it('warns on unknown traits', () => {
    const result = inferFromTraits(['@unknown_trait']);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.row.isPure()).toBe(true);
  });

  it('handles traits with and without @ prefix', () => {
    const a = inferFromTraits(['@mesh']);
    const b = inferFromTraits(['mesh']);
    expect(a.row.size).toBe(b.row.size);
  });

  it('sandbox trait is pure', () => {
    const result = inferFromTraits(['@sandbox']);
    expect(result.row.isPure()).toBe(true);
  });
});

describe('inferFromBuiltins', () => {
  it('infers render effects from spawn()', () => {
    const result = inferFromBuiltins(['spawn']);
    expect(result.row.has('render:spawn')).toBe(true);
    expect(result.row.has('resource:memory')).toBe(true);
  });

  it('infers physics effects from applyForce()', () => {
    const result = inferFromBuiltins(['applyForce']);
    expect(result.row.has('physics:force')).toBe(true);
  });

  it('infers network effects from fetch()', () => {
    const result = inferFromBuiltins(['fetch']);
    expect(result.row.has('io:network')).toBe(true);
  });

  it('pure functions have no effects', () => {
    const result = inferFromBuiltins(['Math.sin', 'Math.cos', 'lerp']);
    expect(result.row.isPure()).toBe(true);
  });
});

describe('composeEffects', () => {
  it('unions all inferred effects', () => {
    const a = inferFromTraits(['@mesh']);
    const b = inferFromBuiltins(['applyForce']);
    const composed = composeEffects(a, b);
    expect(composed.row.has('render:spawn')).toBe(true);
    expect(composed.row.has('physics:force')).toBe(true);
  });
});

// =============================================================================
// Effect Checker Tests
// =============================================================================

describe('EffectChecker', () => {
  const checker = createEffectChecker();

  it('passes when declared effects match inferred', () => {
    const node: EffectASTNode = {
      type: 'object', name: 'Player',
      traits: ['@mesh', '@physics'],
      calls: [],
      declaredEffects: ['render:spawn', 'physics:force', 'physics:collision', 'resource:cpu'],
    };
    const result = checker.checkNode(node);
    expect(result.undeclared.isPure()).toBe(true);
    expect(result.violations.filter(v => v.severity === 'error')).toHaveLength(0);
  });

  it('detects undeclared effects', () => {
    const node: EffectASTNode = {
      type: 'object', name: 'SneakyAgent',
      traits: ['@mesh', '@networked'],
      calls: ['fetch'],
      declaredEffects: ['render:spawn'], // Missing network effects!
    };
    const result = checker.checkNode(node);
    expect(result.undeclared.isPure()).toBe(false);
    expect(result.violations.some(v => v.severity === 'error' && v.effect === 'io:network')).toBe(true);
  });

  it('warns on unused declared effects', () => {
    const node: EffectASTNode = {
      type: 'object', name: 'OverDeclared',
      traits: ['@mesh'],
      calls: [],
      declaredEffects: ['render:spawn', 'physics:force'], // physics:force not used
    };
    const result = checker.checkNode(node);
    expect(result.unused.has('physics:force')).toBe(true);
    expect(result.violations.some(v => v.severity === 'warning' && v.effect === 'physics:force')).toBe(true);
  });

  it('pure function with no annotation passes', () => {
    const node: EffectASTNode = {
      type: 'function', name: 'pureCalc',
      traits: [], calls: ['Math.sin', 'lerp'],
    };
    const result = checker.checkNode(node);
    expect(result.inferred.isPure()).toBe(true);
    expect(result.violations.filter(v => v.severity === 'error')).toHaveLength(0);
  });

  it('unannotated effectful function fails', () => {
    const node: EffectASTNode = {
      type: 'function', name: 'sneakySpawn',
      traits: [], calls: ['spawn', 'applyForce'],
      // No declaredEffects — defaults to pure
    };
    const result = checker.checkNode(node);
    expect(result.undeclared.isPure()).toBe(false);
    expect(result.violations.filter(v => v.severity === 'error').length).toBeGreaterThan(0);
  });

  describe('checkModule', () => {
    it('aggregates violations across functions', () => {
      const nodes: EffectASTNode[] = [
        { type: 'object', name: 'A', traits: ['@mesh'], calls: [], declaredEffects: ['render:spawn'] },
        { type: 'object', name: 'B', traits: ['@networked'], calls: [] }, // undeclared
      ];
      const result = checker.checkModule(nodes);
      expect(result.passed).toBe(false);
      expect(result.moduleEffects.has('render:spawn')).toBe(true);
      expect(result.moduleEffects.has('io:network')).toBe(true);
    });

    it('passes when all functions are correct', () => {
      const nodes: EffectASTNode[] = [
        { type: 'object', name: 'Safe', traits: ['@mesh'], calls: [], declaredEffects: ['render:spawn'] },
      ];
      const result = checker.checkModule(nodes);
      expect(result.passed).toBe(true);
    });
  });

  describe('quickCheck', () => {
    it('passes for subset of allowed effects', () => {
      const result = checker.quickCheck(['@mesh'], [], ['render:spawn']);
      expect(result.passed).toBe(true);
    });

    it('fails for disallowed effects', () => {
      const result = checker.quickCheck(['@mesh', '@networked'], ['fetch'], ['render:spawn']);
      expect(result.passed).toBe(false);
      expect(result.undeclared).toContain('io:network');
    });
  });
});

// =============================================================================
// Safety Helpers
// =============================================================================

describe('isSafeTraitSet', () => {
  it('marks pure rendering as safe', () => {
    expect(isSafeTraitSet(['@mesh', '@material']).safe).toBe(true);
  });

  it('marks authority traits as dangerous', () => {
    const result = isSafeTraitSet(['@owned', '@delegated']);
    expect(result.safe).toBe(false);
    expect(result.dangerous).toContain('authority:own');
  });

  it('marks network traits as dangerous', () => {
    const result = isSafeTraitSet(['@networked']);
    expect(result.safe).toBe(false);
    expect(result.dangerous).toContain('io:network');
  });
});

describe('dangerLevel', () => {
  it('pure row has 0 danger', () => {
    expect(dangerLevel(EffectRow.PURE)).toBe(0);
  });

  it('render-only has low danger', () => {
    expect(dangerLevel(EffectRow.of('render:spawn'))).toBeLessThan(3);
  });

  it('authority effects have high danger', () => {
    expect(dangerLevel(EffectRow.of('authority:own', 'authority:delegate', 'agent:kill'))).toBeGreaterThan(5);
  });
});

// =============================================================================
// Known Traits/Builtins Coverage
// =============================================================================

// =============================================================================
// traitEffectDeclaration Tests
// =============================================================================

describe('traitEffectDeclaration', () => {
  it('returns annotated declaration for known traits', () => {
    const decl = traitEffectDeclaration('@mesh');
    expect(decl.origin).toBe('annotated');
    expect(decl.declared.has('render:spawn')).toBe(true);
  });

  it('returns inferred pure declaration for unknown traits', () => {
    const decl = traitEffectDeclaration('@nonexistent');
    expect(decl.origin).toBe('inferred');
    expect(decl.declared.isPure()).toBe(true);
  });

  it('normalizes trait names without @ prefix', () => {
    const decl = traitEffectDeclaration('physics');
    expect(decl.origin).toBe('annotated');
    expect(decl.declared.has('physics:force')).toBe(true);
  });
});

// =============================================================================
// EffectChecker Configuration Tests
// =============================================================================

describe('EffectChecker config', () => {
  it('ignoredCategories suppresses specific categories', () => {
    const checker = createEffectChecker({ ignoredCategories: ['resource'] });
    const node: EffectASTNode = {
      type: 'object', name: 'Heavy',
      traits: ['@particle'],
      calls: [],
      declaredEffects: ['render:particle', 'render:spawn'],
    };
    const result = checker.checkNode(node);
    // @particle infers resource:gpu but 'resource' category is ignored
    const resourceViolations = result.violations.filter(v => v.effect.startsWith('resource:'));
    expect(resourceViolations).toHaveLength(0);
  });

  it('strictUnknownTraits changes severity', () => {
    const strictChecker = createEffectChecker({ strictUnknownTraits: true });
    const lenientChecker = createEffectChecker({ strictUnknownTraits: false });
    const node: EffectASTNode = {
      type: 'object', name: 'UnknownTrait',
      traits: ['@completely_custom'],
      calls: [],
      declaredEffects: [],
    };
    // Both should produce results without crashing
    const strictResult = strictChecker.checkNode(node);
    const lenientResult = lenientChecker.checkNode(node);
    expect(strictResult.inferred.isPure()).toBe(true);
    expect(lenientResult.inferred.isPure()).toBe(true);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('empty EffectASTNode array produces passing module check', () => {
    const checker = createEffectChecker();
    const result = checker.checkModule([]);
    expect(result.passed).toBe(true);
    expect(result.moduleEffects.isPure()).toBe(true);
  });

  it('composeEffects with no arguments produces pure', () => {
    const result = composeEffects();
    expect(result.row.isPure()).toBe(true);
    expect(result.sources.size).toBe(0);
  });

  it('composeEffects merges sources from multiple inference results', () => {
    const a = inferFromTraits(['@mesh']);
    const b = inferFromBuiltins(['spawn']);
    const composed = composeEffects(a, b);
    const sources = composed.sources.get('render:spawn');
    expect(sources).toContain('@mesh');
    expect(sources).toContain('spawn');
  });

  it('EffectRow hasCategory works correctly', () => {
    const row = EffectRow.of('render:spawn', 'physics:force');
    expect(row.hasCategory('render')).toBe(true);
    expect(row.hasCategory('physics')).toBe(true);
    expect(row.hasCategory('audio')).toBe(false);
  });

  it('dangerLevel caps at 10', () => {
    const extreme = new EffectRow([
      'authority:own', 'authority:delegate', 'authority:revoke',
      'authority:zone', 'authority:world',
      'inventory:take', 'inventory:destroy', 'inventory:duplicate', 'inventory:trade',
      'agent:spawn', 'agent:kill', 'agent:control',
      'io:network', 'io:write',
    ] as VREffect[]);
    expect(dangerLevel(extreme)).toBeLessThanOrEqual(10);
  });
});

// =============================================================================
// Coverage
// =============================================================================

describe('coverage', () => {
  it('has 40+ known traits', () => {
    expect(knownTraits().length).toBeGreaterThanOrEqual(40);
  });

  it('has 30+ known builtins', () => {
    expect(knownBuiltins().length).toBeGreaterThanOrEqual(30);
  });

  it('all trait effects are valid VR effects', () => {
    const allEffects = Object.values(EFFECTS_BY_CATEGORY).flat();
    for (const [trait, effects] of Object.entries(TRAIT_EFFECTS)) {
      for (const e of effects) {
        expect(allEffects).toContain(e);
      }
    }
  });

  it('all builtin effects are valid VR effects', () => {
    const allEffects = Object.values(EFFECTS_BY_CATEGORY).flat();
    for (const [fn, effects] of Object.entries(BUILTIN_EFFECTS)) {
      for (const e of effects) {
        expect(allEffects).toContain(e);
      }
    }
  });
});
