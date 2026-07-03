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
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UAALVirtualMachine, UAALOpCode, type UAALBytecode } from '../../../uaal/src/index';
import {
  HoloScriptWasm,
  HoloScriptCompileError,
  HoloScriptParseError,
  extractTraitNames,
  type HoloScriptWasmModule,
  type Ast,
  type ValidationResult,
  type TraitInfoResult,
  type TraitTarget,
  type MovementStatementNode,
  type ActionDeclNode,
  type GameEventBlockNode,
  type TimelineNode,
  type TrackNode,
  type KeyframeNode,
  type UAALWasmBytecode,
} from '../wasm-api';

// ── Helpers ─────────────────────────────────────────────────────────

function createMockWasm(overrides?: Partial<HoloScriptWasmModule>): HoloScriptWasmModule {
  return {
    parse: vi.fn().mockReturnValue(JSON.stringify(VALID_AST)),
    parse_pretty: vi.fn().mockReturnValue(JSON.stringify(VALID_AST, null, 2)),
    validate: vi.fn().mockReturnValue(true),
    validate_detailed: vi.fn().mockReturnValue(JSON.stringify({ valid: true, errors: [] })),
    compile_to_uaal: vi.fn().mockReturnValue(JSON.stringify(VALID_UAAL_BYTECODE)),
    version: vi.fn().mockReturnValue('3.7.0'),
    ...overrides,
  };
}

const VALID_UAAL_BYTECODE: UAALWasmBytecode = {
  version: 1,
  instructions: [
    { opCode: 0x01, operands: [42] },
    { opCode: 0xff },
  ],
};

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../../..');
const COMPILER_WASM_MANIFEST = resolve(REPO_ROOT, 'packages/compiler-wasm/Cargo.toml');

function resolveCargoCommand(): string {
  const names = process.platform === 'win32' ? ['cargo.exe', 'cargo.cmd', 'cargo.bat'] : ['cargo'];
  const fromPath = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((entry) => names.map((name) => resolve(entry, name)));
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const homeFallback = userHome
    ? [resolve(userHome, process.platform === 'win32' ? '.cargo/bin/cargo.exe' : '.cargo/bin/cargo')]
    : [];
  const candidates = [process.env.CARGO, ...fromPath, ...homeFallback].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
  return candidates.find((candidate) => existsSync(candidate)) ?? 'cargo';
}

function compileHsToUaalViaRust(source: string): UAALBytecode {
  const stdout = execFileSync(
    resolveCargoCommand(),
    ['run', '--quiet', '--manifest-path', COMPILER_WASM_MANIFEST, '--bin', 'compile_to_uaal'],
    {
      cwd: REPO_ROOT,
      input: source,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }
  );
  const result = JSON.parse(stdout.trim()) as UAALBytecode | { error: string };
  if ('error' in result) {
    throw new Error(result.error);
  }
  return result;
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
  errors: [{ message: 'Expected identifier after "orb"', line: 1, column: 5 }],
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
      const orb = result.body[0] as {
        type: string;
        properties: Array<{ key: string; value: { value: string } }>;
      };

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
        errors: [{ message: 'Expected identifier after "orb"', line: 1, column: 5 }],
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
        errors: [{ message: 'Unexpected end of input', line: 1, column: 20 }],
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

  describe('compileToUaal()', () => {
    it('should return typed UAAL bytecode from the wasm JSON export', () => {
      const result = wrapper.compileToUaal('function main() { return 42 }');

      expect(result.version).toBe(1);
      expect(result.instructions).toEqual(VALID_UAAL_BYTECODE.instructions);
      expect(mockWasm.compile_to_uaal).toHaveBeenCalledWith('function main() { return 42 }');
    });

    it('should throw HoloScriptCompileError for compiler error objects', () => {
      mockWasm = createMockWasm({
        compile_to_uaal: vi.fn().mockReturnValue(JSON.stringify({ error: 'unresolved function call' })),
      });
      wrapper = new HoloScriptWasm(mockWasm);

      expect(() => wrapper.compileToUaal('function main() { return missing() }')).toThrow(
        HoloScriptCompileError
      );
    });
  });

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
    it('should require all wasm_bindgen exports', () => {
      // Verify the mock satisfies the full interface
      const mod = createMockWasm();
      expect(typeof mod.parse).toBe('function');
      expect(typeof mod.parse_pretty).toBe('function');
      expect(typeof mod.validate).toBe('function');
      expect(typeof mod.validate_detailed).toBe('function');
      expect(typeof mod.compile_to_uaal).toBe('function');
      expect(typeof mod.version).toBe('function');
    });

    it('should pass source argument through to each WASM function', () => {
      const source = 'composition "Demo" { orb test {} }';

      wrapper.parse(source);
      wrapper.parsePretty(source);
      wrapper.validate(source);
      wrapper.validateDetailed(source);
      wrapper.compileToUaal(source);

      expect(mockWasm.parse).toHaveBeenCalledWith(source);
      expect(mockWasm.parse_pretty).toHaveBeenCalledWith(source);
      expect(mockWasm.validate).toHaveBeenCalledWith(source);
      expect(mockWasm.validate_detailed).toHaveBeenCalledWith(source);
      expect(mockWasm.compile_to_uaal).toHaveBeenCalledWith(source);
    });
  });
});

// ── APL WIT Trait-Evaluation Surface Tests ──────────────────────────────

describe('compile_to_uaal e2e', () => {
  it(
    'compiles a non-recursive .hs function call to bytecode the UAAL VM executes',
    async () => {
      const bytecode = compileHsToUaalViaRust(`function helper() {
  return 42
}

function main() {
  return helper()
}`);

      expect(bytecode.version).toBe(1);
      expect(bytecode.instructions.some((instruction) => instruction.opCode === UAALOpCode.CALL)).toBe(true);
      expect(bytecode.instructions.some((instruction) => instruction.opCode === UAALOpCode.RET)).toBe(true);

      const vm = new UAALVirtualMachine();
      const result = await vm.execute(bytecode);

      expect(result.taskStatus).toBe('HALTED');
      expect(result.stackTop).toBe(42);
      expect(result.state.callStack).toEqual([]);
    },
    60000
  );
});

describe('extractTraitNames', () => {
  it('extracts @trait annotations from HoloScript source', () => {
    const source = 'orb cube { @grabbable @physics mass: 2 }';
    const names = extractTraitNames(source);
    expect(names).toContain('grabbable');
    expect(names).toContain('physics');
  });

  it('deduplicates trait names', () => {
    const source = 'orb cube { @grabbable @grabbable }';
    const names = extractTraitNames(source);
    expect(names.filter((n) => n === 'grabbable')).toHaveLength(1);
  });

  it('returns empty array for source with no traits', () => {
    const source = 'orb cube { color: "red" }';
    const names = extractTraitNames(source);
    expect(names).toEqual([]);
  });

  it('handles traits with underscores and hyphens', () => {
    const source = 'orb cube { @hand_tracking @soft_body }';
    const names = extractTraitNames(source);
    expect(names).toContain('hand_tracking');
    expect(names).toContain('soft_body');
  });

  it('returns empty array for empty source', () => {
    expect(extractTraitNames('')).toEqual([]);
  });
});

describe('HoloScriptWasm trait-evaluation surface', () => {
  let mockWasm: HoloScriptWasmModule;
  let wrapper: HoloScriptWasm;

  beforeEach(() => {
    mockWasm = createMockWasm();
    wrapper = new HoloScriptWasm(mockWasm);
  });

  describe('traitExists', () => {
    it('returns true for well-known traits when bridge is unavailable (fallback)', () => {
      // Without @holoscript/core loaded, the fallback returns true for all traits
      // to avoid false negatives in lightweight WASM worlds
      const result = wrapper.traitExists('physics');
      expect(typeof result).toBe('boolean');
      // Fallback mode returns true (conservative)
      expect(result).toBe(true);
    });
  });

  describe('getTraitInfo', () => {
    it('returns a TraitInfoResult object', () => {
      const info = wrapper.getTraitInfo('grabbable');
      expect(info).toBeDefined();
      expect(typeof info!.name).toBe('string');
      expect(typeof info!.exists).toBe('boolean');
    });

    it('returns bridge not-found info for unknown traits when core bridge is available', () => {
      const info = wrapper.getTraitInfo('unknown_trait_xyz');
      // In the workspace test run, @holoscript/core resolves and the bridge
      // reports the registry miss instead of using the pure-WASM fallback.
      expect(info).toBeDefined();
      if (info) {
        expect(info.sourceMap).toContain('not found in any registry');
      }
    });
  });

  describe('listTraits', () => {
    it('returns an array', () => {
      const list = wrapper.listTraits('core');
      expect(Array.isArray(list)).toBe(true);
    });

    it('returns empty array when bridge is unavailable', () => {
      // Without @holoscript/core, listTraits returns []
      const list = wrapper.listTraits('webgpu');
      expect(list).toEqual([]);
    });
  });

  describe('generateTraitCode', () => {
    it('returns an array of strings', () => {
      const code = wrapper.generateTraitCode('physics', 'android-xr');
      expect(Array.isArray(code)).toBe(true);
      expect(code.length).toBeGreaterThan(0);
    });

    it('returns bridge missing-codegen stub when target has no codegen path', () => {
      const code = wrapper.generateTraitCode('physics', 'webgpu');
      expect(code.length).toBeGreaterThan(0);
      // The core bridge is available, but webgpu has no codegen path yet.
      expect(code[0]).toContain('no codegen path registered');
    });
  });

  describe('validateWithTraits', () => {
    it('enriches validation with trait checks', () => {
      const source = 'orb cube { @grabbable @physics mass: 2 }';
      const result = wrapper.validateWithTraits(source);

      expect(result.valid).toBe(true);
      expect(result.knownTraits).toBeDefined();
      expect(result.unknownTraits).toBeDefined();
      expect(result.traitInfo).toBeDefined();
      expect(Array.isArray(result.knownTraits)).toBe(true);
      expect(Array.isArray(result.unknownTraits)).toBe(true);
      expect(Array.isArray(result.traitInfo)).toBe(true);
    });

    it('extracts trait names from source for validation', () => {
      const source = 'orb player { @grabbable }';
      const result = wrapper.validateWithTraits(source, 'core');
      // In fallback mode, all traits are "known" (conservative)
      expect(result.traitInfo.length).toBeGreaterThan(0);
    });

    it('preserves base validation result', () => {
      const source = 'orb cube { color: "blue" }';
      const result = wrapper.validateWithTraits(source);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      // No @traits in source -> empty trait info
      expect(result.knownTraits).toEqual([]);
      expect(result.unknownTraits).toEqual([]);
      expect(result.traitInfo).toEqual([]);
    });
  });
});

// ── Behavioral construct node round-trip (mirror ast.rs serde tags) ──────

describe('behavioral construct AST nodes', () => {
  function parseFromMock(ast: Ast): Ast {
    const mockWasm = createMockWasm({
      parse: vi.fn().mockReturnValue(JSON.stringify(ast)),
    });
    return new HoloScriptWasm(mockWasm).parse('mock source');
  }

  it('round-trips a MovementStatement with a position destination', () => {
    const MOVE_AST: Ast = {
      type: 'Program',
      body: [
        {
          type: 'MovementStatement',
          target: 'player',
          destination: [1, 0, 0],
          duration: 2,
          mode: 'glide',
          easing: 'ease_in_out',
        } as MovementStatementNode,
      ],
      directives: [],
    };

    const result = parseFromMock(MOVE_AST);
    const node = result.body[0] as MovementStatementNode;
    expect(node.type).toBe('MovementStatement');
    expect(node.target).toBe('player');
    expect(node.destination).toEqual([1, 0, 0]);
    expect(node.duration).toBe(2);
    expect(node.mode).toBe('glide');
    expect(node.easing).toBe('ease_in_out');
  });

  it('round-trips a MovementStatement with an entity-id destination', () => {
    const MOVE_AST: Ast = {
      type: 'Program',
      body: [
        {
          type: 'MovementStatement',
          target: 'self',
          destination: 'enemy',
        } as MovementStatementNode,
      ],
      directives: [],
    };

    const result = parseFromMock(MOVE_AST);
    const node = result.body[0] as MovementStatementNode;
    expect(node.type).toBe('MovementStatement');
    expect(node.target).toBe('self');
    expect(node.destination).toBe('enemy');
  });

  it('round-trips a Timeline node with properties and children', () => {
    const TIMELINE_AST: Ast = {
      type: 'Program',
      body: [
        {
          type: 'Timeline',
          name: 'intro',
          traits: [],
          properties: [{ type: 'Property', key: 'duration', value: { type: 'Number', value: 3 } }],
          children: [
            {
              type: 'MovementStatement',
              target: 'player',
              destination: [1, 0, 0],
              duration: 1,
              easing: 'spring',
            } as MovementStatementNode,
          ],
        } as unknown as TimelineNode,
      ],
      directives: [],
    };

    const result = parseFromMock(TIMELINE_AST);
    const node = result.body[0] as TimelineNode;
    expect(node.type).toBe('Timeline');
    expect(node.name).toBe('intro');
    expect(node.properties).toHaveLength(1);
    expect(node.children).toHaveLength(1);
    expect((node.children[0] as MovementStatementNode).easing).toBe('spring');
  });

  it('round-trips a Timeline with a keyframe Track (Theatre.js harvest S1)', () => {
    // Mirrors the Rust grammar shape for:
    //   timeline intro { track "scaleUniform" { key 0 {0}; key 1 {1} easing spring } }
    const TIMELINE_TRACK_AST: Ast = {
      type: 'Program',
      body: [
        {
          type: 'Timeline',
          name: 'intro',
          traits: [],
          properties: [],
          children: [
            {
              type: 'Track',
              target: 'scaleUniform',
              keyframes: [
                { time: 0, value: { type: 'Number', value: 0 } },
                { time: 1, value: { type: 'Number', value: 1 }, easing: 'spring' },
              ],
            } as unknown as TrackNode,
          ],
        } as unknown as TimelineNode,
      ],
      directives: [],
    };

    const result = parseFromMock(TIMELINE_TRACK_AST);
    const timeline = result.body[0] as TimelineNode;
    expect(timeline.type).toBe('Timeline');
    expect(timeline.children).toHaveLength(1);

    const track = timeline.children[0] as TrackNode;
    expect(track.type).toBe('Track');
    expect(track.target).toBe('scaleUniform');
    expect(track.keyframes).toHaveLength(2);

    const [k0, k1] = track.keyframes as KeyframeNode[];
    expect(k0.time).toBe(0);
    expect(k0.easing).toBeUndefined();
    expect((k0.value as { value: number }).value).toBe(0);
    expect(k1.time).toBe(1);
    expect(k1.easing).toBe('spring');
    expect((k1.value as { value: number }).value).toBe(1);
  });

  it('round-trips an ActionDecl with clauses and flags', () => {
    const ACTION_AST: Ast = {
      type: 'Program',
      body: [
        {
          type: 'ActionDecl',
          name: 'open',
          params: ['target'],
          clauses: [{ kind: 'requires', body: 'dist < 2' }],
          flags: ['server_side'],
        } as ActionDeclNode,
      ],
      directives: [],
    };

    const result = parseFromMock(ACTION_AST);
    const node = result.body[0] as ActionDeclNode;
    expect(node.type).toBe('ActionDecl');
    expect(node.name).toBe('open');
    expect(node.params).toEqual(['target']);
    expect(node.clauses).toHaveLength(1);
    expect(node.clauses[0].kind).toBe('requires');
    expect(node.clauses[0].body).toContain('dist');
    expect(node.flags).toEqual(['server_side']);
  });

  it('round-trips a GameEventBlock with an inferred category', () => {
    const EVENT_AST: Ast = {
      type: 'Program',
      body: [
        {
          type: 'GameEventBlock',
          name: 'on_grab',
          params: [],
          body: 'drop ( )',
          category: 'interaction',
        } as GameEventBlockNode,
      ],
      directives: [],
    };

    const result = parseFromMock(EVENT_AST);
    const node = result.body[0] as GameEventBlockNode;
    expect(node.type).toBe('GameEventBlock');
    expect(node.name).toBe('on_grab');
    expect(node.category).toBe('interaction');
  });
});
