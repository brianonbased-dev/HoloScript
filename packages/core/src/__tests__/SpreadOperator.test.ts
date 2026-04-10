import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

describe('Spread Operator', () => {
  const parser = new HoloScriptPlusParser();

  it('should parse object spread syntax', () => {
    const code = `
      template "Base" {
        color: "red"
      }

      object "Derived" {
        ...Base
        scale: 2.0
      }
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);

    const obj = result.ast.children[1]; // Derived object
    const spreadNode = obj.children?.find((n) => n.type === 'spread');

    expect(spreadNode).toBeDefined();
    expect(spreadNode?.target).toBe('Base');
  });

  it('should parse spread in array literals', () => {
    const code = `
      object "Container" {
        children: [
          ...otherChildren,
          object "NewChild" {}
        ]
      }
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
    // Note: Array parsing details might vary, checking basic success first
  });

  it('should fail on invalid spread syntax', () => {
    const code = `
      object "Invalid" {
        ...
      }
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(false);
  });
});
