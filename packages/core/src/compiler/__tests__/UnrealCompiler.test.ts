import { describe, it, expect, beforeEach, vi} from 'vitest';
import { UnrealCompiler } from '../UnrealCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

describe('UnrealCompiler', () => {
  let compiler: UnrealCompiler;

  beforeEach(() => {
    compiler = new UnrealCompiler();
  });

  // =========== Result structure ===========

  it('returns UnrealCompileResult with header and source', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result).toHaveProperty('headerFile');
    expect(result).toHaveProperty('sourceFile');
  });

  // =========== Header file ===========

  it('generates C++ header with UCLASS macro', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.headerFile).toContain('UCLASS');
    expect(result.headerFile).toContain('AActor');
  });

  it('includes generated header guards', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.headerFile).toContain('#pragma once');
  });

  // =========== Source file ===========

  it('generates C++ source file', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.sourceFile).toContain('#include');
  });

  // =========== Options ===========

  it('respects custom class name', () => {
    const c = new UnrealCompiler({ className: 'AMyActor' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.headerFile).toContain('AMyActor');
  });

  it('respects engine version', () => {
    const c = new UnrealCompiler({ engineVersion: '5.3' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.headerFile).toBeDefined();
  });

  // =========== Blueprint generation ===========

  it('generates blueprint JSON when enabled', () => {
    const c = new UnrealCompiler({ generateBlueprints: true });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.blueprintJson).toBeDefined();
    expect(result.blueprintJson!.length).toBeGreaterThan(0);
  });

  it('omits blueprint JSON when disabled', () => {
    const c = new UnrealCompiler({ generateBlueprints: false });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.blueprintJson).toBeUndefined();
  });

  // =========== State → UPROPERTY ===========

  it('compiles state to UPROPERTY fields', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'Health', value: 100 }] },
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.headerFile).toContain('UPROPERTY');
    expect(result.headerFile).toContain('Health');
  });

  // =========== Objects → components ===========

  it('compiles objects to actor components', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.headerFile).toContain('cube');
    expect(result.sourceFile).toContain('cube');
  });

  // =========== Lights ===========

  it('compiles lights to light components', () => {
    const comp = makeComposition({
      lights: [{ name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 2.0 }] }] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.sourceFile).toContain('Light');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.sourceFile).toContain('obj_a');
    expect(result.sourceFile).toContain('obj_b');
  });

  // =========== Reset ===========

  it('resets between compilations', () => {
    compiler.compile(makeComposition({ name: 'first' }), 'test-token');
    const result = compiler.compile(makeComposition({ name: 'second' }), 'test-token');
    expect(result.sourceFile).toContain('second');
  });

  // =========== Convenience export ===========

  it('exports compileToUnreal convenience function', async () => {
    const mod = await import('../UnrealCompiler');
    expect(mod.compileToUnreal).toBeTypeOf('function');
  });
});
