/**
 * OnnxRuntimeTrait — refactored from 44-LOC stub to real InferenceAdapter wiring.
 * idea-run-3 Pattern B WIRE — flagged in research/2026-04-26_idea-run-3-neural-locomotion.md.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { onnxRuntimeHandler } from '../OnnxRuntimeTrait';
import {
  createNoOpInferenceAdapter,
  type InferenceAdapter,
  type Float32Tensor,
  type InferenceRequest,
  type InferenceResponse,
} from '../engines/onnx-adapter';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

const baseCfg = { execution_provider: 'cpu' };

function tensor(data: number[], shape: number[]): Float32Tensor {
  return { data: new Float32Array(data), shape };
}

/** Flush pending microtasks — the load→run→emit promise chain has 3 hops. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe('OnnxRuntimeTrait — InferenceAdapter wiring', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('onnx');
    ctx = createMockContext();
    attachTrait(onnxRuntimeHandler, node, baseCfg, ctx);
  });

  it('onAttach initializes empty model state', () => {
    const state = (node as any).__onnxState;
    expect(state.models.size).toBe(0);
    expect(state.loadPromises.size).toBe(0);
    expect(state.inferences).toBe(0);
  });

  it('onnx:load instantiates adapter via factory and emits onnx:loaded after resolve', async () => {
    sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, {
      type: 'onnx:load',
      modelId: 'biped_v2',
    });
    // Adapter is registered immediately; load is async
    const state = (node as any).__onnxState;
    expect(state.models.size).toBe(1);
    expect(state.models.get('biped_v2')).toBeDefined();
    // Wait for load promise to resolve
    await state.loadPromises.get('biped_v2');
    expect(getEventCount(ctx, 'onnx:loaded')).toBe(1);
    expect(getLastEvent(ctx, 'onnx:loaded')).toMatchObject({
      modelId: 'biped_v2',
      provider: 'cpu',
    });
  });

  it('onnx:load uses modelUrl when provided, falls back to modelId otherwise', async () => {
    let capturedUrl = '';
    const cfg = {
      execution_provider: 'webgpu',
      adapterFactory: (): InferenceAdapter => {
        const adapter = createNoOpInferenceAdapter();
        const origLoad = adapter.load.bind(adapter);
        adapter.load = (url: string) => {
          capturedUrl = url;
          return origLoad(url);
        };
        return adapter;
      },
    };
    const localNode = createMockNode('o2');
    const localCtx = createMockContext();
    attachTrait(onnxRuntimeHandler, localNode, cfg, localCtx);
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, {
      type: 'onnx:load',
      modelId: 'pfnn_v1',
      modelUrl: 'https://models.holoscript.net/pfnn_v1.onnx',
    });
    await (localNode as any).__onnxState.loadPromises.get('pfnn_v1');
    expect(capturedUrl).toBe('https://models.holoscript.net/pfnn_v1.onnx');
  });

  it('onnx:load falls back to modelId as URL when modelUrl omitted (/critic Annoying #12)', async () => {
    let capturedUrl = '';
    const cfg = {
      execution_provider: 'cpu',
      adapterFactory: (): InferenceAdapter => {
        const adapter = createNoOpInferenceAdapter();
        const origLoad = adapter.load.bind(adapter);
        adapter.load = (url: string) => {
          capturedUrl = url;
          return origLoad(url);
        };
        return adapter;
      },
    };
    const localNode = createMockNode('fb');
    const localCtx = createMockContext();
    attachTrait(onnxRuntimeHandler, localNode, cfg, localCtx);
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, {
      type: 'onnx:load',
      modelId: 'pfnn',
    });
    await flushMicrotasks();
    expect(capturedUrl).toBe('pfnn');
  });

  it('loadPromise is GC-ed from state after successful load (/critic Annoying #11)', async () => {
    sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, {
      type: 'onnx:load',
      modelId: 'gc_test',
    });
    const state = (node as any).__onnxState;
    // Promise present pre-resolve
    expect(state.loadPromises.has('gc_test')).toBe(true);
    await flushMicrotasks();
    // Promise GC-ed post-resolve
    expect(state.loadPromises.has('gc_test')).toBe(false);
    // But adapter still in models map
    expect(state.models.has('gc_test')).toBe(true);
  });

  it('onnx:load is idempotent — emits cached signal when same modelId loaded twice', async () => {
    sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, { type: 'onnx:load', modelId: 'm1' });
    await (node as any).__onnxState.loadPromises.get('m1');
    sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, { type: 'onnx:load', modelId: 'm1' });
    expect(getEventCount(ctx, 'onnx:loaded')).toBe(2);
    expect(getLastEvent(ctx, 'onnx:loaded')).toMatchObject({ modelId: 'm1', cached: true });
  });

  it('onnx:load emits onnx:error when modelId missing', () => {
    sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, { type: 'onnx:load' });
    expect(getEventCount(ctx, 'onnx:error')).toBe(1);
  });

  it('onnx:load failure removes adapter and emits onnx:error so retry is possible', async () => {
    const failingAdapterFactory = (): InferenceAdapter => ({
      name: 'failing',
      preferredProvider: 'cpu',
      loaded: false,
      load: async () => {
        throw new Error('weights file 404');
      },
      run: async () => ({ outputs: {}, durationMs: 0, providerUsed: 'cpu' }),
      dispose: () => {},
    });
    const cfg = { execution_provider: 'cpu', adapterFactory: failingAdapterFactory };
    const localNode = createMockNode('fail');
    const localCtx = createMockContext();
    attachTrait(onnxRuntimeHandler, localNode, cfg, localCtx);
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, {
      type: 'onnx:load',
      modelId: 'broken',
    });
    // Wait for the rejection — load promise is captured before delete-on-reject
    const state = (localNode as any).__onnxState;
    const loadPromise = state.loadPromises.get('broken');
    await loadPromise;
    expect(getEventCount(localCtx, 'onnx:error')).toBe(1);
    expect(getLastEvent(localCtx, 'onnx:error')).toMatchObject({
      modelId: 'broken',
      phase: 'load',
      error: 'weights file 404',
    });
    expect(state.models.has('broken')).toBe(false);
  });

  it('onnx:run on unloaded model emits onnx:error with helpful message', () => {
    sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, {
      type: 'onnx:run',
      modelId: 'unknown',
      inputs: { x: tensor([1, 2, 3], [3]) },
    });
    expect(getEventCount(ctx, 'onnx:error')).toBe(1);
    expect(getLastEvent(ctx, 'onnx:error')).toMatchObject({
      modelId: 'unknown',
    });
  });

  it('onnx:run with empty inputs emits onnx:error', () => {
    sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, {
      type: 'onnx:run',
      modelId: 'm1',
      inputs: {},
    });
    expect(getEventCount(ctx, 'onnx:error')).toBe(1);
  });

  it('onnx:run after onnx:load calls adapter.run and emits onnx:output with outputs', async () => {
    const runSpy = vi.fn(
      async (req: InferenceRequest): Promise<InferenceResponse> => ({
        outputs: { result: tensor([42, 84], [2]) },
        durationMs: 7,
        providerUsed: 'webgpu',
      })
    );
    const cfg = {
      execution_provider: 'webgpu',
      adapterFactory: (): InferenceAdapter => {
        const a = createNoOpInferenceAdapter();
        a.run = runSpy;
        return a;
      },
    };
    const localNode = createMockNode('rn');
    const localCtx = createMockContext();
    attachTrait(onnxRuntimeHandler, localNode, cfg, localCtx);
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, { type: 'onnx:load', modelId: 'm1' });
    await (localNode as any).__onnxState.loadPromises.get('m1');
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, {
      type: 'onnx:run',
      modelId: 'm1',
      inputs: { x: tensor([1, 2, 3, 4], [4]) },
    });
    await flushMicrotasks();
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(getEventCount(localCtx, 'onnx:output')).toBe(1);
    const output = getLastEvent(localCtx, 'onnx:output') as {
      modelId: string;
      inferences: number;
      outputs: Record<string, Float32Tensor>;
      durationMs: number;
      providerUsed: string;
    };
    expect(output.modelId).toBe('m1');
    expect(output.inferences).toBe(1);
    expect(Array.from(output.outputs.result.data)).toEqual([42, 84]);
    expect(output.durationMs).toBe(7);
    expect(output.providerUsed).toBe('webgpu');
  });

  it('onnx:run forwards requested output names to adapter', async () => {
    const runSpy = vi.fn(
      async (req: InferenceRequest): Promise<InferenceResponse> => ({
        outputs: { pose: tensor([0], [1]), phase: tensor([0], [1]) },
        durationMs: 0,
        providerUsed: 'cpu',
      })
    );
    const cfg = {
      execution_provider: 'cpu',
      adapterFactory: (): InferenceAdapter => {
        const a = createNoOpInferenceAdapter();
        a.run = runSpy;
        return a;
      },
    };
    const localNode = createMockNode('on');
    const localCtx = createMockContext();
    attachTrait(onnxRuntimeHandler, localNode, cfg, localCtx);
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, { type: 'onnx:load', modelId: 'm1' });
    await (localNode as any).__onnxState.loadPromises.get('m1');
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, {
      type: 'onnx:run',
      modelId: 'm1',
      inputs: { x: tensor([1], [1]) },
      outputs: ['pose', 'phase'],
    });
    await flushMicrotasks();
    expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({ outputs: ['pose', 'phase'] }));
  });

  it('onnx:run inferences counter accumulates across calls', async () => {
    sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, { type: 'onnx:load', modelId: 'm1' });
    await (node as any).__onnxState.loadPromises.get('m1');
    for (let i = 0; i < 3; i++) {
      sendEvent(onnxRuntimeHandler, node, baseCfg, ctx, {
        type: 'onnx:run',
        modelId: 'm1',
        inputs: { x: tensor([1], [1]) },
      });
      await flushMicrotasks();
    }
    expect((node as any).__onnxState.inferences).toBe(3);
    expect(getEventCount(ctx, 'onnx:output')).toBe(3);
  });

  it('onnx:dispose calls adapter.dispose and removes model from state', async () => {
    const disposeSpy = vi.fn();
    const cfg = {
      execution_provider: 'cpu',
      adapterFactory: (): InferenceAdapter => {
        const a = createNoOpInferenceAdapter();
        a.dispose = disposeSpy;
        return a;
      },
    };
    const localNode = createMockNode('di');
    const localCtx = createMockContext();
    attachTrait(onnxRuntimeHandler, localNode, cfg, localCtx);
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, { type: 'onnx:load', modelId: 'm1' });
    await (localNode as any).__onnxState.loadPromises.get('m1');
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, {
      type: 'onnx:dispose',
      modelId: 'm1',
    });
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect((localNode as any).__onnxState.models.has('m1')).toBe(false);
    expect(getEventCount(localCtx, 'onnx:disposed')).toBe(1);
  });

  it('onDetach disposes ALL adapters', async () => {
    const disposeSpy = vi.fn();
    const cfg = {
      execution_provider: 'cpu',
      adapterFactory: (): InferenceAdapter => {
        const a = createNoOpInferenceAdapter();
        a.dispose = disposeSpy;
        return a;
      },
    };
    const localNode = createMockNode('det');
    const localCtx = createMockContext();
    attachTrait(onnxRuntimeHandler, localNode, cfg, localCtx);
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, { type: 'onnx:load', modelId: 'a' });
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, { type: 'onnx:load', modelId: 'b' });
    sendEvent(onnxRuntimeHandler, localNode, cfg, localCtx, { type: 'onnx:load', modelId: 'c' });
    onnxRuntimeHandler.onDetach!(localNode as any, cfg as any, localCtx as any);
    expect(disposeSpy).toHaveBeenCalledTimes(3);
    expect((localNode as any).__onnxState).toBeUndefined();
  });
});
