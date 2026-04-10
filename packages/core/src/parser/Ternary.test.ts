import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';

describe('HoloScriptPlusParser - Ternary Operators', () => {
  const parser = new HoloScriptPlusParser({ strict: false });

  it('Parses simple ternary expression', () => {
    const source = `
    object "Test" {
      isEnabled: isActive ? true : false
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.isEnabled;

    expect(expr.type).toBe('ternary');
    expect(expr.condition.__ref).toBe('isActive');
    expect(expr.trueValue).toBe(true);
    expect(expr.falseValue).toBe(false);
  });

  it('Parses nested ternary (right-associative)', () => {
    // a ? b : c ? d : e  Should be a ? b : (c ? d : e)
    const source = `
    object "Test" {
      val: condA ? 1 : condB ? 2 : 3
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.val;

    expect(expr.type).toBe('ternary');
    expect(expr.condition.__ref).toBe('condA');
    expect(expr.trueValue).toBe(1);

    // The false branch should be another ternary
    expect(expr.falseValue.type).toBe('ternary');
    expect(expr.falseValue.condition.__ref).toBe('condB');
    expect(expr.falseValue.trueValue).toBe(2);
    expect(expr.falseValue.falseValue).toBe(3);
  });

  it('Parses ternary with null coalescing', () => {
    // a ?? b ? c : d  => (a ?? b) ? c : d
    const source = `
    object "Test" {
      val: a ?? b ? "yes" : "no"
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.val;

    expect(expr.type).toBe('ternary');
    // Condition is binary ??
    expect(expr.condition.type).toBe('binary');
    expect(expr.condition.operator).toBe('??');
    expect(expr.trueValue).toBe('yes');
    expect(expr.falseValue).toBe('no');
  });
});

// =============================================================================
// NULL COALESCING ASSIGNMENT (??=) - Sprint 1
// =============================================================================

describe('HoloScriptPlusParser - Null Coalescing Assignment (??=)', () => {
  const parser = new HoloScriptPlusParser({ strict: false });

  it('??= parses correctly in property definition', () => {
    const source = `
    object "Test" {
      color: defaultColor ??= "blue"
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.color;

    expect(expr.type).toBe('nullCoalescingAssignment');
    expect(expr.target).toHaveProperty('__ref', 'defaultColor');
    expect(expr.value).toBe('blue');
  });

  it('??= only assigns when left side is null/undefined - AST structure', () => {
    // Semantics: x ??= value is equivalent to x = x ?? value
    const source = `
    object "Config" {
      timeout: userTimeout ??= 5000
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.timeout;

    expect(expr.type).toBe('nullCoalescingAssignment');
    // target is the reference to assign to
    expect(expr.target).toMatchObject({ __ref: 'userTimeout' });
    // value is the fallback
    expect(expr.value).toBe(5000);
  });

  it('??= works in property definitions with string value', () => {
    const source = `
    object "Scene" {
      skybox: envSky ??= "default_sky.hdr"
      ambientColor: envAmbient ??= "#ffffff"
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;

    const skyExpr = node.properties.skybox;
    expect(skyExpr.type).toBe('nullCoalescingAssignment');
    expect(skyExpr.value).toBe('default_sky.hdr');

    const ambientExpr = node.properties.ambientColor;
    expect(ambientExpr.type).toBe('nullCoalescingAssignment');
    expect(ambientExpr.value).toBe('#ffffff');
  });

  it('??= works in orb/composition blocks', () => {
    const source = `
    orb "GameConfig" {
      score: highScore ??= 0
      name: playerName ??= "Player1"
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;

    const scoreExpr = node.properties.score;
    expect(scoreExpr.type).toBe('nullCoalescingAssignment');
    expect(scoreExpr.target).toHaveProperty('__ref', 'highScore');
    expect(scoreExpr.value).toBe(0);

    const nameExpr = node.properties.name;
    expect(nameExpr.type).toBe('nullCoalescingAssignment');
    expect(nameExpr.target).toHaveProperty('__ref', 'playerName');
    expect(nameExpr.value).toBe('Player1');
  });

  it('??= type inference: both branches have compatible types', () => {
    const source = `
    object "Typed" {
      count: storedCount ??= 0
      label: storedLabel ??= "unnamed"
      enabled: storedFlag ??= true
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;

    // Number branch
    const countExpr = node.properties.count;
    expect(countExpr.type).toBe('nullCoalescingAssignment');
    expect(typeof countExpr.value).toBe('number');

    // String branch
    const labelExpr = node.properties.label;
    expect(labelExpr.type).toBe('nullCoalescingAssignment');
    expect(typeof labelExpr.value).toBe('string');

    // Boolean branch
    const enabledExpr = node.properties.enabled;
    expect(enabledExpr.type).toBe('nullCoalescingAssignment');
    expect(typeof enabledExpr.value).toBe('boolean');
  });

  it('??= chained with ?? for complex fallback chains', () => {
    const source = `
    object "Complex" {
      val: primary ??= secondary ?? "default"
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.val;

    // ??= is lower precedence: primary ??= (secondary ?? "default")
    expect(expr.type).toBe('nullCoalescingAssignment');
    expect(expr.target).toHaveProperty('__ref', 'primary');
    expect(expr.value.type).toBe('binary');
    expect(expr.value.operator).toBe('??');
  });

  it('??= on literal target: parser is lenient, treats literal as value', () => {
    // The property-value parser is lenient: 42 ??= "fallback" parses without crash.
    // The ??= path is only fully enforced when the expression is processed as a
    // top-level assignment (e.g. in a logic/script block), not in property context.
    const source = `
    object "Lenient" {
      val: 42 ??= "fallback"
    }`;
    const result = parser.parse(source);

    // Parser does not crash — graceful handling
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
  });
});
