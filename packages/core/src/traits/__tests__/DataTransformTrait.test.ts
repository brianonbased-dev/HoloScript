/**
 * DataTransformTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { dataTransformHandler } from '../DataTransformTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __dtState: undefined as unknown,
});

const defaultConfig = { strict: false };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DataTransformTrait — metadata', () => {
  it('has name "data_transform"', () => {
    expect(dataTransformHandler.name).toBe('data_transform');
  });

  it('defaultConfig strict is false', () => {
    expect(dataTransformHandler.defaultConfig?.strict).toBe(false);
  });
});

describe('DataTransformTrait — lifecycle', () => {
  it('onAttach initializes transforms counter to 0', () => {
    const node = makeNode();
    dataTransformHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__dtState as { transforms: number };
    expect(state.transforms).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    dataTransformHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataTransformHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__dtState).toBeUndefined();
  });
});

describe('DataTransformTrait — onEvent', () => {
  it('transform:apply emits transform:applied with mapping and count', () => {
    const node = makeNode();
    dataTransformHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataTransformHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'transform:apply', mapping: { from: 'snake_case', to: 'camelCase' },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('transform:applied', {
      mapping: { from: 'snake_case', to: 'camelCase' },
      count: 1,
    });
  });

  it('increments transform count on each apply', () => {
    const node = makeNode();
    dataTransformHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    for (let i = 0; i < 3; i++) {
      dataTransformHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'transform:apply', mapping: {},
      } as never);
    }
    const state = node.__dtState as { transforms: number };
    expect(state.transforms).toBe(3);
  });
});
