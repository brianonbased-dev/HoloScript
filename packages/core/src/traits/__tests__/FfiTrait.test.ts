/**
 * FfiTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { ffiHandler } from '../FfiTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __ffiState: undefined as unknown,
});

const defaultConfig = { allowed_libs: ['libc.so', 'libmath.so'] };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('FfiTrait — metadata', () => {
  it('has name "ffi"', () => {
    expect(ffiHandler.name).toBe('ffi');
  });

  it('defaultConfig allowed_libs is empty array', () => {
    expect(ffiHandler.defaultConfig?.allowed_libs).toEqual([]);
  });
});

describe('FfiTrait — lifecycle', () => {
  it('onAttach initializes bindings map and calls counter', () => {
    const node = makeNode();
    ffiHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__ffiState as { bindings: Map<string, string>; calls: number };
    expect(state.bindings).toBeInstanceOf(Map);
    expect(state.calls).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    ffiHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    ffiHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__ffiState).toBeUndefined();
  });
});

describe('FfiTrait — onEvent', () => {
  it('ffi:bind stores symbol-lib binding and emits ffi:bound', () => {
    const node = makeNode();
    ffiHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    ffiHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ffi:bind', symbol: 'malloc', lib: 'libc.so',
    } as never);
    const state = node.__ffiState as { bindings: Map<string, string> };
    expect(state.bindings.get('malloc')).toBe('libc.so');
    expect(node.emit).toHaveBeenCalledWith('ffi:bound', { symbol: 'malloc', lib: 'libc.so' });
  });

  it('ffi:call increments call counter and emits ffi:result', () => {
    const node = makeNode();
    ffiHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    ffiHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ffi:call', symbol: 'malloc',
    } as never);
    ffiHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ffi:call', symbol: 'free',
    } as never);
    const state = node.__ffiState as { calls: number };
    expect(state.calls).toBe(2);
    expect(node.emit).toHaveBeenLastCalledWith('ffi:result', { symbol: 'free', callCount: 2 });
  });
});
