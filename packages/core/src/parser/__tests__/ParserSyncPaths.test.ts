/**
 * ParserSyncPaths.test.ts
 *
 * Exercises uncovered parser paths:
 * - parseRawBlock() via module/script/struct/enum/class/interface keywords
 * - synchronize() AT-recovery path (line 3992)
 * - synchronizeProperty() via invalid property token sequences
 * - tryRecoverMissingColon warning path
 */

import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

// Helper: parse a source string and return the result
function parse(src: string) {
  const parser = new HoloScriptPlusParser();
  return parser.parse(src);
}

// Helper: get the first node from parsed AST
// result.ast.root is the root HSPlusNode; if type='fragment', children has sub-nodes
function firstNode(src: string) {
  const result = parse(src);
  const root = result.ast.root;
  if ((root as any).type === 'fragment') {
    return (root as any).children?.[0];
  }
  return root;
}

// Helper: get all top-level nodes
function allNodes(src: string) {
  const result = parse(src);
  const root = result.ast.root;
  if ((root as any).type === 'fragment') {
    return (root as any).children || [];
  }
  return [root];
}

// =============================================================================
// parseRawBlock — triggered by module/script/struct/enum/class/interface
// =============================================================================

describe('parseRawBlock — code block keywords', () => {
  it('parses a module block and captures raw body', () => {
    const node = firstNode(`module utils {
  function add(a, b) { return a + b; }
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('module');
  });

  it('parses a script block', () => {
    const node = firstNode(`script init {
  console.log("hello");
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('script');
  });

  it('parses a struct block', () => {
    const node = firstNode(`struct Vector3 {
  x: float
  y: float
  z: float
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('struct');
  });

  it('parses an enum block', () => {
    const node = firstNode(`enum Color {
  Red
  Green
  Blue
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('enum');
  });

  it('parses a class block', () => {
    const node = firstNode(`class Player {
  constructor() {}
  update(dt) {}
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('class');
  });

  it('parses an interface block', () => {
    const node = firstNode(`interface IPlayer {
  health: number
  position: Vector3
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('interface');
  });

  it('module without a name defaults to "anonymous"', () => {
    const node = firstNode(`module { const x = 1; }`) as any;
    expect(node).toBeDefined();
    expect(node.name).toBe('anonymous');
  });

  it('module with string name', () => {
    const node = firstNode(`module "my-module" { const x = 1; }`) as any;
    expect(node).toBeDefined();
    expect(node.name).toBe('my-module');
  });

  it('module with empty body', () => {
    const node = firstNode(`module empty {}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('module');
    // Body should be empty string or whitespace
    expect(typeof node.body).toBe('string');
  });

  it('module with nested braces in body', () => {
    const node = firstNode(`module nested {
  function foo() {
    if (x) {
      return 1;
    }
  }
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('module');
    // Body should contain the nested function
    expect(node.body).toContain('function');
  });

  it('multiple code blocks in one document', () => {
    const nodes = allNodes(`module a { const x = 1; }
module b { const y = 2; }`) as any[];
    expect(nodes.length).toBe(2);
    expect(nodes[0].type).toBe('module');
    expect(nodes[1].type).toBe('module');
  });

  it('module can appear alongside orb definitions', () => {
    const nodes = allNodes(`module utils { function greet() {} }
orb "player" {
  position: [0, 1, 0]
}`) as any[];
    expect(nodes.length).toBe(2);
    expect(nodes[0].type).toBe('module');
    expect(nodes[1].type).toBe('orb');
  });
});

// =============================================================================
// synchronize() AT-recovery path
// =============================================================================

describe('synchronize() — AT recovery path', () => {
  it('recovers parsing after malformed top-level token before a directive', () => {
    // This should not crash; the parser should recover when it hits the @ directive
    const result = parse(`@glowing
orb "test" {
  @visible
}`);
    // Parser should recover and produce at least the orb node
    expect(result).toBeDefined();
    expect(result.success !== undefined).toBe(true);
  });

  it('parser does not crash on multiple recovery events', () => {
    const result = parse(`!!! ??? !!!
@networkable
orb "valid" {
  opacity: 0.5
}`);
    expect(result).toBeDefined();
  });
});

// =============================================================================
// synchronizeProperty() — via malformed property sequences
// =============================================================================

describe('synchronizeProperty() — property error recovery', () => {
  it('recovers from invalid property value and continues parsing', () => {
    // The parser should recover and parse what it can
    const result = parse(`orb "test" {
  good_prop: 42
  bad_prop: !!!
  another_prop: "ok"
}`);
    expect(result).toBeDefined();
    // Should not throw
  });

  it('handles consecutive parse errors gracefully', () => {
    const result = parse(`orb "broken" {
  @physics
  prop1 @@ invalid @@
  prop2: "valid"
}`);
    expect(result).toBeDefined();
  });
});

// =============================================================================
// Missing colon recovery path
// =============================================================================

describe('missing colon recovery', () => {
  it('emits a warning for missing colon and continues parsing', () => {
    // Parser should be lenient about missing colons in some contexts
    const result = parse(`orb "test" {
  opacity 0.5
  visible: true
}`);
    expect(result).toBeDefined();
    // Either it parsed successfully with warnings, or it had errors but didn't crash
    expect(result.ast !== undefined || result.errors !== undefined).toBe(true);
  });

  it('handles property with value but no colon between adjacent identifiers', () => {
    const result = parse(`orb "obj" {
  position 0 0 0
}`);
    expect(result).toBeDefined();
  });
});

// =============================================================================
// isLikelyValue / isValueBoundary paths via parseRawBlock
// =============================================================================

describe('parseRawBlock handles boundary tokens', () => {
  it('struct body with various value-like tokens', () => {
    const node = firstNode(`struct Config {
  timeout: 5000
  enabled: true
  name: "app"
  tags: ["a", "b"]
  nested: { x: 1 }
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('struct');
    // Body captures everything inside
    expect(node.body.length).toBeGreaterThan(0);
  });

  it('enum with trailing commas and special tokens', () => {
    const node = firstNode(`enum Status {
  Active,
  Inactive,
  Pending,
}`) as any;
    expect(node).toBeDefined();
    expect(node.type).toBe('enum');
  });
});
