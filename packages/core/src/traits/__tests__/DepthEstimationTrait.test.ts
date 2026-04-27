/**
 * DepthEstimationTrait — tests covering metadata and sync lifecycle paths
 */
import { describe, it, expect, vi } from 'vitest';

// Mock @xenova/transformers so the async IIFE in onAttach completes
vi.mock('@xenova/transformers', () => {
  const mockPipeline = vi.fn().mockResolvedValue(vi.fn());
  return {
    pipeline: mockPipeline,
    env: {
      useBrowserCache: false,
      cacheDir: '',
      backends: { onnx: { wasm: { proxy: false } } },
    },
  };
});

import depthEstimationTraitHandler from '../DepthEstimationTrait';

const makeNode = () => {
  const node = {
    id: 'depth-node',
    traits: new Set<string>(),
    emit: vi.fn(),
    on: vi.fn(),
    __depthEstimationState: undefined as unknown,
    userData: {} as Record<string, unknown>,
  };
  return node;
};

const defaultConfig = {};
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DepthEstimationTrait — metadata', () => {
  it('exports a handler with name matching "@depth_estimation"', () => {
    expect(depthEstimationTraitHandler.name).toContain('depth_estimation');
  });

  it('defaultConfig has modelId', () => {
    expect(depthEstimationTraitHandler.defaultConfig?.modelId).toContain('depth-anything');
  });

  it('defaultConfig mode is "on-demand"', () => {
    expect(depthEstimationTraitHandler.defaultConfig?.mode).toBe('on-demand');
  });

  it('defaultConfig emitNormalized is true', () => {
    expect(depthEstimationTraitHandler.defaultConfig?.emitNormalized).toBe(true);
  });
});

describe('DepthEstimationTrait — sync lifecycle', () => {
  it('onAttach emits depth:ready with false synchronously', async () => {
    const node = makeNode();
    await depthEstimationTraitHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    // depth:ready false must be called (at minimum once) from onAttach
    const readyCalls = node.emit.mock.calls.filter(([t]) => t === 'depth:ready');
    expect(readyCalls.length).toBeGreaterThan(0);
    expect(readyCalls[0][1]).toBe(false);
  });

  it('onAttach stores __depthEstimationState on node', async () => {
    const node = makeNode();
    await depthEstimationTraitHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__depthEstimationState).toBeTruthy();
  });

  it('onDetach clears __depthEstimationState', async () => {
    const node = makeNode();
    await depthEstimationTraitHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    await depthEstimationTraitHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__depthEstimationState).toBeUndefined();
  });

  it('onDetach emits depth:ready with false', async () => {
    const node = makeNode();
    await depthEstimationTraitHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    await depthEstimationTraitHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    const readyCalls = node.emit.mock.calls.filter(([t]) => t === 'depth:ready');
    expect(readyCalls.length).toBeGreaterThan(0);
    expect(readyCalls[readyCalls.length - 1][1]).toBe(false);
  });
});
