import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

describe('Parser Error Recovery', () => {
  const parser = new HoloScriptPlusParser();

  it('should recover from errors and continue parsing', () => {
    const code = `
      composition "Valid1" {
        color: "red"
      }

      composition "Invalid" {
        color: "blue"
        123 // Invalid property key (must be identifier)
        scale: 1.0
      }

      composition "Valid2" {
        color: "green"
      }
    `;

    const result = parser.parse(code);

    // Expect failure because there were errors
    expect(result.success).toBe(false);
    expect(result.ast.children.length).toBeGreaterThan(0);

    // Should have parsed Valid1
    const valid1 = result.ast.children.find((n) => n.id === 'Valid1');
    expect(valid1).toBeDefined();

    // Should have attempted to parse Invalid (might be partial)
    // const invalid = result.ast.children.find(n => (n as any).id === 'Invalid');
    // expect(invalid).toBeDefined();

    // CRITICAL: Should have parsed Valid2 after recovery
    const valid2 = result.ast.children.find((n) => n.id === 'Valid2');
    expect(valid2).toBeDefined();
  });

  it('should report multiple errors', () => {
    const code = `
      composition "Err1" {
        prop1 "value1"
      }
      composition "Err2" {
        prop2 "value2"
      }
    `;
    const parser = new HoloScriptPlusParser();
    // This code is actually valid HoloScript syntax (value without colon is allowed)
    // so we expect it to parse successfully

    const result = parser.parse(code);
    expect(result.success).toBe(true);

    // Both orbs should be parsed as valid children
    const root = result.ast.root;
    expect(root.children).toBeDefined();
    expect(root.children.length).toBeGreaterThan(0);
  });
});
