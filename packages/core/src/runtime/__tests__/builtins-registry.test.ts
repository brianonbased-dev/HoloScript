import { describe, it, expect, vi } from 'vitest';
import { createBuiltinsMap } from '../builtins-registry.js';
import type { BuiltinsContext } from '../builtins-registry.js';

function makeCtx(): BuiltinsContext {
  return {
    uiElements: new Map(),
    hologramState: new Map(),
    spatialMemory: new Map(),
    animations: new Map(),
    variables: new Map(),
    templates: new Map(),
    executionStack: [],
    agentRuntimes: new Map(),
    createParticleEffect: vi.fn(),
    createConnectionStream: vi.fn(),
    emit: vi.fn(),
    setVariable: vi.fn(),
    getVariable: vi.fn().mockReturnValue(null),
    executeOrb: vi.fn().mockResolvedValue({ success: true }),
    calculateArc: vi.fn().mockReturnValue([]),
  };
}

describe('createBuiltinsMap', () => {
  it('returns a Map', () => {
    const ctx = makeCtx();
    const result = createBuiltinsMap(ctx);
    expect(result).toBeInstanceOf(Map);
  });

  it('contains show builtin', () => {
    const ctx = makeCtx();
    const builtins = createBuiltinsMap(ctx);
    expect(builtins.has('show')).toBe(true);
  });

  it('contains hide builtin', () => {
    const ctx = makeCtx();
    const builtins = createBuiltinsMap(ctx);
    expect(builtins.has('hide')).toBe(true);
  });

  it('injects custom functions', () => {
    const ctx = makeCtx();
    const custom = { myCustomFn: vi.fn().mockReturnValue(42) };
    const builtins = createBuiltinsMap(ctx, custom);
    expect(builtins.has('myCustomFn')).toBe(true);
  });

  it('builtin show overwrites custom show', () => {
    const ctx = makeCtx();
    const customShow = vi.fn().mockReturnValue('custom');
    const builtins = createBuiltinsMap(ctx, { show: customShow });
    const showFn = builtins.get('show')!;
    // builtin show should override custom
    expect(showFn).not.toBe(customShow);
  });

  it('custom function preserved for non-conflicting names', () => {
    const ctx = makeCtx();
    const myFn = vi.fn();
    const builtins = createBuiltinsMap(ctx, { uniqueFnXYZ: myFn });
    expect(builtins.get('uniqueFnXYZ')).toBe(myFn);
  });

  it('show builtin returns result with shown key', () => {
    const ctx = makeCtx();
    ctx.hologramState.set('obj1', { shape: 'cube', color: '#fff', size: 1, glow: false, interactive: false });
    const builtins = createBuiltinsMap(ctx);
    const showFn = builtins.get('show')!;
    const result = showFn(['obj1'] as never);
    expect((result as Record<string, unknown>).shown).toBe('obj1');
  });
});
