import { describe, it, expect, beforeEach, vi} from 'vitest';
import { VRChatCompiler } from '../VRChatCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestWorld', objects: [], ...overrides } as HoloComposition;
}

describe('VRChatCompiler', () => {
  let compiler: VRChatCompiler;

  beforeEach(() => {
    compiler = new VRChatCompiler();
  });

  // =========== Result structure ===========

  it('returns VRChatCompileResult with all fields', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result).toHaveProperty('mainScript');
    expect(result).toHaveProperty('udonScripts');
    expect(result).toHaveProperty('prefabHierarchy');
    expect(result).toHaveProperty('worldDescriptor');
  });

  // =========== Main script ===========

  it('generates UdonSharp main script', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.mainScript).toContain('UdonSharp');
    expect(result.mainScript).toContain('class');
  });

  it('includes VRChat SDK imports', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.mainScript).toContain('VRC');
  });

  // =========== Options ===========

  it('respects custom class name', () => {
    const c = new VRChatCompiler({ className: 'MyWorld' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.mainScript).toContain('MyWorld');
  });

  it('respects custom world name', () => {
    const c = new VRChatCompiler({ worldName: 'CoolWorld' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.worldDescriptor).toContain('CoolWorld');
  });

  // =========== State → fields ===========

  it('compiles state to UdonSharp fields', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'score', value: 0 }] },
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.mainScript).toContain('score');
  });

  // =========== Objects → prefab ===========

  it('generates prefab hierarchy with objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.prefabHierarchy).toContain('cube');
  });

  // =========== World descriptor ===========

  it('generates world descriptor', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.worldDescriptor).toBeDefined();
    expect(result.worldDescriptor.length).toBeGreaterThan(0);
  });

  // =========== Grabbable trait → Udon script ===========

  it('generates Udon scripts for interactable objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'coin', properties: [{ key: 'geometry', value: 'sphere' }], traits: [{ name: 'grabbable' }] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.udonScripts.size).toBeGreaterThan(0);
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects to prefab hierarchy', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.prefabHierarchy).toContain('obj_a');
    expect(result.prefabHierarchy).toContain('obj_b');
  });

  // =========== Convenience export ===========

  it('exports compileToVRChat convenience function', async () => {
    const mod = await import('../VRChatCompiler');
    expect(mod.compileToVRChat).toBeTypeOf('function');
  });
});
