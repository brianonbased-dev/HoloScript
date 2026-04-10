import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';

describe('Language Modernization Features', () => {
  it('parses spread operator in objects', () => {
    const code = `
      object Test {
        ...baseConfig
        prop: "value"
      }
    `;
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);

    if (!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
    expect(result.success).toBe(true);
    const testObj = result.ast.children?.[0];

    // Check for spread in properties (spreads in object node properties are stored with __spread_ prefix)
    const props = testObj.properties || {};
    const hasSpread = Object.keys(props).some((k) => k.startsWith('__spread_'));
    expect(hasSpread).toBe(true);
  });

  it('parses null coalescing operator in values', () => {
    const code = `
      object Test {
        prop: config.val ?? "default"
      }
    `;
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);

    if (!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
    expect(result.success).toBe(true);
    const testObj = result.ast.children?.[0];

    const propValue = testObj.properties['prop'];
    expect(propValue.type).toBe('binary');
    expect(propValue.operator).toBe('??');
    expect(propValue.right).toBe('default');
  });

  it('parses null coalescing assignment in logic blocks (tokenization)', () => {
    const code = `
      logic {
        function test() {
           value ??= "default"
        }
      }
    `;
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);
    if (!result.success) console.log(JSON.stringify(result.errors, null, 2));
    expect(result.errors).toEqual([]);
  });
});
