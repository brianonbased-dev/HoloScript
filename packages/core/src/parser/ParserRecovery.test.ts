import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';

const fs = require('fs');

describe('HoloScriptPlusParser - Error Recovery', () => {
  const parser = new HoloScriptPlusParser({ strict: false });

  it('Recovers from invalid property syntax within a node', () => {
    // 'color:' with no value is invalid if followed by invalid token,
    // but here we use '???' which should trigger error in value parsing
    const source = `
    object "Test" {
      color: ???
      size: 10
    }`;
    const result = parser.parse(source);

    // DEBUG LOG
    // fs.writeFileSync('recovery_debug.json', JSON.stringify(result, null, 2));

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    const node = result.ast.children?.[0] || result.ast.root;

    expect(node.properties.size).toBe(10);
  });

  it('Recovers from unknown token in node body', () => {
    // 'unknown_token' followed by garbage
    const source = `
    object "Test" {
      unknown_token ???
      visible: true
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(false);

    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;

    expect(node.properties.visible).toBe(true);
  });

  it('Recovers from malformed property value', () => {
    // Invalid hex without quotes might be parsed as number tokens?
    // Let's use something definitely wrong like a bad operator usage
    const source = `
    object "Test" {
      color: *&^%
      opacity: 0.5
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(false);

    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;

    // Expect opacity to be parsed
    expect(node.properties.opacity).toBe(0.5);
  });

  it('Parses valid children despite error in sibling property', () => {
    const source = `
    object "Parent" {
      broken_prop: ?
      object "Child" {}
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(false);

    const root = result.ast.root;
    const node = root.type === 'fragment' ? root.children![0] : root;

    // Debug info
    if (!node.children || node.children.length === 0) {
      console.log('Node properties:', node.properties);
    }

    expect(node.children).toBeDefined();
    expect(node.children!.length).toBeGreaterThan(0);
    expect(node.children![0].name).toBe('Child');
  });

  it('Recovers from multiple consecutive property errors', () => {
    const source = `
    object "Test" {
      prop1: ???
      prop2: ***
      prop3: 42
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    const node = result.ast.children?.[0] || result.ast.root;

    // Should still parse the valid property despite preceding errors
    expect(node.properties.prop3).toBe(42);
  });

  it('Recovers from errors in deeply nested structures', () => {
    const source = `
    object "Outer" {
      object "Middle" {
        object "Inner" {
          broken: &&&
          working: true
        }
      }
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(false);

    const outer = result.ast.children?.[0] || result.ast.root;
    const middle = outer.children?.[0];
    const inner = middle?.children?.[0];

    expect(inner).toBeDefined();
    expect(inner?.properties.working).toBe(true);
  });

  it('Recovers from errors in array/list values', () => {
    const source = `
    object "Test" {
      items: [1, ???, 3]
      color: "blue"
    }`;
    const result = parser.parse(source);

    expect(result.success).toBe(false);

    const node = result.ast.children?.[0] || result.ast.root;

    // Should still parse the valid property even though array had an error
    expect(node.properties.color).toBe('blue');
  });

  it('Recovers from errors in property names (malformed identifiers)', () => {
    const source = `
    object "Test" {
      123invalid: 10
      validProp: 20
    }`;
    const result = parser.parse(source);

    // This may or may not process the first line, but valid prop should parse
    const node = result.ast.children?.[0] || result.ast.root;
    expect(node.properties.validProp).toBe(20);
  });

  it('Recovers from errors in mixed property and method syntax', () => {
    const source = `
    object "Test" {
      invalid_method: ()
      size: 5
    }`;
    const result = parser.parse(source);

    const node = result.ast.children?.[0] || result.ast.root;
    expect(node.properties.size).toBe(5);
  });
});
