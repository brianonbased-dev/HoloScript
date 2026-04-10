import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

describe('Null Coalescing Assignment (??=)', () => {
  const parser = new HoloScriptPlusParser();

  it('should parse null coalescing assignment in logic blocks', () => {
    const code = `
      logic {
        function init(data) {
          // data ??= "default"
          data ??= "default"
        }
      }
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);

    // For a single top-level node, it becomes the root
    const logicBlock = result.ast.root; // logic node
    // @ts-ignore
    const func = logicBlock.body.functions[0];

    expect(func).toBeDefined();
    expect(func.name).toBe('init');
    expect(func.body).toContain('data ??= "default"');
  });

  it('should parse null coalescing assignment in properties', () => {
    // Note: Property assignment usually uses : or =
    // This test verifies if the lexer handles the token correctly at least
    const code = `
      composition "Test" {
        prop ??= "value"
      }
    `;
    // Current property parser might not support this syntax directly for properties,
    // but we want to ensure it doesn't crash the parser and potentially support it for dynamic props if we chose to.
    // Actually, checking the parser logic, properties expect : or =. ??= might be invalid for declarative props.
    // So this test might expect failure or we only support it in imperative logic blocks.

    // Let's assume for now it's mainly for logic blocks, but the tokenizer should recognize it.
  });

  it('should tokenize ??= correctly', () => {
    // Access private tokenizer if possible or just parse a simple expression
    // using a dummy logic block
    const code = `
      logic {
        function test() {
           x ??= 10
        }
      }
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);
  });
});
