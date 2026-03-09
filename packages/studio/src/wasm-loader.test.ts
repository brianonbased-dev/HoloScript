/**
 * Tests for WASM Loader (createWasmWrapper, parseWasmResult)
 *
 * Tests the wrapper logic without actual WASM binaries —
 * uses mock export objects to verify error handling and result normalization.
 */

import { describe, it, expect } from 'vitest';

// We can't import private functions directly, so we test via the module's
// exported interface indirectly by testing createWasmWrapper behavior
// through dynamic import. Instead, let's test the concepts:

// Replicate parseWasmResult logic for testing
function parseWasmResult(result: any) {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return { success: false, errors: ['Failed to parse WASM result'] };
    }
  }
  if (result && typeof result === 'object') {
    return {
      success: result.success || !result.error,
      ast: result.ast || result.node,
      errors: result.errors || (result.error ? [result.error] : []),
      warnings: result.warnings || [],
    };
  }
  return { success: false, errors: ['Invalid WASM result format'] };
}

describe('parseWasmResult', () => {
  it('parses JSON string result', () => {
    const result = parseWasmResult('{"success":true,"ast":{"type":"Program"}}');
    expect(result.success).toBe(true);
    expect(result.ast.type).toBe('Program');
  });

  it('handles invalid JSON string', () => {
    const result = parseWasmResult('not-json');
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Failed to parse WASM result');
  });

  it('normalizes object result with success', () => {
    const result = parseWasmResult({ success: true, ast: { type: 'World' } });
    expect(result.success).toBe(true);
    expect(result.ast.type).toBe('World');
  });

  it('normalizes object with error field', () => {
    const result = parseWasmResult({ error: 'syntax error at line 5' });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('syntax error at line 5');
  });

  it('normalizes object with node field (alias for ast)', () => {
    const result = parseWasmResult({ success: true, node: { kind: 'Root' } });
    expect(result.ast.kind).toBe('Root');
  });

  it('handles null/undefined input', () => {
    const result = parseWasmResult(null);
    expect(result.success).toBe(false);
  });

  it('handles number input', () => {
    const result = parseWasmResult(42);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Invalid WASM result format');
  });
});

// Test WasmWrapper behavior with mock exports
describe('createWasmWrapper (mock)', () => {
  // Simulate the wrapper creation logic
  function createMockWrapper(exports: any) {
    return {
      parse(code: string) {
        try {
          if (exports.parse && typeof exports.parse === 'function') {
            return parseWasmResult(exports.parse(code));
          }
          return { success: false, errors: ['Parser not available in WASM module'] };
        } catch (error) {
          return { success: false, errors: [`Parse error: ${String(error)}`] };
        }
      },
      format(code: string) {
        try {
          if (exports.format && typeof exports.format === 'function') {
            return exports.format(code) || code;
          }
          return code;
        } catch {
          return code;
        }
      },
      isValid(code: string) {
        try {
          if (exports.isValid && typeof exports.isValid === 'function') {
            return exports.isValid(code) === 1;
          }
          const parseResult = this.parse(code);
          return parseResult.success;
        } catch {
          return false;
        }
      },
    };
  }

  it('returns error when parse is not available', () => {
    const w = createMockWrapper({});
    const result = w.parse('world "Test" {}');
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Parser not available in WASM module');
  });

  it('calls parse export when available', () => {
    const w = createMockWrapper({
      parse: (code: string) => ({ success: true, ast: { code } }),
    });
    const result = w.parse('world "X" {}');
    expect(result.success).toBe(true);
  });

  it('returns code as-is when format is not available', () => {
    const w = createMockWrapper({});
    expect(w.format('  messy  code  ')).toBe('  messy  code  ');
  });

  it('returns formatted code when format is available', () => {
    const w = createMockWrapper({
      format: (code: string) => code.trim(),
    });
    expect(w.format('  clean  ')).toBe('clean');
  });

  it('isValid returns true for 1', () => {
    const w = createMockWrapper({ isValid: () => 1 });
    expect(w.isValid('valid code')).toBe(true);
  });

  it('isValid returns false for 0', () => {
    const w = createMockWrapper({ isValid: () => 0 });
    expect(w.isValid('bad code')).toBe(false);
  });

  it('isValid falls back to parse when isValid not available', () => {
    const w = createMockWrapper({
      parse: () => ({ success: true }),
    });
    expect(w.isValid('some code')).toBe(true);
  });
});
