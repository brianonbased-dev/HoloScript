import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

describe('Null Coalescing Assignment Integration Test', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  test('should parse ??= in logic block', () => {
    const source = `
      logic {
        function init() {
          value ??= 42
          config.setting ??= "default"
        }
      }
    `;

    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should parse ??= in property values', () => {
    const source = `
      orb item {
        defaultValue: (x ??= 10)
      }
    `;

    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should parse ??= in config blocks', () => {
    const source = `
      config MyConfig {
        setting: (value ??= "fallback")
      }
    `;

    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
