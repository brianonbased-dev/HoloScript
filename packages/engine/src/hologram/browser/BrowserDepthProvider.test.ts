/**
 * BrowserDepthProvider — adapter tests.
 *
 * We inject a stub DepthEstimationService so we can run in node-vitest
 * without WebGPU / Transformers.js / IndexedDB. The provider's job is
 *   media → ImageData (via injected decoder)
 *   ImageData → depth map (via injected service)
 *   shape adapt to DepthInferenceResult
 * and we assert each leg.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  BrowserDepthProvider,
  type ImageDecoder,
} from './BrowserDepthProvider';
import type { DepthEstimationService } from '../DepthEstimationService';

// ── Stubs ───────────────────────────────────────────────────────────────────

interface StubServiceState {
  initialized: boolean;
  initializeCalls: number;
  estimateCalls: Array<{ width: number; height: number }>;
  modelId: string;
  backend: 'webgpu' | 'wasm' | 'cpu';
  depthFor: (w: number, h: number) => Float32Array;
}

function makeStubService(state: Partial<StubServiceState> = {}): {
  service: DepthEstimationService;
  state: StubServiceState;
} {
  const s: StubServiceState = {
    initialized: state.initialized ?? false,
    initializeCalls: 0,
    estimateCalls: [],
    modelId: state.modelId ?? 'depth-anything/Depth-Anything-V2-Small-hf',
    backend: state.backend ?? 'webgpu',
    depthFor:
      state.depthFor ??
      ((w, h) => {
        // Deterministic pseudo-depth: gradient based on linear index
        const out = new Float32Array(w * h);
        for (let i = 0; i < out.length; i++) out[i] = (i % 17) / 17;
        return out;
      }),
  };
  // Build a duck-typed service. We expose `config.modelId` as a real prop
  // so the provider's `resolveModelId()` can read it via the cast.
  const fake = {
    get initialized() {
      return s.initialized;
    },
    get backend() {
      return s.backend;
    },
    config: { modelId: s.modelId },
    async initialize() {
      s.initializeCalls += 1;
      s.initialized = true;
    },
    async estimateDepth(imgData: { width: number; height: number }) {
      s.estimateCalls.push({ width: imgData.width, height: imgData.height });
      return {
        depthMap: s.depthFor(imgData.width, imgData.height),
        normalMap: new Float32Array(imgData.width * imgData.height * 3),
        width: imgData.width,
        height: imgData.height,
        backend: s.backend,
        inferenceMs: 1,
      };
    },
  } as unknown as DepthEstimationService;
  return { service: fake, state: s };
}

const SYNTHETIC_DECODER = (w: number, h: number, fill = [128, 128, 128]): ImageDecoder => {
  return async () => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = fill[0];
      data[i * 4 + 1] = fill[1];
      data[i * 4 + 2] = fill[2];
      data[i * 4 + 3] = 255;
    }
    return { data, width: w, height: h };
  };
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('BrowserDepthProvider — happy path', () => {
  it('lazily initializes the service on first infer', async () => {
    const { service, state } = makeStubService();
    const provider = new BrowserDepthProvider({
      service,
      imageDecoder: SYNTHETIC_DECODER(8, 8),
    });
    expect(state.initializeCalls).toBe(0);

    const result = await provider.infer(new Uint8Array([1]), 'image');
    expect(state.initializeCalls).toBe(1);
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
    expect(result.frames).toBe(1);
    expect(result.backend).toBe('webgpu');
    expect(result.modelId).toBe('depth-anything/Depth-Anything-V2-Small-hf');
    expect(result.depthMap.length).toBe(8 * 8);
  });

  it('does not re-initialize on subsequent calls', async () => {
    const { service, state } = makeStubService();
    const provider = new BrowserDepthProvider({
      service,
      imageDecoder: SYNTHETIC_DECODER(4, 4),
    });
    await provider.infer(new Uint8Array([1]), 'image');
    await provider.infer(new Uint8Array([2]), 'image');
    await provider.infer(new Uint8Array([3]), 'image');
    expect(state.initializeCalls).toBe(1);
    expect(state.estimateCalls).toHaveLength(3);
  });

  it('does not call initialize when skipInitialize=true', async () => {
    const { service, state } = makeStubService({ initialized: true });
    const provider = new BrowserDepthProvider({
      service,
      imageDecoder: SYNTHETIC_DECODER(4, 4),
      skipInitialize: true,
    });
    await provider.infer(new Uint8Array([1]), 'image');
    expect(state.initializeCalls).toBe(0);
  });

  it('passes the decoded ImageData straight to estimateDepth', async () => {
    const { service, state } = makeStubService();
    const provider = new BrowserDepthProvider({
      service,
      imageDecoder: SYNTHETIC_DECODER(16, 12),
    });
    await provider.infer(new Uint8Array([1, 2, 3]), 'image');
    expect(state.estimateCalls).toEqual([{ width: 16, height: 12 }]);
  });

  it('threads the modelId from the service config into the result', async () => {
    const { service } = makeStubService({ modelId: 'custom/depth-model-7b' });
    const provider = new BrowserDepthProvider({
      service,
      imageDecoder: SYNTHETIC_DECODER(4, 4),
    });
    const result = await provider.infer(new Uint8Array([1]), 'image');
    expect(result.modelId).toBe('custom/depth-model-7b');
  });

  it('falls back to estimationConfig.modelId when service does not expose one', async () => {
    // Service without `config.modelId` field
    const fakeService = {
      get initialized() {
        return false;
      },
      async initialize() {
        /* noop */
      },
      async estimateDepth(imgData: { width: number; height: number }) {
        return {
          depthMap: new Float32Array(imgData.width * imgData.height),
          normalMap: new Float32Array(imgData.width * imgData.height * 3),
          width: imgData.width,
          height: imgData.height,
          backend: 'wasm' as const,
          inferenceMs: 0,
        };
      },
    } as unknown as DepthEstimationService;

    const provider = new BrowserDepthProvider({
      service: fakeService,
      imageDecoder: SYNTHETIC_DECODER(4, 4),
      estimationConfig: { modelId: 'fallback/depth-model' },
    });
    const result = await provider.infer(new Uint8Array([1]), 'image');
    expect(result.modelId).toBe('fallback/depth-model');
  });
});

describe('BrowserDepthProvider — input validation', () => {
  it('rejects empty media', async () => {
    const { service } = makeStubService();
    const provider = new BrowserDepthProvider({
      service,
      imageDecoder: SYNTHETIC_DECODER(4, 4),
    });
    await expect(provider.infer(new Uint8Array(0), 'image')).rejects.toThrow(/non-empty/);
  });

  it('throws when the decoder returns a malformed frame', async () => {
    const { service } = makeStubService();
    const badDecoder: ImageDecoder = async () => ({
      data: new Uint8ClampedArray(10), // wrong size
      width: 4,
      height: 4,
    });
    const provider = new BrowserDepthProvider({ service, imageDecoder: badDecoder });
    await expect(provider.infer(new Uint8Array([1]), 'image')).rejects.toThrow(
      /decoded\.data is 10 bytes, expected 64/
    );
  });

  it('throws when the decoder returns invalid dimensions', async () => {
    const { service } = makeStubService();
    const badDecoder: ImageDecoder = async () => ({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    });
    const provider = new BrowserDepthProvider({ service, imageDecoder: badDecoder });
    await expect(provider.infer(new Uint8Array([1]), 'image')).rejects.toThrow(
      /invalid frame/
    );
  });
});

describe('BrowserDepthProvider — default decoder behaviour', () => {
  it('emits a descriptive error in non-browser runtimes', async () => {
    const { service } = makeStubService();
    // No imageDecoder injected; node-vitest has no createImageBitmap.
    const provider = new BrowserDepthProvider({ service });
    await expect(provider.infer(new Uint8Array([1]), 'image')).rejects.toThrow(
      /createImageBitmap is unavailable|OffscreenCanvas is unavailable/
    );
  });
});

describe('BrowserDepthProvider — error propagation', () => {
  it('lets initialize() errors bubble', async () => {
    const fakeService = {
      get initialized() {
        return false;
      },
      async initialize() {
        throw new Error('model download blocked');
      },
      async estimateDepth() {
        throw new Error('should not reach');
      },
    } as unknown as DepthEstimationService;
    const provider = new BrowserDepthProvider({
      service: fakeService,
      imageDecoder: SYNTHETIC_DECODER(4, 4),
    });
    await expect(provider.infer(new Uint8Array([1]), 'image')).rejects.toThrow(
      /model download blocked/
    );
  });

  it('lets estimateDepth errors bubble', async () => {
    const { service, state } = makeStubService({ initialized: true });
    const spy = vi.spyOn(service, 'estimateDepth').mockRejectedValueOnce(
      new Error('inference OOM')
    );
    const provider = new BrowserDepthProvider({
      service,
      imageDecoder: SYNTHETIC_DECODER(4, 4),
      skipInitialize: true,
    });
    await expect(provider.infer(new Uint8Array([1]), 'image')).rejects.toThrow(/inference OOM/);
    spy.mockRestore();
    void state;
  });
});
