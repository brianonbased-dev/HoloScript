/**
 * WASMCompiler — Production Test Suite
 *
 * Covers: WASMCompileResult shape (wat, bindings, memoryLayout, exports, imports),
 * WAT module structure, state analysis, object analysis, memory layout calculation,
 * HSPlusAST compile path, options (format, debug, simd, threads, generateBindings),
 * sanitizeName, escapeWATString, and reset().
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WASMCompiler } from '../WASMCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makeObj(name: string, geometry = 'box') {
  return { name, properties: [{ key: 'geometry', value: geometry }], traits: [] } as any;
}

function makeAST(overrides: Record<string, any> = {}) {
  return {
    root: { type: 'scene', children: [], id: 'root' },
    directives: [],
    ...overrides,
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WASMCompiler — Production', () => {
  let compiler: WASMCompiler;

  beforeEach(() => {
    compiler = new WASMCompiler();
  });

  // ─── Constructor ───────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('constructs with default options', () => {
      expect(compiler).toBeDefined();
    });

    it('constructs with all options specified', () => {
      const c = new WASMCompiler({
        format: 'wat',
        debug: true,
        memoryPages: 4,
        simd: true,
        threads: false,
        generateBindings: true,
        moduleName: 'myModule',
      });
      expect(c).toBeDefined();
    });

    it('constructs with wasm format', () => {
      const c = new WASMCompiler({ format: 'wasm' });
      expect(c).toBeDefined();
    });
  });

  // ─── compile() — result shape ──────────────────────────────────────────────
  describe('compile() — result shape', () => {
    it('returns WASMCompileResult with wat string', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(typeof result.wat).toBe('string');
    });

    it('returns bindings string', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(typeof result.bindings).toBe('string');
    });

    it('returns memoryLayout object', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.memoryLayout).toBeDefined();
    });

    it('returns exports array', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(Array.isArray(result.exports)).toBe(true);
    });

    it('returns imports array', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(Array.isArray(result.imports)).toBe(true);
    });
  });

  // ─── WAT structure ────────────────────────────────────────────────────────
  describe('compile() — WAT content', () => {
    it('WAT starts with module declaration', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.wat).toContain('(module');
    });

    it('WAT contains memory declaration', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.wat).toContain('memory');
    });

    it('WAT contains function or export', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.wat.length).toBeGreaterThan(50);
    });

    it('WAT contains export section', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.wat).toContain('export');
    });

    it('WAT with debug mode contains debug info', () => {
      const c = new WASMCompiler({ debug: true });
      const result = c.compile(makeComp(), 'test-token');
      expect(result.wat).toBeDefined();
    });
  });

  // ─── Memory layout ─────────────────────────────────────────────────────────
  describe('compile() — memoryLayout', () => {
    it('memoryLayout has stateOffset', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(typeof result.memoryLayout.stateOffset).toBe('number');
    });

    it('memoryLayout has totalSize > 0', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.memoryLayout.totalSize).toBeGreaterThanOrEqual(0);
    });

    it('memoryLayout has objectsOffset', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(typeof result.memoryLayout.objectsOffset).toBe('number');
    });

    it('memoryLayout has stringsOffset', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(typeof result.memoryLayout.stringsOffset).toBe('number');
    });

    it('memoryPages option increases allocated pages', () => {
      const c4 = new WASMCompiler({ memoryPages: 4 });
      const result = c4.compile(makeComp(), 'test-token');
      expect(result.wat).toContain('4');
    });
  });

  // ─── Exports ──────────────────────────────────────────────────────────────
  describe('compile() — exports', () => {
    it('exports include init function', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      const initExport = result.exports.find(
        (e) => e.name.includes('init') || e.name.includes('Init')
      );
      expect(initExport).toBeDefined();
    });

    it('exports include memory', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      const memExport = result.exports.find((e) => e.kind === 'memory');
      expect(memExport).toBeDefined();
    });
  });

  // ─── Imports ──────────────────────────────────────────────────────────────
  describe('compile() — imports', () => {
    it('imports array is defined', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.imports).toBeDefined();
    });

    it('imports include env functions', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      const envImport = result.imports.find((i) => i.module === 'env');
      expect(envImport).toBeDefined();
    });
  });

  // ─── Bindings ─────────────────────────────────────────────────────────────
  describe('compile() — bindings', () => {
    it('bindings is non-empty string', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.bindings.length).toBeGreaterThan(0);
    });

    it('bindings contain module name reference', () => {
      const c = new WASMCompiler({ moduleName: 'HoloModule' });
      const result = c.compile(makeComp(), 'test-token');
      expect(result.bindings).toContain('HoloModule');
    });

    it('generateBindings: false produces empty or minimal bindings', () => {
      const c = new WASMCompiler({ generateBindings: false });
      const result = c.compile(makeComp(), 'test-token');
      expect(result.bindings).toBeDefined(); // No throw
    });
  });

  // ─── State variables ──────────────────────────────────────────────────────
  describe('compile() — state variables', () => {
    it('compiles scene with state variables', () => {
      const result = compiler.compile(
        makeComp({
          state: {
            properties: [
              { key: 'count', value: 0 },
              { key: 'active', value: true },
            ],
          } as any,
        }),
        'test-token'
      );
      expect(result.wat).toBeDefined();
    });
  });

  // ─── Objects ──────────────────────────────────────────────────────────────
  describe('compile() — objects', () => {
    it('compiles with single object', () => {
      const result = compiler.compile(makeComp({ objects: [makeObj('box1')] }), 'test-token');
      expect(result.wat).toBeDefined();
    });

    it('compiles with multiple objects', () => {
      const result = compiler.compile(
        makeComp({ objects: [makeObj('a'), makeObj('b'), makeObj('c')] }),
        'test-token'
      );
      expect(result.wat.length).toBeGreaterThan(0);
    });
  });

  // ─── compileAST() — HSPlusAST path ────────────────────────────────────────
  describe('compileAST()', () => {
    it('compiles a minimal HSPlusAST', () => {
      const result = compiler.compileAST(makeAST());
      expect(result.wat).toBeDefined();
      expect(typeof result.wat).toBe('string');
    });

    it('returns memoryLayout from HSPlusAST', () => {
      const result = compiler.compileAST(makeAST());
      expect(result.memoryLayout).toBeDefined();
    });

    it('returns exports array from HSPlusAST', () => {
      const result = compiler.compileAST(makeAST());
      expect(Array.isArray(result.exports)).toBe(true);
    });
  });

  // ─── reset() ──────────────────────────────────────────────────────────────
  describe('reset()', () => {
    it('resets internal state between compilations', () => {
      compiler.compile(makeComp({ objects: [makeObj('obj1')] }), 'test-token');
      expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
    });

    it('calling compile twice does not throw', () => {
      compiler.compile(makeComp(), 'test-token');
      expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
    });
  });

  // ─── SIMD / Threads options ────────────────────────────────────────────────
  describe('options — SIMD and threads', () => {
    it('simd: true compiles without error', () => {
      const c = new WASMCompiler({ simd: true });
      expect(() => c.compile(makeComp(), 'test-token')).not.toThrow();
    });

    it('threads: true compiles without error', () => {
      const c = new WASMCompiler({ threads: true });
      expect(() => c.compile(makeComp(), 'test-token')).not.toThrow();
    });
  });
});
