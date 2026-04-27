/**
 * ChaosTestTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { chaosTestHandler } from '../ChaosTestTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __chaosState: undefined as unknown,
});

const defaultConfig = { failure_rate: 0.1 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('ChaosTestTrait — metadata', () => {
  it('has name "chaos_test"', () => {
    expect(chaosTestHandler.name).toBe('chaos_test');
  });

  it('defaultConfig failure_rate is 0.1', () => {
    expect(chaosTestHandler.defaultConfig?.failure_rate).toBe(0.1);
  });
});

describe('ChaosTestTrait — lifecycle', () => {
  it('onAttach initializes state', () => {
    const node = makeNode();
    chaosTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__chaosState as { injected: number; types: string[] };
    expect(state.injected).toBe(0);
    expect(state.types).toEqual([]);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    chaosTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    chaosTestHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__chaosState).toBeUndefined();
  });
});

describe('ChaosTestTrait — onEvent', () => {
  it('chaos:inject increments count and emits chaos:injected with default fault=latency', () => {
    const node = makeNode();
    chaosTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    chaosTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'chaos:inject',
    } as never);
    const state = node.__chaosState as { injected: number; types: string[] };
    expect(state.injected).toBe(1);
    expect(state.types).toContain('latency');
    expect(node.emit).toHaveBeenCalledWith('chaos:injected', expect.objectContaining({
      fault: 'latency', count: 1, rate: 0.1,
    }));
  });

  it('chaos:inject with specific fault type', () => {
    const node = makeNode();
    chaosTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    chaosTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'chaos:inject', fault: 'crash',
    } as never);
    const state = node.__chaosState as { injected: number; types: string[] };
    expect(state.types).toContain('crash');
  });

  it('multiple chaos:inject increments count', () => {
    const node = makeNode();
    chaosTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    for (let i = 0; i < 3; i++) {
      chaosTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'chaos:inject', fault: 'timeout',
      } as never);
    }
    const state = node.__chaosState as { injected: number };
    expect(state.injected).toBe(3);
  });

  it('chaos:report emits summary', () => {
    const node = makeNode();
    chaosTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    chaosTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'chaos:inject', fault: 'memory_leak',
    } as never);
    node.emit.mockClear();
    chaosTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'chaos:report',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('chaos:report', expect.objectContaining({
      injected: 1,
      types: ['memory_leak'],
    }));
  });

  it('chaos:report types is a copy (not same reference)', () => {
    const node = makeNode();
    chaosTestHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    chaosTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'chaos:inject', fault: 'disk_full',
    } as never);
    node.emit.mockClear();
    chaosTestHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'chaos:report',
    } as never);
    const reported = (node.emit.mock.calls[0][1] as { types: string[] }).types;
    const state = node.__chaosState as { types: string[] };
    expect(reported).not.toBe(state.types); // spread copy
    expect(reported).toEqual(state.types);
  });
});
