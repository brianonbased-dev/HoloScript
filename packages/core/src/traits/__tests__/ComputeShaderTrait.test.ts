/**
 * ComputeShaderTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { computeShaderHandler } from '../ComputeShaderTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __csState: undefined as unknown,
});

const defaultConfig = { max_workgroups: 256 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('ComputeShaderTrait — metadata', () => {
  it('has name "compute_shader"', () => {
    expect(computeShaderHandler.name).toBe('compute_shader');
  });

  it('defaultConfig max_workgroups is 256', () => {
    expect(computeShaderHandler.defaultConfig?.max_workgroups).toBe(256);
  });
});

describe('ComputeShaderTrait — lifecycle', () => {
  it('onAttach initializes state', () => {
    const node = makeNode();
    computeShaderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__csState as { dispatches: number; shaders: Map<string, unknown> };
    expect(state.dispatches).toBe(0);
    expect(state.shaders).toBeInstanceOf(Map);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    computeShaderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    computeShaderHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__csState).toBeUndefined();
  });
});

describe('ComputeShaderTrait — onEvent', () => {
  it('cs:compile stores shader and emits cs:compiled', () => {
    const node = makeNode();
    computeShaderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    computeShaderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cs:compile', shaderId: 'blur', workgroups: [64, 1, 1],
    } as never);
    const state = node.__csState as { shaders: Map<string, { workgroups: number[] }> };
    expect(state.shaders.get('blur')?.workgroups).toEqual([64, 1, 1]);
    expect(node.emit).toHaveBeenCalledWith('cs:compiled', { shaderId: 'blur' });
  });

  it('cs:compile uses default workgroups when not provided', () => {
    const node = makeNode();
    computeShaderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    computeShaderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cs:compile', shaderId: 'default-wg',
    } as never);
    const state = node.__csState as { shaders: Map<string, { workgroups: number[] }> };
    expect(state.shaders.get('default-wg')?.workgroups).toEqual([64, 1, 1]);
  });

  it('cs:dispatch increments count and emits cs:dispatched', () => {
    const node = makeNode();
    computeShaderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    computeShaderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'cs:dispatch', shaderId: 'blur',
    } as never);
    const state = node.__csState as { dispatches: number };
    expect(state.dispatches).toBe(1);
    expect(node.emit).toHaveBeenCalledWith('cs:dispatched', { shaderId: 'blur', dispatches: 1 });
  });

  it('cs:dispatch accumulates across multiple calls', () => {
    const node = makeNode();
    computeShaderHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    for (let i = 0; i < 5; i++) {
      computeShaderHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'cs:dispatch', shaderId: 's',
      } as never);
    }
    const state = node.__csState as { dispatches: number };
    expect(state.dispatches).toBe(5);
  });
});
