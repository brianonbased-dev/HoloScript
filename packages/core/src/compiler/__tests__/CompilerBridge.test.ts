import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompilerBridge, getCompilerBridge } from '../CompilerBridge';
import type { CompilationResult } from '../CompilerBridge';

// ============================================================================
// We test the synchronous getMetrics(), singleton management, and compile/
// validate error paths. The async compile()/validate() methods require mocking
// the dynamic import('../index') since the real tokenizer/parser/R3FCompiler
// would pull the full core bundle. We mock at the module level.
// ============================================================================

const { mockParse, mockCompile } = vi.hoisted(() => ({
  mockParse: vi.fn(),
  mockCompile: vi.fn(),
}));

vi.mock('../../parser/HoloScriptPlusParser', () => ({
  HoloScriptPlusParser: class {
    parse() {
      return mockParse();
    }
  },
}));

vi.mock('../R3FCompiler', () => ({
  R3FCompiler: class {
    compile() {
      return mockCompile();
    }
  },
}));

describe('CompilerBridge', () => {
  // --------------------------------------------------------------------------
  // getMetrics (synchronous, no initialization needed)
  // --------------------------------------------------------------------------
  describe('getMetrics()', () => {
    it('counts lines and characters', () => {
      const bridge = new CompilerBridge();
      const metrics = bridge.getMetrics('line1\nline2\nline3');
      expect(metrics.lines).toBe(3);
      expect(metrics.characters).toBe(17);
    });

    it('estimates zones from "orb" keyword occurrences', () => {
      const bridge = new CompilerBridge();
      const source = 'orb "a" {}\norb "b" {}\norb "c" {}';
      const metrics = bridge.getMetrics(source);
      expect(metrics.estimatedZones).toBe(3);
    });

    it('classifies complexity as simple when no handlers', () => {
      const bridge = new CompilerBridge();
      const metrics = bridge.getMetrics('orb "simple" { color: red }');
      expect(metrics.estimatedComplexity).toBe('simple');
    });

    it('classifies complexity as moderate (>5 handlers or >3 zones)', () => {
      const bridge = new CompilerBridge();
      const source = Array(4).fill('orb "z" {}').join('\n');
      const metrics = bridge.getMetrics(source);
      expect(metrics.estimatedComplexity).toBe('moderate');
    });

    it('classifies complexity as complex (>15 handlers or >8 zones)', () => {
      const bridge = new CompilerBridge();
      const handlers = Array(16).fill('on_click {}').join('\n');
      const metrics = bridge.getMetrics(handlers);
      expect(metrics.estimatedComplexity).toBe('complex');
    });

    it('returns zero zones for empty input', () => {
      const bridge = new CompilerBridge();
      const metrics = bridge.getMetrics('');
      expect(metrics.estimatedZones).toBe(0);
      expect(metrics.lines).toBe(1); // '' splits into ['']
      expect(metrics.characters).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // compile() — async with mocked core modules
  // --------------------------------------------------------------------------
  describe('compile()', () => {
    beforeEach(() => {
      mockParse.mockReset();
      mockCompile.mockReset();
    });

    it('returns error for empty input', async () => {
      const bridge = new CompilerBridge();
      const result = await bridge.compile('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty HoloScript input');
    });

    it('returns error for whitespace-only input', async () => {
      const bridge = new CompilerBridge();
      const result = await bridge.compile('   \n\t  ');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty HoloScript input');
    });

    it('returns error when parser produces empty AST', async () => {
      mockParse.mockReturnValue({ success: true, ast: [] });
      const bridge = new CompilerBridge();
      const result = await bridge.compile('orb "test" {}');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse HoloScript');
    });

    it('returns error when parser catches syntax errors', async () => {
      mockParse.mockReturnValue({ success: false, errors: [{ message: 'Syntax Error' }] });
      const bridge = new CompilerBridge();
      const result = await bridge.compile('orb "test" {}');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Syntax Error');
    });

    it('compiles successfully and returns metadata', async () => {
      const fakeAST = [
        { entities: [{ handlers: [{}, {}] }, { handlers: [{}] }] },
        { entities: [{ handlers: [] }] },
      ];
      mockParse.mockReturnValue({ success: true, ast: fakeAST });
      mockCompile.mockReturnValue('<R3FScene />');

      const bridge = new CompilerBridge();
      const result: CompilationResult = await bridge.compile('orb "hello" { color: red }');

      expect(result.success).toBe(true);
      expect(result.r3fCode).toBe('<R3FScene />');
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.zones).toBe(2);
      expect(result.metadata!.entities).toBe(3);
      expect(result.metadata!.handlers).toBe(3);
      expect(typeof result.metadata!.duration).toBe('number');
    });
  });

  // --------------------------------------------------------------------------
  // validate()
  // --------------------------------------------------------------------------
  describe('validate()', () => {
    beforeEach(() => {
      mockParse.mockReset();
    });

    it('returns invalid for empty input', async () => {
      const bridge = new CompilerBridge();
      const result = await bridge.validate('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Empty input');
    });

    it('returns valid when parser succeeds', async () => {
      mockParse.mockReturnValue({ success: true, ast: [{ type: 'zone' }] });

      const bridge = new CompilerBridge();
      const result = await bridge.validate('orb "test" {}');
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // getCompilerBridge() singleton
  // --------------------------------------------------------------------------
  describe('getCompilerBridge()', () => {
    it('returns the same instance on repeated calls', () => {
      const a = getCompilerBridge();
      const b = getCompilerBridge();
      expect(a).toBe(b);
    });

    it('returns a CompilerBridge instance', () => {
      const bridge = getCompilerBridge();
      expect(bridge).toBeInstanceOf(CompilerBridge);
    });
  });
});
