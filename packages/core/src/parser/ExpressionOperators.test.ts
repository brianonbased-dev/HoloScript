import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';

// Helper: parse a single-property object and return its value
function parseProp(source: string, prop: string) {
  const parser = new HoloScriptPlusParser({ strict: false });
  const result = parser.parse(source);
  expect(result.success).toBe(true);
  const root = result.ast.root;
  const node = root.type === 'fragment' ? root.children![0] : root;
  return node.properties[prop];
}

// =============================================================================
// COMPARISON OPERATORS  (<, >, <=, >=)
// =============================================================================

describe('HoloScriptPlusParser - Comparison Operators', () => {
  it('parses less-than (<)', () => {
    const expr = parseProp(`object "T" { val: a < b }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('<');
    expect(expr.left.__ref).toBe('a');
    expect(expr.right.__ref).toBe('b');
  });

  it('parses greater-than (>)', () => {
    const expr = parseProp(`object "T" { val: x > 0 }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('>');
    expect(expr.right).toBe(0);
  });

  it('parses less-than-or-equal (<=)', () => {
    const expr = parseProp(`object "T" { val: speed <= maxSpeed }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('<=');
    expect(expr.left.__ref).toBe('speed');
    expect(expr.right.__ref).toBe('maxSpeed');
  });

  it('parses greater-than-or-equal (>=)', () => {
    const expr = parseProp(`object "T" { val: level >= 5 }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('>=');
    expect(expr.right).toBe(5);
  });

  it('comparison with numeric literals', () => {
    const expr = parseProp(`object "T" { inRange: count >= 0 }`, 'inRange');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('>=');
    expect(expr.left.__ref).toBe('count');
    expect(expr.right).toBe(0);
  });
});

// =============================================================================
// EQUALITY OPERATORS (==, !=)
// =============================================================================

describe('HoloScriptPlusParser - Equality Operators', () => {
  it('parses double-equals (==)', () => {
    const expr = parseProp(`object "T" { isAdmin: role == "admin" }`, 'isAdmin');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('==');
    expect(expr.left.__ref).toBe('role');
    expect(expr.right).toBe('admin');
  });

  it('parses not-equals (!=)', () => {
    const expr = parseProp(`object "T" { isDirty: saved != true }`, 'isDirty');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('!=');
    expect(expr.left.__ref).toBe('saved');
    expect(expr.right).toBe(true);
  });

  it('equality with null', () => {
    const expr = parseProp(`object "T" { isEmpty: value == null }`, 'isEmpty');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('==');
    expect(expr.right).toBeNull();
  });

  it('inequality with number', () => {
    const expr = parseProp(`object "T" { notZero: count != 0 }`, 'notZero');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('!=');
    expect(expr.right).toBe(0);
  });
});

// =============================================================================
// LOGICAL AND (&&) and LOGICAL OR (||)
// =============================================================================

describe('HoloScriptPlusParser - Logical AND (&&)', () => {
  it('parses logical AND', () => {
    const expr = parseProp(`object "T" { val: isReady && isActive }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('&&');
    expect(expr.left.__ref).toBe('isReady');
    expect(expr.right.__ref).toBe('isActive');
  });

  it('parses chained AND (left-associative)', () => {
    // a && b && c  =>  (a && b) && c
    const expr = parseProp(`object "T" { val: a && b && c }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('&&');
    // Right side is 'c'
    expect(expr.right.__ref).toBe('c');
    // Left side is (a && b)
    expect(expr.left.type).toBe('binary');
    expect(expr.left.operator).toBe('&&');
    expect(expr.left.left.__ref).toBe('a');
    expect(expr.left.right.__ref).toBe('b');
  });

  it('AND with boolean literals', () => {
    const expr = parseProp(`object "T" { val: enabled && true }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('&&');
    expect(expr.right).toBe(true);
  });
});

describe('HoloScriptPlusParser - Logical OR (||)', () => {
  it('parses logical OR', () => {
    const expr = parseProp(`object "T" { val: hasOverride || useDefault }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('||');
    expect(expr.left.__ref).toBe('hasOverride');
    expect(expr.right.__ref).toBe('useDefault');
  });

  it('parses chained OR (left-associative)', () => {
    const expr = parseProp(`object "T" { val: a || b || c }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('||');
    expect(expr.right.__ref).toBe('c');
    expect(expr.left.type).toBe('binary');
    expect(expr.left.operator).toBe('||');
  });

  it('OR with string fallback', () => {
    const expr = parseProp(`object "T" { val: userName || "Guest" }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('||');
    expect(expr.right).toBe('Guest');
  });
});

// =============================================================================
// PRECEDENCE: && binds tighter than ||
// =============================================================================

describe('HoloScriptPlusParser - Logical Operator Precedence', () => {
  it('&& binds tighter than || (a || b && c  =>  a || (b && c))', () => {
    const expr = parseProp(`object "T" { val: a || b && c }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('||');
    expect(expr.left.__ref).toBe('a');
    // Right side is (b && c)
    expect(expr.right.type).toBe('binary');
    expect(expr.right.operator).toBe('&&');
    expect(expr.right.left.__ref).toBe('b');
    expect(expr.right.right.__ref).toBe('c');
  });

  it('== binds tighter than && (a && b == c  =>  a && (b == c))', () => {
    const expr = parseProp(`object "T" { val: a && b == c }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('&&');
    expect(expr.left.__ref).toBe('a');
    expect(expr.right.type).toBe('binary');
    expect(expr.right.operator).toBe('==');
  });

  it('comparison binds tighter than == (a < b == c < d  =>  (a < b) == (c < d))', () => {
    const expr = parseProp(`object "T" { val: a < b == c < d }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('==');
    expect(expr.left.operator).toBe('<');
    expect(expr.right.operator).toBe('<');
  });

  it('full precedence chain: a || b && c == d < e', () => {
    // Should parse as: a || (b && (c == (d < e)))
    const expr = parseProp(`object "T" { val: a || b && c == d < e }`, 'val');
    expect(expr.operator).toBe('||');
    expect(expr.left.__ref).toBe('a');
    const andExpr = expr.right;
    expect(andExpr.operator).toBe('&&');
    expect(andExpr.left.__ref).toBe('b');
    const eqExpr = andExpr.right;
    expect(eqExpr.operator).toBe('==');
    expect(eqExpr.left.__ref).toBe('c');
    const ltExpr = eqExpr.right;
    expect(ltExpr.operator).toBe('<');
  });
});

// =============================================================================
// LOGICAL NOT (!)
// =============================================================================

describe('HoloScriptPlusParser - Logical NOT (!)', () => {
  it('parses logical NOT', () => {
    const expr = parseProp(`object "T" { val: !isActive }`, 'val');
    expect(expr.type).toBe('unary');
    expect(expr.operator).toBe('!');
    expect(expr.argument.__ref).toBe('isActive');
  });

  it('parses double NOT (!!)', () => {
    const expr = parseProp(`object "T" { val: !!value }`, 'val');
    expect(expr.type).toBe('unary');
    expect(expr.operator).toBe('!');
    expect(expr.argument.type).toBe('unary');
    expect(expr.argument.operator).toBe('!');
    expect(expr.argument.argument.__ref).toBe('value');
  });

  it('NOT with boolean literal', () => {
    const expr = parseProp(`object "T" { val: !true }`, 'val');
    expect(expr.type).toBe('unary');
    expect(expr.operator).toBe('!');
    expect(expr.argument).toBe(true);
  });

  it('NOT in logical expression: !a && b', () => {
    const expr = parseProp(`object "T" { val: !a && b }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('&&');
    expect(expr.left.type).toBe('unary');
    expect(expr.left.operator).toBe('!');
    expect(expr.right.__ref).toBe('b');
  });
});

// =============================================================================
// TEMPLATE LITERALS
// =============================================================================

describe('HoloScriptPlusParser - Template Literals', () => {
  it('parses a simple template literal', () => {
    const parser = new HoloScriptPlusParser({ strict: false });
    const source = 'object "T" { msg: `Hello World` }';
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.msg;
    expect(expr.type).toBe('templateLiteral');
    expect(expr.value).toContain('Hello World');
  });

  it('parses a template literal with interpolation', () => {
    const parser = new HoloScriptPlusParser({ strict: false });
    const source = 'object "T" { msg: `Score: ${score}` }';
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.msg;
    expect(expr.type).toBe('templateLiteral');
    expect(expr.value).toContain('${score}');
  });

  it('parses empty template literal', () => {
    const parser = new HoloScriptPlusParser({ strict: false });
    const source = 'object "T" { msg: `` }';
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.msg;
    expect(expr.type).toBe('templateLiteral');
    expect(expr.value).toBe('');
  });

  it('template literal with multiple interpolations', () => {
    const parser = new HoloScriptPlusParser({ strict: false });
    const source = 'object "T" { label: `${firstName} ${lastName}` }';
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.label;
    expect(expr.type).toBe('templateLiteral');
    expect(expr.value).toContain('${firstName}');
    expect(expr.value).toContain('${lastName}');
  });
});

// =============================================================================
// OPTIONAL CHAINING (?.)
// =============================================================================

describe('HoloScriptPlusParser - Optional Chaining (?.)', () => {
  it('parses optional chaining on object', () => {
    const expr = parseProp(`object "T" { val: user?.name }`, 'val');
    expect(expr.__ref).toBe('user?.name');
  });

  it('parses multiple optional chains', () => {
    const expr = parseProp(`object "T" { val: a?.b?.c }`, 'val');
    expect(expr.__ref).toBe('a?.b?.c');
  });

  it('optional chain mixed with regular dot access', () => {
    const expr = parseProp(`object "T" { val: config?.settings.theme }`, 'val');
    expect(expr.__ref).toBe('config?.settings.theme');
  });
});

// =============================================================================
// COMPUTED MEMBER ACCESS (obj[key])
// =============================================================================

describe('HoloScriptPlusParser - Computed Member Access (obj[key])', () => {
  it('parses computed member with string key', () => {
    const expr = parseProp(`object "T" { val: scores["player1"] }`, 'val');
    expect(expr.type).toBe('computedMember');
    expect(expr.object.__ref).toBe('scores');
    expect(expr.property).toBe('player1');
  });

  it('parses computed member with identifier key', () => {
    const expr = parseProp(`object "T" { val: data[key] }`, 'val');
    expect(expr.type).toBe('computedMember');
    expect(expr.object.__ref).toBe('data');
    expect(expr.property.__ref).toBe('key');
  });

  it('parses computed member with numeric index', () => {
    const expr = parseProp(`object "T" { val: items[0] }`, 'val');
    expect(expr.type).toBe('computedMember');
    expect(expr.object.__ref).toBe('items');
    expect(expr.property).toBe(0);
  });

  it('parses computed member with dotted object', () => {
    const expr = parseProp(`object "T" { val: state.scores[playerId] }`, 'val');
    expect(expr.type).toBe('computedMember');
    expect(expr.object.__ref).toBe('state.scores');
    expect(expr.property.__ref).toBe('playerId');
  });
});

// =============================================================================
// COMBINED EXPRESSIONS
// =============================================================================

describe('HoloScriptPlusParser - Combined Expression Scenarios', () => {
  it('logical operators with comparison in ternary condition', () => {
    const expr = parseProp(`object "T" { msg: a > 0 && b < 10 ? "in range" : "out" }`, 'msg');
    expect(expr.type).toBe('ternary');
    expect(expr.condition.operator).toBe('&&');
    expect(expr.trueValue).toBe('in range');
    expect(expr.falseValue).toBe('out');
  });

  it('NOT combined with equality', () => {
    const expr = parseProp(`object "T" { val: !done && status == "active" }`, 'val');
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('&&');
    expect(expr.left.type).toBe('unary');
    expect(expr.left.operator).toBe('!');
    expect(expr.right.operator).toBe('==');
  });

  it('OR chain with null coalescing (?? is lower precedence than || in HoloScript)', () => {
    const expr = parseProp(`object "T" { val: a || b ?? "default" }`, 'val');
    // In HoloScript: ?? has lower precedence than ||
    // parseNullCoalesce calls parseLogicalOr, so:
    // a || b ?? "default"  =>  (a || b) ?? "default"
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('??');
    expect(expr.left.type).toBe('binary');
    expect(expr.left.operator).toBe('||');
    expect(expr.left.left.__ref).toBe('a');
    expect(expr.left.right.__ref).toBe('b');
    expect(expr.right).toBe('default');
  });

  it('parses complex VR-style condition', () => {
    const source = `
    object "Player" {
      canInteract: isNearby && !isFrozen && health > 0
    }`;
    const parser = new HoloScriptPlusParser({ strict: false });
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;
    const expr = node.properties.canInteract;
    // isNearby && (!isFrozen && health > 0) or (isNearby && !isFrozen) && (health > 0)
    // Either way it's a binary && at the top
    expect(expr.type).toBe('binary');
    expect(expr.operator).toBe('&&');
  });
});
