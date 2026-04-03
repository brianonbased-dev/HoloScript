/**
 * Tests for the HoloScript WASM compiler TypeScript API layer.
 *
 * Since the WASM binary requires the Rust toolchain to build, these tests
 * mock the raw WASM module and verify:
 * - The TypeScript wrapper correctly delegates to the WASM exports
 * - JSON parse results are correctly typed
 * - Error handling and validation work as expected
 * - The API contract matches what the Rust lib.rs exports
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HoloScriptWasm,
  HoloScriptParseError,
  type HoloScriptWasmModule,
  type Ast,
  type ValidationResult,
} from '../wasm-api';

// ── Helpers ─────────────────────────────────────────────────────────

function createMockWasm(overrides?: Partial<HoloScriptWasmModule>): HoloScriptWasmModule {
  return {
    parse: vi.fn().mockReturnValue(JSON.stringify(VALID_AST)),
    parse_pretty: vi.fn().mockReturnValue(JSON.stringify(VALID_AST, null, 2)),
    validate: vi.fn().mockReturnValue(true),
    validate_detailed: vi.fn().mockReturnValue(
      JSON.stringify({ valid: true, errors: [] }),
    ),
    version: vi.fn().mockReturnValue('3.7.0'),
    ...overrides,
  };
}

const VALID_AST: Ast = {
  type: 'Program',
  body: [
    {
      type: 'Orb',
      name: 'cube',
      traits: [],
      properties: [
        {
          type: 'Property',
          key: 'color',
          value: { type: 'String', value: 'red' },
        },
      ],
      children: [],
    },
  ],
  directives: [],
};

const COMPOSITION_AST: Ast = {
  type: 'Program',
  body: [
    {
      type: 'Composition',
      name: 'VR Game',
      traits: [],
      properties: [],
      children: [
        {
          type: 'Environment',
          properties: [
            {
              type: 'Property',
              key: 'skybox',
              value: { type: 'String', value: 'nebula' },
            },
          ],
          children: [],
        },
        {
          type: 'Orb',
          name: 'player',
          traits: [{ type: 'Trait', name: 'grabbable' }],
          properties: [
            {
              type: 'Property',
              key: 'position',
              value: {
                type: 'Array',
                elements: [
                  { type: 'Number', value: 0, raw: '0' },
                  { type: 'Number', value: 1.6, raw: '1.6' },
                  { type: 'Number', value: 0, raw: '0' },
                ],
              },
            },
          ],
          children: [],
        },
      ],
    },
  ],
  directives: [],
};

const PARSE_ERRORS = {
  errors: [
    { message: 'Expected identifier after "orb"', line: 1, column: 5 },
  ],
};

// ── Tests ───────────────────────────────────────────────────────────

describe('HoloScriptWasm', () => {
  let mockWasm: HoloScriptWasmModule;
  let wrapper: HoloScriptWasm;

  beforeEach(() => {
    mockWasm = createMockWasm();
    wrapper = new HoloScriptWasm(mockWasm);
  });

  // ── parse() ─────────────────────────────────────────────────────

  describe('parse()', () => {
    it('should parse valid HoloScript source into a typed AST', () => {
      const result = wrapper.parse('orb cube { color: "red" }');

      expect(result.type).toBe('Program');
      expect(result.body).toHaveLength(1);
      expect(result.body[0].type).toBe('Orb');
      expect(mockWasm.parse).toHaveBeenCalledWith('orb cube { color: "red" }');
    });

    it('should return correct property values from parsed AST', () => {
      const result = wrapper.parse('orb cube { color: "red" }');
      const orb = result.body[0] as { type: string; properties: Array<{ key: string; value: { value: string } }> };

      expect(orb.properties[0].key).toBe('color');
      expect(orb.properties[0].value.value).toBe('red');
    });

    it('should handle composition with nested children', () => {
      mockWasm = createMockWasm({
        parse: vi.fn().mockReturnValue(JSON.stringify(COMPOSITION_AST)),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      const result = wrapper.parse('composition "VR Game" { }');

      expect(result.body[0].type).toBe('Composition');
      const composition = result.body[0] as { children: Array<{ type: string }> };
      expect(composition.children).toHaveLength(2);
      expect(composition.children[0].type).toBe('Environment');
      expect(composition.children[1].type).toBe('Orb');
    });

    it('should throw HoloScriptParseError on syntax errors', () => {
      mockWasm = createMockWasm({
        parse: vi.fn().mockReturnValue(JSON.stringify(PARSE_ERRORS)),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      expect(() => wrapper.parse('orb { missing name }')).toThrow(HoloScriptParseError);
    });

    it('should include structured errors in HoloScriptParseError', () => {
      mockWasm = createMockWasm({
        parse: vi.fn().mockReturnValue(JSON.stringify(PARSE_ERRORS)),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      try {
        wrapper.parse('orb { }');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HoloScriptParseError);
        const parseErr = err as HoloScriptParseError;
        expect(parseErr.errors).toHaveLength(1);
        expect(parseErr.errors[0].line).toBe(1);
        expect(parseErr.errors[0].column).toBe(5);
        expect(parseErr.errors[0].message).toContain('Expected identifier');
      }
    });

    it('should handle multiple parse errors', () => {
      const multiErrors = {
        errors: [
          { message: 'Unexpected token', line: 1, column: 1 },
          { message: 'Unclosed brace', line: 3, column: 10 },
        ],
      };
      mockWasm = createMockWasm({
        parse: vi.fn().mockReturnValue(JSON.stringify(multiErrors)),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      try {
        wrapper.parse('{{ broken');
        expect.fail('Should have thrown');
      } catch (err) {
        const parseErr = err as HoloScriptParseError;
        expect(parseErr.errors).toHaveLength(2);
        expect(parseErr.message).toContain('2 error(s)');
      }
    });

    it('should throw on invalid JSON from WASM', () => {
      mockWasm = createMockWasm({
        parse: vi.fn().mockReturnValue('not-json{{{'),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      expect(() => wrapper.parse('source')).toThrow();
    });

    it('should handle empty program body', () => {
      const emptyAst: Ast = { type: 'Program', body: [], directives: [] };
      mockWasm = createMockWasm({
        parse: vi.fn().mockReturnValue(JSON.stringify(emptyAst)),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      const result = wrapper.parse('');
      expect(result.body).toHaveLength(0);
      expect(result.type).toBe('Program');
    });
  });

  // ── parsePretty() ───────────────────────────────────────────────

  describe('parsePretty()', () => {
    it('should return pretty-printed JSON string', () => {
      const result = wrapper.parsePretty('orb cube { color: "red" }');

      expect(result).toContain('\n');
      expect(result).toContain('  ');
      const parsed = JSON.parse(result);
      expect(parsed.type).toBe('Program');
      expect(mockWasm.parse_pretty).toHaveBeenCalledWith('orb cube { color: "red" }');
    });

    it('should delegate directly to wasm.parse_pretty', () => {
      const prettyJson = '{\n  "type": "Program"\n}';
      mockWasm = createMockWasm({
        parse_pretty: vi.fn().mockReturnValue(prettyJson),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      const result = wrapper.parsePretty('source');
      expect(result).toBe(prettyJson);
    });
  });

  // ── validate() ──────────────────────────────────────────────────

  describe('validate()', () => {
    it('should return true for valid source', () => {
      expect(wrapper.validate('orb cube { @grabbable }')).toBe(true);
      expect(mockWasm.validate).toHaveBeenCalledWith('orb cube { @grabbable }');
    });

    it('should return false for invalid source', () => {
      mockWasm = createMockWasm({
        validate: vi.fn().mockReturnValue(false),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      expect(wrapper.validate('orb { missing name }')).toBe(false);
    });

    it('should return true for empty source', () => {
      expect(wrapper.validate('')).toBe(true);
      expect(mockWasm.validate).toHaveBeenCalledWith('');
    });
  });

  // ── validateDetailed() ──────────────────────────────────────────

  describe('validateDetailed()', () => {
    it('should return valid result with empty errors for valid source', () => {
      const result = wrapper.validateDetailed('orb test { color: "blue" }');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors with location info for invalid source', () => {
      const invalidResult: ValidationResult = {
        valid: false,
        errors: [
          { message: 'Expected identifier after "orb"', line: 1, column: 5 },
        ],
      };
      mockWasm = createMockWasm({
        validate_detailed: vi.fn().mockReturnValue(JSON.stringify(invalidResult)),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      const result = wrapper.validateDetailed('orb { }');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].line).toBe(1);
      expect(result.errors[0].column).toBe(5);
    });

    it('should include error message text', () => {
      const invalidResult: ValidationResult = {
        valid: false,
        errors: [
          { message: 'Unexpected end of input', line: 1, column: 20 },
        ],
      };
      mockWasm = createMockWasm({
        validate_detailed: vi.fn().mockReturnValue(JSON.stringify(invalidResult)),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      const result = wrapper.validateDetailed('orb test { color: ');
      expect(result.errors[0].message).toBe('Unexpected end of input');
    });
  });

  // ── version() ───────────────────────────────────────────────────

  describe('version()', () => {
    it('should return the WASM module version string', () => {
      expect(wrapper.version()).toBe('3.7.0');
    });

    it('should be a valid semver string', () => {
      const v = wrapper.version();
      expect(v).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should delegate to wasm.version()', () => {
      wrapper.version();
      expect(mockWasm.version).toHaveBeenCalledOnce();
    });
  });

  // ── HoloScriptParseError ────────────────────────────────────────

  describe('HoloScriptParseError', () => {
    it('should have correct name', () => {
      const err = new HoloScriptParseError('test', []);
      expect(err.name).toBe('HoloScriptParseError');
    });

    it('should extend Error', () => {
      const err = new HoloScriptParseError('test', []);
      expect(err).toBeInstanceOf(Error);
    });

    it('should preserve error array', () => {
      const errors = [
        { message: 'err1', line: 1, column: 1 },
        { message: 'err2', line: 2, column: 5 },
      ];
      const err = new HoloScriptParseError('multiple errors', errors);
      expect(err.errors).toEqual(errors);
      expect(err.errors).toHaveLength(2);
    });
  });

  // ── WASM Module Contract ────────────────────────────────────────

  describe('WASM module contract', () => {
    it('should require all five wasm_bindgen exports', () => {
      // Verify the mock satisfies the full interface
      const mod = createMockWasm();
      expect(typeof mod.parse).toBe('function');
      expect(typeof mod.parse_pretty).toBe('function');
      expect(typeof mod.validate).toBe('function');
      expect(typeof mod.validate_detailed).toBe('function');
      expect(typeof mod.version).toBe('function');
    });

    it('should pass source argument through to each WASM function', () => {
      const source = 'composition "Demo" { orb test {} }';

      wrapper.parse(source);
      wrapper.parsePretty(source);
      wrapper.validate(source);
      wrapper.validateDetailed(source);

      expect(mockWasm.parse).toHaveBeenCalledWith(source);
      expect(mockWasm.parse_pretty).toHaveBeenCalledWith(source);
      expect(mockWasm.validate).toHaveBeenCalledWith(source);
      expect(mockWasm.validate_detailed).toHaveBeenCalledWith(source);
    });
  });
});
