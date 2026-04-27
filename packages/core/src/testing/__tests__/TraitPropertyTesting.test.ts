import { describe, it, expect } from 'vitest';
import {
  property,
  traitPropertyTest,
  PHYSICS_PROPERTIES,
  MATERIAL_PROPERTIES,
  TRANSFORM_PROPERTIES,
  type TraitProperty,
  type PropertyTestResult,
} from '../TraitPropertyTesting.js';

// =============================================================================
// property() constructor
// =============================================================================

describe('property()', () => {
  it('returns a TraitProperty with the provided name', () => {
    const p = property('my prop', (gen) => gen.int(0, 10), (n) => n >= 0);
    expect(p.name).toBe('my prop');
  });

  it('stores the generate function', () => {
    const gen_fn = (gen: any) => gen.bool();
    const p = property('bool prop', gen_fn, (b) => typeof b === 'boolean');
    expect(p.generate).toBe(gen_fn);
  });

  it('stores the predicate function', () => {
    const pred = (n: number) => n >= 0;
    const p = property('non-negative', (gen) => gen.int(0, 10), pred);
    expect(p.predicate).toBe(pred);
  });

  it('shrink is undefined when not provided', () => {
    const p = property('no-shrink', (gen) => gen.int(0, 5), (n) => n >= 0);
    expect(p.shrink).toBeUndefined();
  });

  it('stores optional shrink function', () => {
    const shrink = (n: number) => (n > 0 ? [n - 1] : []);
    const p = property('shrinkable', (gen) => gen.int(0, 100), (n) => n < 50, shrink);
    expect(p.shrink).toBe(shrink);
  });
});

// =============================================================================
// traitPropertyTest() – empty / trivial
// =============================================================================

describe('traitPropertyTest() – empty properties', () => {
  it('passes with empty property list', () => {
    const r = traitPropertyTest('empty-trait', []);
    expect(r.passed).toBe(true);
  });

  it('returns traitName correctly', () => {
    const r = traitPropertyTest('my-trait', []);
    expect(r.traitName).toBe('my-trait');
  });

  it('returns zero totalCases for empty list', () => {
    const r = traitPropertyTest('t', []);
    expect(r.totalCases).toBe(0);
  });

  it('returns empty properties array', () => {
    const r = traitPropertyTest('t', []);
    expect(r.properties).toHaveLength(0);
  });

  it('includes timeMs >= 0', () => {
    const r = traitPropertyTest('t', []);
    expect(r.timeMs).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// traitPropertyTest() – passing properties
// =============================================================================

describe('traitPropertyTest() – passing properties', () => {
  it('passes when predicate always returns true', () => {
    const p = property('always pass', (gen) => gen.int(0, 100), (n) => n >= 0);
    const r = traitPropertyTest('t', [p], { numCases: 50, seed: 42 });
    expect(r.passed).toBe(true);
  });

  it('result.properties has one entry per property', () => {
    const p1 = property('p1', (gen) => gen.int(0, 10), () => true);
    const p2 = property('p2', (gen) => gen.bool(), () => true);
    const r = traitPropertyTest('t', [p1, p2], { numCases: 10, seed: 1 });
    expect(r.properties).toHaveLength(2);
    expect(r.properties[0].name).toBe('p1');
    expect(r.properties[1].name).toBe('p2');
  });

  it('each PropertyResult shows correct casesRun', () => {
    const p = property('p', (gen) => gen.int(0, 10), () => true);
    const r = traitPropertyTest('t', [p], { numCases: 30, seed: 5 });
    expect(r.properties[0].casesRun).toBe(30);
    expect(r.totalCases).toBe(30);
  });

  it('totalCases sums across all properties', () => {
    const p1 = property('p1', (gen) => gen.int(0, 10), () => true);
    const p2 = property('p2', (gen) => gen.int(0, 10), () => true);
    const r = traitPropertyTest('t', [p1, p2], { numCases: 20, seed: 1 });
    expect(r.totalCases).toBe(40);
  });

  it('passed PropertyResult has no counterexample or error', () => {
    const p = property('clean', (gen) => gen.float(0, 1), (v) => v >= 0 && v <= 1);
    const r = traitPropertyTest('t', [p], { numCases: 50, seed: 10 });
    expect(r.properties[0].passed).toBe(true);
    expect(r.properties[0].counterexample).toBeUndefined();
    expect(r.properties[0].error).toBeUndefined();
  });

  it('is deterministic with the same seed', () => {
    const p = property('det', (gen) => gen.float(0, 1), () => true);
    const r1 = traitPropertyTest('t', [p], { numCases: 100, seed: 777 });
    const r2 = traitPropertyTest('t', [p], { numCases: 100, seed: 777 });
    expect(r1.totalCases).toBe(r2.totalCases);
    expect(r1.passed).toBe(r2.passed);
  });
});

// =============================================================================
// traitPropertyTest() – failing properties
// =============================================================================

describe('traitPropertyTest() – failing properties', () => {
  it('fails when predicate always returns false', () => {
    const p = property('always fail', (gen) => gen.int(0, 100), () => false);
    const r = traitPropertyTest('t', [p], { numCases: 10, seed: 1 });
    expect(r.passed).toBe(false);
  });

  it('result shows passed=false for the failing property', () => {
    const p = property('fail-prop', (gen) => gen.int(0, 5), () => false);
    const r = traitPropertyTest('t', [p], { numCases: 5, seed: 2 });
    expect(r.properties[0].passed).toBe(false);
  });

  it('provides an error message describing which case failed', () => {
    const p = property('failing', (gen) => gen.int(0, 10), () => false);
    const r = traitPropertyTest('t', [p], { numCases: 10, seed: 3 });
    expect(r.properties[0].error).toContain('failed on case');
    expect(r.properties[0].error).toContain('failing');
  });

  it('provides a counterexample', () => {
    const p = property('needs-counterex', (gen) => gen.int(5, 10), (n) => n < 3);
    const r = traitPropertyTest('t', [p], { numCases: 5, seed: 4 });
    expect(r.properties[0].counterexample).toBeDefined();
  });

  it('stops early on first failure — casesRun < numCases', () => {
    const p = property('early-stop', (gen) => gen.int(0, 10), () => false);
    const r = traitPropertyTest('t', [p], { numCases: 100, seed: 5 });
    // Fails on case 1
    expect(r.properties[0].casesRun).toBeLessThan(100);
  });

  it('all-passed is false when any property fails', () => {
    const good = property('good', (gen) => gen.int(0, 10), () => true);
    const bad = property('bad', (gen) => gen.int(0, 10), () => false);
    const r = traitPropertyTest('t', [good, bad], { numCases: 10, seed: 6 });
    expect(r.passed).toBe(false);
  });

  it('handles predicate throwing an exception as failure', () => {
    const p = property(
      'throws',
      (gen) => gen.int(0, 10),
      () => { throw new Error('predicate boom'); }
    );
    const r = traitPropertyTest('t', [p], { numCases: 5, seed: 7 });
    expect(r.passed).toBe(false);
    expect(r.properties[0].passed).toBe(false);
    expect(r.properties[0].error).toContain('threw');
  });
});

// =============================================================================
// traitPropertyTest() – shrinking
// =============================================================================

describe('traitPropertyTest() – shrinking', () => {
  it('shrinks counterexample when shrink function is provided', () => {
    // Property fails for n >= 5; shrink tries n-1
    const p = property(
      'n < 5',
      (gen) => gen.int(5, 100),
      (n) => n < 5,
      (n) => (n > 5 ? [n - 1] : [])
    );
    const r = traitPropertyTest('t', [p], { numCases: 5, seed: 1 });
    expect(r.properties[0].passed).toBe(false);
    expect(r.properties[0].shrunkCounterexample).toBeDefined();
  });

  it('shrunkCounterexample is undefined when no shrink function', () => {
    const p = property('no-shrink-fn', (gen) => gen.int(0, 10), () => false);
    const r = traitPropertyTest('t', [p], { numCases: 3, seed: 1 });
    expect(r.properties[0].shrunkCounterexample).toBeUndefined();
  });

  it('respects maxShrinkAttempts', () => {
    let shrinkCalls = 0;
    const p = property(
      'shrink-count',
      (gen) => gen.int(10, 100),
      (n) => n < 10,
      (n) => { shrinkCalls++; return n > 1 ? [n - 1] : []; }
    );
    const r = traitPropertyTest('t', [p], {
      numCases: 5,
      seed: 1,
      maxShrinkAttempts: 5,
    });
    // Should have at most 5 shrink attempts
    expect(shrinkCalls).toBeLessThanOrEqual(5);
  });
});

// =============================================================================
// ValueGenerator via traitPropertyTest
// =============================================================================

describe('ValueGenerator.int', () => {
  it('generates integers in [min, max]', () => {
    const p = property('int range', (gen) => gen.int(3, 7), (n) => n >= 3 && n <= 7);
    const r = traitPropertyTest('t', [p], { numCases: 100, seed: 1 });
    expect(r.passed).toBe(true);
  });
});

describe('ValueGenerator.float', () => {
  it('generates floats in [min, max]', () => {
    const p = property('float range', (gen) => gen.float(0.5, 1.5), (n) => n >= 0.5 && n <= 1.5);
    const r = traitPropertyTest('t', [p], { numCases: 100, seed: 2 });
    expect(r.passed).toBe(true);
  });
});

describe('ValueGenerator.bool', () => {
  it('generates only booleans', () => {
    const p = property('is boolean', (gen) => gen.bool(), (b) => typeof b === 'boolean');
    const r = traitPropertyTest('t', [p], { numCases: 50, seed: 3 });
    expect(r.passed).toBe(true);
  });
});

describe('ValueGenerator.oneOf', () => {
  it('always picks from the provided values', () => {
    const choices = ['alpha', 'beta', 'gamma'];
    const p = property('oneOf', (gen) => gen.oneOf(choices), (v) => choices.includes(v));
    const r = traitPropertyTest('t', [p], { numCases: 100, seed: 4 });
    expect(r.passed).toBe(true);
  });
});

describe('ValueGenerator.string', () => {
  it('generates strings of exactly the given length', () => {
    const p = property('string length', (gen) => gen.string(8), (s) => s.length === 8);
    const r = traitPropertyTest('t', [p], { numCases: 50, seed: 5 });
    expect(r.passed).toBe(true);
  });

  it('generates strings of default length 8', () => {
    const p = property('default len', (gen) => gen.string(), (s) => s.length === 8);
    const r = traitPropertyTest('t', [p], { numCases: 20, seed: 6 });
    expect(r.passed).toBe(true);
  });
});

describe('ValueGenerator.color', () => {
  it('generates valid hex color strings', () => {
    const p = property(
      'hex color',
      (gen) => gen.color(),
      (c) => /^#[0-9a-f]{6}$/.test(c)
    );
    const r = traitPropertyTest('t', [p], { numCases: 50, seed: 7 });
    expect(r.passed).toBe(true);
  });
});

describe('ValueGenerator.vector3', () => {
  it('generates 3-element tuples', () => {
    const p = property('length 3', (gen) => gen.vector3(-10, 10), (v) => v.length === 3);
    const r = traitPropertyTest('t', [p], { numCases: 50, seed: 8 });
    expect(r.passed).toBe(true);
  });

  it('generates all finite values', () => {
    const p = property(
      'all finite',
      (gen) => gen.vector3(-100, 100),
      (v) => v.every((n) => isFinite(n))
    );
    const r = traitPropertyTest('t', [p], { numCases: 50, seed: 9 });
    expect(r.passed).toBe(true);
  });
});

describe('ValueGenerator.quaternion', () => {
  it('generates normalized quaternions (length ~1)', () => {
    const p = property(
      'normalized',
      (gen) => gen.quaternion(),
      (q) => {
        const len = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
        return Math.abs(len - 1) < 0.001;
      }
    );
    const r = traitPropertyTest('t', [p], { numCases: 100, seed: 10 });
    expect(r.passed).toBe(true);
  });

  it('generates 4-element tuples', () => {
    const p = property('length 4', (gen) => gen.quaternion(), (q) => q.length === 4);
    const r = traitPropertyTest('t', [p], { numCases: 50, seed: 11 });
    expect(r.passed).toBe(true);
  });
});

describe('ValueGenerator.array', () => {
  it('generates arrays of exactly the given length', () => {
    const p = property(
      'array length',
      (gen) => gen.array(5, () => gen.int(0, 10)),
      (arr) => arr.length === 5
    );
    const r = traitPropertyTest('t', [p], { numCases: 30, seed: 12 });
    expect(r.passed).toBe(true);
  });
});

// =============================================================================
// Pre-built property arrays
// =============================================================================

describe('PHYSICS_PROPERTIES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(PHYSICS_PROPERTIES)).toBe(true);
    expect(PHYSICS_PROPERTIES.length).toBeGreaterThan(0);
  });

  it('all properties have names', () => {
    for (const p of PHYSICS_PROPERTIES) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it('passes with valid inputs', () => {
    const r = traitPropertyTest('physics', PHYSICS_PROPERTIES, { numCases: 50, seed: 10 });
    expect(r.passed).toBe(true);
  });
});

describe('MATERIAL_PROPERTIES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MATERIAL_PROPERTIES)).toBe(true);
    expect(MATERIAL_PROPERTIES.length).toBeGreaterThan(0);
  });

  it('passes with valid inputs', () => {
    const r = traitPropertyTest('material', MATERIAL_PROPERTIES, { numCases: 50, seed: 11 });
    expect(r.passed).toBe(true);
  });
});

describe('TRANSFORM_PROPERTIES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(TRANSFORM_PROPERTIES)).toBe(true);
    expect(TRANSFORM_PROPERTIES.length).toBeGreaterThan(0);
  });

  it('passes with valid inputs', () => {
    const r = traitPropertyTest('transform', TRANSFORM_PROPERTIES, { numCases: 50, seed: 12 });
    expect(r.passed).toBe(true);
  });

  it('quaternion rotation property holds', () => {
    const quatProp = TRANSFORM_PROPERTIES.find((p) => p.name.includes('quaternion'));
    expect(quatProp).toBeDefined();
    if (quatProp) {
      const r = traitPropertyTest('quat', [quatProp], { numCases: 100, seed: 13 });
      expect(r.passed).toBe(true);
    }
  });
});
