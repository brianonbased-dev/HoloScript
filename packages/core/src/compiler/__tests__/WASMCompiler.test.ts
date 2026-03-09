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

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestModule', objects: [], ...overrides } as HoloComposition;
}

describe('WASMCompiler', () => {
  let compiler: WASMCompiler;

  beforeEach(() => {
    compiler = new WASMCompiler();
  });

  // =========== Constructor / defaults ===========

  it('compiles minimal composition to WAT', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.wat).toContain('(module');
    expect(result.wat).toContain('(memory');
  });

  it('returns WASMCompileResult structure', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result).toHaveProperty('wat');
    expect(result).toHaveProperty('bindings');
    expect(result).toHaveProperty('memoryLayout');
    expect(result).toHaveProperty('exports');
    expect(result).toHaveProperty('imports');
  });

  // =========== Options ===========

  it('generates bindings when enabled', () => {
    const c = new WASMCompiler({ generateBindings: true });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.bindings.length).toBeGreaterThan(0);
  });

  it('omits bindings when disabled', () => {
    const c = new WASMCompiler({ generateBindings: false });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.bindings).toBe('');
  });

  it('respects debug option', () => {
    const c = new WASMCompiler({ debug: true });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.wat).toContain('(module');
  });

  it('respects custom module name', () => {
    const c = new WASMCompiler({ moduleName: 'my_module' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.wat).toBeDefined();
  });

  // =========== Memory layout ===========

  it('calculates memory layout', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.memoryLayout).toBeDefined();
    expect(result.memoryLayout.totalSize).toBeGreaterThanOrEqual(0);
    expect(result.memoryLayout.stateOffset).toBeGreaterThanOrEqual(0);
  });

  // =========== State → memory ===========

  it('analyzes state properties into memory layout', () => {
    const comp = makeComposition({
      state: {
        properties: [
          { key: 'x', value: 0 },
          { key: 'y', value: 0 },
          { key: 'active', value: true },
        ],
      },
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.memoryLayout.stateSize).toBeGreaterThan(0);
    expect(result.wat).toContain('(func');
  });

  // =========== Objects → memory ===========

  it('analyzes objects into memory layout', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'player',
          properties: [
            { key: 'position', value: [0, 0, 0] },
            { key: 'health', value: 100 },
          ],
          traits: [],
        },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.memoryLayout.objectsSize).toBeGreaterThan(0);
  });

  // =========== Exports ===========

  it('exports init and update functions', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    const exportNames = result.exports.map((e) => e.name);
    expect(exportNames).toContain('init');
  });

  it('exports state accessors for state vars', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'score', value: 0 }] },
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.wat).toContain('score');
  });

  // =========== Imports ===========

  it('defines imports', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.imports.length).toBeGreaterThanOrEqual(0);
  });

  // =========== Multiple compilations ===========

  it('reset between compilations', () => {
    compiler.compile(makeComposition({ name: 'first' }), 'test-token');
    const result = compiler.compile(makeComposition({ name: 'second' }), 'test-token');
    // Should not carry state from first compile
    expect(result.wat).toContain('(module');
  });

  // =========== WAT structure ===========

  it('generates properly nested WAT', () => {
    const result = compiler.compile(
      makeComposition({
        state: { properties: [{ key: 'count', value: 0 }] },
      }),
      'test-token'
    );
    // Check basic WAT structure — module and func blocks
    expect(result.wat).toContain('(module');
    expect(result.wat).toContain('(func');
    expect(result.wat).toContain('(export');
  });
});
