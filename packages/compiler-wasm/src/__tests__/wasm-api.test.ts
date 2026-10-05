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
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UAALVirtualMachine,
  UAALOpCode,
  type UAALBytecode,
  type UAALOperand,
} from '@holoscript/uaal';
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

// @holoscript/uaal ships without deep type declarations for its runtime log
// and instruction shapes here, so the callback chains below annotate against
// these structural aliases instead of leaking implicit-any params.
type BytecodeInstruction = UAALBytecode['instructions'][number];
type LoggedStep = {
  opcode: UAALOpCode;
  pc: number;
  injected?: boolean;
  stackBefore: { depth: number };
  stackAfter: { depth: number };
};
type ExecProxy = { pop(): UAALOperand; push(value: UAALOperand): void };

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

interface SpecCorpusRow {
  id: string;
  source: string;
  tags: string[];
  expect: { valid: boolean; diagnostic_includes?: string };
}

const VALID_UAAL_BYTECODE: UAALWasmBytecode = {
  version: 1,
  instructions: [{ opCode: 0x01, operands: [42] }, { opCode: 0xff }],
};

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../../..');
const COMPILER_WASM_MANIFEST = resolve(REPO_ROOT, 'packages/compiler-wasm/Cargo.toml');
const COMPILER_NATIVE_MANIFEST = resolve(REPO_ROOT, 'packages/compiler-native/Cargo.toml');
const THREE_SURFACE_POLICY_PATH = resolve(REPO_ROOT, 'examples/three-surface-agent/policy.hs');

function resolveCargoCommand(): string {
  const names = process.platform === 'win32' ? ['cargo.exe', 'cargo.cmd', 'cargo.bat'] : ['cargo'];
  const fromPath = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((entry) => names.map((name) => resolve(entry, name)));
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const homeFallback = userHome
    ? [
        resolve(
          userHome,
          process.platform === 'win32' ? '.cargo/bin/cargo.exe' : '.cargo/bin/cargo'
        ),
      ]
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

function executeHsNativeViaRust(source: string, executionTimeoutMs = 30000): number {
  const scratchDir = mkdtempSync(join(tmpdir(), 'holoscript-native-uaal-parity-'));
  const sourcePath = join(scratchDir, 'main.hs');
  const executablePath = join(
    scratchDir,
    process.platform === 'win32' ? 'decision-kernel.exe' : 'decision-kernel'
  );

  try {
    writeFileSync(sourcePath, source, 'utf8');
    execFileSync(
      resolveCargoCommand(),
      [
        'run',
        '--quiet',
        '--manifest-path',
        COMPILER_NATIVE_MANIFEST,
        '--bin',
        'holoscriptc',
        '--',
        sourcePath,
        '-o',
        executablePath,
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }
    );

    const execution = spawnSync(executablePath, [], {
      cwd: scratchDir,
      encoding: 'utf8',
      timeout: executionTimeoutMs,
    });
    if (execution.error) throw execution.error;
    if (execution.signal) {
      throw new Error(`native decision kernel terminated by ${execution.signal}`);
    }
    if (execution.status === null) {
      throw new Error('native decision kernel did not report an exit status');
    }
    return execution.status;
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

/** `validate_detailed` from the current Rust source, through the `validate_hs` example. */
function validateHsViaRust(source: string): { valid: boolean; errors: Array<{ message: string }> } {
  const scratchDir = mkdtempSync(join(tmpdir(), 'holoscript-validate-'));
  const sourcePath = join(scratchDir, 'case.hs');
  try {
    writeFileSync(sourcePath, source, 'utf8');
    const stdout = execFileSync(
      resolveCargoCommand(),
      [
        'run',
        '--quiet',
        '--manifest-path',
        COMPILER_WASM_MANIFEST,
        '--example',
        'validate_hs',
        '--',
        sourcePath,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 }
    );
    return JSON.parse(stdout.trim().split('\t').slice(1).join('\t'));
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

function registerHsI32BinaryHandler(vm: UAALVirtualMachine): void {
  vm.registerHandler(UAALOpCode.EXEC, (proxy: ExecProxy, operands: readonly UAALOperand[]) => {
    const [abi, operator] = operands;
    if (abi !== 'hs.i32.binary.v1' || typeof operator !== 'string') {
      throw new Error(`unsupported HoloScript EXEC ABI: ${String(abi)}`);
    }

    const right = proxy.pop();
    const left = proxy.pop();
    if (typeof left !== 'number' || typeof right !== 'number') {
      throw new Error(`hs.i32.binary.v1 requires numeric operands`);
    }

    let result: UAALOperand;
    switch (operator) {
      case '+':
        result = (left + right) | 0;
        break;
      case '-':
        result = (left - right) | 0;
        break;
      case '*':
        result = Math.imul(left, right);
        break;
      case '==':
        result = left === right;
        break;
      case '!=':
        result = left !== right;
        break;
      case '<':
        result = left < right;
        break;
      case '<=':
        result = left <= right;
        break;
      case '>':
        result = left > right;
        break;
      case '>=':
        result = left >= right;
        break;
      default:
        throw new Error(`unsupported hs.i32.binary.v1 operator: ${operator}`);
    }
    proxy.push(result);
  });
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
        compile_to_uaal: vi
          .fn()
          .mockReturnValue(JSON.stringify({ error: 'unresolved function call' })),
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
  it('compiles a non-recursive .hs function call to bytecode the UAAL VM executes', async () => {
    const bytecode = compileHsToUaalViaRust(`function helper() {
  return 42
}

function main() {
  return helper()
}`);

    expect(bytecode.version).toBe(1);
    expect(
      bytecode.instructions.some(
        (instruction: BytecodeInstruction) => instruction.opCode === UAALOpCode.CALL
      )
    ).toBe(true);
    expect(
      bytecode.instructions.some(
        (instruction: BytecodeInstruction) => instruction.opCode === UAALOpCode.RET
      )
    ).toBe(true);

    const vm = new UAALVirtualMachine();
    const result = await vm.execute(bytecode);

    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe(42);
    expect(result.state.callStack).toEqual([]);
  }, 60000);

  it('executes a recursive .hs function with one parameter and an if branch', async () => {
    const bytecode = compileHsToUaalViaRust(`function countdown(active) {
  if (active) {
    return countdown(false)
  } else {
    return "done"
  }
}

function main() {
  return countdown(true)
}`);

    const opCodes = bytecode.instructions.map(
      (instruction: BytecodeInstruction) => instruction.opCode
    );
    expect(opCodes).toContain(UAALOpCode.OP_STATE_SET);
    expect(opCodes).toContain(UAALOpCode.OP_STATE_GET);
    expect(opCodes).toContain(UAALOpCode.JUMP_IF);
    expect(opCodes).toContain(UAALOpCode.JUMP);
    expect(opCodes.filter((opCode: UAALOpCode) => opCode === UAALOpCode.CALL)).toHaveLength(3);

    const vm = new UAALVirtualMachine();
    const result = await vm.execute(bytecode);

    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe('done');
    expect(result.state.callStack).toEqual([]);
  }, 60000);

  // `countdown` above never reads its parameter after the recursive call, so it cannot tell
  // per-function slots from per-call frames. These programs do, and must agree with native.
  it('keeps each recursive call in its own frame, with native parity', async () => {
    const cases: Array<{ name: string; expected: number; source: string }> = [
      {
        name: 'fib(10) reads n after both recursive calls',
        expected: 55,
        source: `function fib(n: i32): i32 {
  if (n < 2) {
    return n
  }
  return fib(n - 1) + fib(n - 2)
}

function main(): i32 {
  return fib(10)
}`,
      },
      {
        name: 'the recursive call runs before the parameter is read',
        expected: 10,
        source: `function sum_to(n: i32): i32 {
  if (n < 1) {
    return 0
  }
  return sum_to(n - 1) + n
}

function main(): i32 {
  return sum_to(4)
}`,
      },
      {
        name: 'a local declared before the recursive call is read after it',
        expected: 15,
        source: `function tri(n: i32): i32 {
  if (n < 1) {
    return 0
  }
  let here: i32 = n
  let rest: i32 = tri(n - 1)
  return here + rest
}

function main(): i32 {
  return tri(5)
}`,
      },
      {
        name: 'mutual recursion',
        expected: 1,
        source: `function is_even(n: i32): i32 {
  if (n == 0) {
    return 1
  }
  return is_odd(n - 1)
}

function is_odd(n: i32): i32 {
  if (n == 0) {
    return 0
  }
  return is_even(n - 1)
}

function main(): i32 {
  return is_even(10)
}`,
      },
      {
        name: 'three-way mutual recursion reading n after each call',
        expected: 51,
        source: `function a(n: i32): i32 {
  if (n < 1) {
    return 0
  }
  return b(n - 1) + n
}

function b(n: i32): i32 {
  if (n < 1) {
    return 0
  }
  return c(n - 1) + n * 2
}

function c(n: i32): i32 {
  if (n < 1) {
    return 0
  }
  return a(n - 1) + n * 3
}

function main(): i32 {
  return a(7)
}`,
      },
      {
        name: 'a recursive call nested in the arguments of a returned one',
        expected: 9,
        source: `function ack(m: i32, n: i32): i32 {
  if (m == 0) {
    return n + 1
  }
  if (n == 0) {
    return ack(m - 1, 1)
  }
  return ack(m - 1, ack(m, n - 1))
}

function main(): i32 {
  return ack(2, 3)
}`,
      },
      {
        name: 'a 900-deep returned call keeps a flat operand stack',
        expected: 242595150,
        source: `function walk(i: i32, n: i32, acc: i32): i32 {
  if (i >= n) {
    return acc
  }
  let sq: i32 = i * i
  let next: i32 = acc + sq
  return walk(i + 1, n, next)
}

function main(): i32 {
  return walk(0, 900, 0)
}`,
      },
    ];

    for (const testCase of cases) {
      const vm = new UAALVirtualMachine();
      registerHsI32BinaryHandler(vm);
      const result = await vm.execute(compileHsToUaalViaRust(testCase.source));

      expect(result.taskStatus, testCase.name).toBe('HALTED');
      expect(result.stackTop, testCase.name).toBe(testCase.expected);
      expect(result.state.callStack, testCase.name).toEqual([]);
      expect(executeHsNativeViaRust(testCase.source), testCase.name).toBe(testCase.expected);
    }
  }, 240000);

  // Native refuses statement calls (hs-machine-v5), so these values are computed by hand.
  it('discards the value of a statement call so recursive frames stay balanced', async () => {
    const cases: Array<{ name: string; expected: number; source: string }> = [
      {
        name: 'a helper called as a statement before the recursive call',
        expected: 6,
        source: `function note(x: i32): i32 {
  return x
}

function f(n: i32): i32 {
  if (n < 1) {
    return 0
  }
  note(n)
  return f(n - 1) + n
}

function main(): i32 {
  return f(3)
}`,
      },
      {
        name: 'the recursive call itself used as a statement',
        expected: 3,
        source: `function f(n: i32): i32 {
  if (n > 0) {
    f(n - 1)
  }
  return n
}

function main(): i32 {
  return f(3)
}`,
      },
    ];

    for (const testCase of cases) {
      const vm = new UAALVirtualMachine();
      registerHsI32BinaryHandler(vm);
      const result = await vm.execute(compileHsToUaalViaRust(testCase.source));

      expect(result.taskStatus, testCase.name).toBe('HALTED');
      expect(result.stackTop, testCase.name).toBe(testCase.expected);
      expect(result.state.callStack, testCase.name).toEqual([]);
    }
  }, 120000);

  it('refuses what native refuses instead of returning a different value', () => {
    expect(() =>
      compileHsToUaalViaRust(`function f(n: i32) {
  if (n == 0) {
    return
  }
  return f(n - 1)
}

function main() {
  return f(3)
}`)
    ).toThrow('HS-UAAL-CAP-007');

    expect(() =>
      compileHsToUaalViaRust(`function g(n: i32) {
  let x: i32 = n
}

function main(): i32 {
  return g(1)
}`)
    ).toThrow('never returns a value');

    // compile_to_uaal runs the checker first. In typed functions the checker now refuses these
    // three itself (G11), with its codes, before the emitter's own guards are reached.
    expect(() =>
      compileHsToUaalViaRust(`function main(): i32 {
  let x: i32 = 1
  if (true) {
    let x: i32 = 2
  }
  return x
}`)
    ).toThrow('HS-SCOPE-001');

    expect(() =>
      compileHsToUaalViaRust(`function main(): i32 {
  if (true) {
    let t: i32 = 7
  }
  return t
}`)
    ).toThrow('HS-NAME-001');

    expect(() =>
      compileHsToUaalViaRust(`function f(x: i32): i32 {
  if (x > 0) {
    return 1
  }
}

function main(): i32 {
  return f(0)
}`)
    ).toThrow('HS-RETURN-002');
  }, 60000);

  it('refuses every G11 corpus case in the checker, the native compiler and compile_to_uaal', () => {
    const corpus = readFileSync(
      resolve(REPO_ROOT, 'packages/compiler-wasm/spec-corpus/hsplus-spec-corpus.v0.jsonl'),
      'utf8'
    )
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SpecCorpusRow)
      .filter((row) => row.tags.includes('g11') && row.expect.valid === false);

    // The reason native gives for each case. Native stops at the `var` counter of the `break`
    // case before it reaches `break`; the loop below isolates `break` itself.
    const nativeReason: Record<string, RegExp> = {
      'g11-unknown-local-001': /references unknown local `y`/,
      'g11-unknown-function-002': /calls unknown function `g`/,
      'g11-arity-003': /call to `add` expects 2 arguments, found 1/,
      'g11-missing-return-004': /function `f` has no return statement/,
      'g11-return-one-path-005': /function `f` has no return statement/,
      'g11-break-identifier-007': /local `i` must be immutable/,
      'g11-use-after-block-009': /references unknown local `t`/,
      'g11-hidden-name-010': /redeclares binding `x`/,
      // Closed by the @unknown reads (proposals/Unknown_Field_Reads_v1.md).
      'g11-coalesce-plain-008': /`\?\?` requires `load\(@unknownField\) \?\? fallback`/,
    };
    expect(corpus.map((row) => row.id).sort()).toEqual(Object.keys(nativeReason).sort());

    for (const row of corpus) {
      const code = row.expect.diagnostic_includes!;
      const checker = validateHsViaRust(row.source);
      expect(checker.valid, row.id).toBe(false);
      expect(checker.errors[0]?.message, row.id).toContain(code);

      // A native executable needs `main`; the case's own function is still compiled.
      const program = /function main\s*\(/.test(row.source)
        ? row.source
        : `${row.source}\n\nfunction main(): i32 {\n  return 0\n}\n`;
      expect(() => executeHsNativeViaRust(program), row.id).toThrow(nativeReason[row.id]);
      expect(() => compileHsToUaalViaRust(program), row.id).toThrow(code);
    }

    // `break` alone: native compiles the loop without it and refuses the loop with it.
    const loop = (body: string) =>
      `function main(): i32 {\n  let i: i32 = 3\n  while (i > 5) {\n${body}  }\n  return i\n}\n`;
    expect(executeHsNativeViaRust(loop('    return 1\n'))).toBe(3);
    expect(() => executeHsNativeViaRust(loop('    break\n'))).toThrow(
      /supports only typed immutable locals/
    );
    expect(validateHsViaRust(loop('    break\n')).errors[0]?.message).toContain('HS-NAME-001');
  }, 600000);

  it('reads @unknown struct fields the way the native backend does', () => {
    // The steward gate uses all three honesty operations (isKnown, load(...) ?? fallback,
    // unknownReason); native runs it to exit 5, and the checker now accepts it unchanged.
    const steward = readFileSync(
      resolve(REPO_ROOT, 'examples/native/uncertain-steward-honesty-gate-exit-five.hs'),
      'utf8'
    );
    expect(validateHsViaRust(steward).valid).toBe(true);
    expect(executeHsNativeViaRust(steward)).toBe(5);

    const snapshot = (body: string) => `struct Snapshot {
  @unknown count: i32
}

struct Receipt {
  reason: i32
}

function read(snapshot: &Snapshot, receipt: &mut Receipt): i32 {
${body}
}

function main(): i32 {
  slot missing: Snapshot = Snapshot(unknown("missing_precondition"))
  slot receipt: Receipt = Receipt(0)
  return read(&missing, &mut receipt)
}
`;

    // The one written form for the value: both accept, native falls back to 7.
    const loadForm = snapshot('  return load(snapshot.count) ?? 7');
    expect(validateHsViaRust(loadForm).valid).toBe(true);
    expect(executeHsNativeViaRust(loadForm)).toBe(7);

    // Tag reads: both accept; native returns the reason code.
    const tagReads = snapshot(`  if (isKnown(snapshot.count)) {
    return 1
  }
  store(receipt.reason, unknownReason(snapshot.count))
  return load(receipt.reason)`);
    expect(validateHsViaRust(tagReads).valid).toBe(true);
    expect(executeHsNativeViaRust(tagReads)).toBe(4);

    // The bare fallback form: both refuse, and the checker names the load form.
    const bare = snapshot('  return snapshot.count ?? 7');
    const refused = validateHsViaRust(bare);
    expect(refused.valid).toBe(false);
    expect(refused.errors[0]?.message).toContain('HS-UNKNOWN-002');
    expect(refused.errors[0]?.message).toContain('load(record.count) ?? <fallback>');
    expect(() => executeHsNativeViaRust(bare)).toThrow(/requires `load\(@unknownField\) \?\? fallback`/);

    // `export` exempts nothing: a bare read in an exported function of an exported struct is
    // refused by both (the checker accepted it until 2026-09-29).
    const exported = `export struct Snapshot {
  @unknown count: i32
}

export function read(snapshot: &Snapshot): i32 {
  return snapshot.count
}

function main(): i32 {
  return 5
}
`;
    const exportedVerdict = validateHsViaRust(exported);
    expect(exportedVerdict.valid).toBe(false);
    expect(exportedVerdict.errors[0]?.message).toContain('HS-UNKNOWN-001');
    expect(() => executeHsNativeViaRust(exported)).toThrow();
  }, 600000);

  it('applies the three @unknown forms only to an @unknown field of the record own struct', () => {
    // Review of PR #444 (claude3): each refused program here was valid at 77939d364 (the tag-read
    // exemption took any member, and a field was matched by name), while native refused it; the
    // `Tally` program was refused while native runs it.
    const snapshot = (body: string) => `struct Snapshot {
  @unknown count: i32
}

struct Receipt {
  reason: i32
}

struct Tally {
  count: i32
}

function read(snapshot: &Snapshot, receipt: &mut Receipt): i32 {
${body}
}

function main(): i32 {
  slot missing: Snapshot = Snapshot(unknown("missing_precondition"))
  slot receipt: Receipt = Receipt(0)
  return read(&missing, &mut receipt)
}
`;
    const gate = (argument: string, setup = '') =>
      `${setup}  if (isKnown(${argument})) {\n    return 1\n  }\n  return 2`;
    const refusedByBoth: Array<[string, string]> = [
      [
        gate('values[snapshot.count]', '  slot values: [i32; 4] = [1, 2, 3, 4]\n'),
        'HS-UNKNOWN-001',
      ],
      [gate('snapshot.count.x'), 'HS-UNKNOWN-001'],
      [gate('a.count', '  let a: i32 = 5\n'), 'HS-UNKNOWN-003'],
      [gate('snapshot.a.a.count'), 'HS-UNKNOWN-003'],
      [gate('receipt.reason'), 'HS-UNKNOWN-003'],
      [gate('snapshot.count, snapshot.count'), 'HS-UNKNOWN-003'],
      ['  return load(receipt.reason) ?? 7', 'HS-UNKNOWN-002'],
      ['  return load(snapshot.nosuch) ?? 7', 'HS-UNKNOWN-002'],
      ['  return load(snapshot.count, 1) ?? 7', 'HS-UNKNOWN-002'],
    ];
    for (const [body, code] of refusedByBoth) {
      const source = snapshot(body);
      const verdict = validateHsViaRust(source);
      expect(verdict.valid, body).toBe(false);
      expect(verdict.errors[0]?.message, body).toContain(code);
      expect(() => executeHsNativeViaRust(source), body).toThrow();
    }

    // A field resolves through its record's own struct: `Tally` declares its own plain `count`.
    const tally = snapshot('  slot tally: Tally = Tally(4)\n  return load(tally.count) + 1');
    expect(validateHsViaRust(tally).valid).toBe(true);
    expect(executeHsNativeViaRust(tally)).toBe(5);
  }, 600000);

  it('executes the canonical three-surface policy identically on native and cognitive VMs', async () => {
    const source = readFileSync(THREE_SURFACE_POLICY_PATH, 'utf8');

    const nativeExitCode = executeHsNativeViaRust(source);
    const bytecode = compileHsToUaalViaRust(source);
    const opCodes = bytecode.instructions.map(
      (instruction: BytecodeInstruction) => instruction.opCode
    );

    expect(nativeExitCode).toBe(1);
    expect(opCodes).toContain(UAALOpCode.EXEC);
    expect(opCodes).toContain(UAALOpCode.JUMP_IF);
    expect(opCodes).toContain(UAALOpCode.JUMP);

    const vm = new UAALVirtualMachine({ recordLog: true });
    registerHsI32BinaryHandler(vm);
    const result = await vm.execute(bytecode);
    const executionLog = vm.exportLog();

    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe(nativeExitCode);
    expect(result.state.callStack).toEqual([]);
    expect(
      executionLog.steps.filter(
        (step: LoggedStep) => step.opcode === UAALOpCode.EXEC && step.injected
      )
    ).toHaveLength(1);
  }, 120000);

  it('executes typed i32 arithmetic and bounded while identically on both VMs', async () => {
    const source = `function decide(score: i32): i32 {
  while (score >= 6) {
    return score * 7
  }
  return score + 1
}

function main(): i32 {
  return decide(6)
}`;

    const nativeExitCode = executeHsNativeViaRust(source);
    const bytecode = compileHsToUaalViaRust(source);
    const vm = new UAALVirtualMachine({ recordLog: true });
    registerHsI32BinaryHandler(vm);
    const result = await vm.execute(bytecode);
    const executionLog = vm.exportLog();

    expect(nativeExitCode).toBe(42);
    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe(nativeExitCode);
    expect(result.state.callStack).toEqual([]);
    expect(
      executionLog.steps.filter(
        (step: LoggedStep) => step.opcode === UAALOpCode.EXEC && step.injected
      )
    ).toHaveLength(2);
  }, 120000);

  it('executes typed short-circuit policy lazily with native parity', async () => {
    const source = `function expensive_policy(): bool {
  while (true) {
  }
  return false
}

function main(): i32 {
  if (false && expensive_policy()) {
    return 9
  }
  if (true || expensive_policy()) {
    return 5
  }
  return 0
}`;

    const nativeExitCode = executeHsNativeViaRust(source, 5000);
    const bytecode = compileHsToUaalViaRust(source);
    const vm = new UAALVirtualMachine({ recordLog: true });
    const result = await vm.execute(bytecode);
    const executionLog = vm.exportLog();

    expect(nativeExitCode).toBe(5);
    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe(nativeExitCode);
    expect(result.state.callStack).toEqual([]);
    type IndexedInstruction = { instruction: BytecodeInstruction; pc: number };
    const staticCallPcs = bytecode.instructions
      .map((instruction: BytecodeInstruction, pc: number): IndexedInstruction => ({
        instruction,
        pc,
      }))
      .filter(({ instruction }: IndexedInstruction) => instruction.opCode === UAALOpCode.CALL)
      .map(({ pc }: IndexedInstruction) => pc);
    const executedCallPcs = executionLog.steps
      .filter((step: LoggedStep) => step.opcode === UAALOpCode.CALL)
      .map((step: LoggedStep) => step.pc);
    expect(staticCallPcs).toHaveLength(3);
    expect(executedCallPcs).toEqual([0]);

    for (const step of executionLog.steps.filter(
      (entry: LoggedStep) => entry.opcode === UAALOpCode.JUMP_IF
    )) {
      expect(step.stackAfter.depth).toBe(step.stackBefore.depth - 1);
    }
  }, 120000);
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
