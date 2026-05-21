/**
 * QuantumInspiredTrait tests
 *
 * ## WebGPU / CI note
 *
 * SnnAccelerator uses WebGPU (WGSL compute shader). WebGPU is unavailable in
 * Node.js unless >= 22 with --experimental-webgpu is active. In CI these tests
 * run entirely on the CPU fallback path (CpuFallbackAccelerator / sigmoid) —
 * `accelerator.available` will always be false in this environment.
 *
 * To test the real GPU path inject a real SnnAccelerator via acceleratorProvider
 * (see the "GPU injection" suite below). Those tests are skipped when WebGPU is
 * absent so they don't block CI.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  quantumInspiredHandler,
  type QuantumInspiredConfig,
  type SnnAcceleratorLike,
  type SnnAcceleratorProvider,
} from '../QuantumInspiredTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
} from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(length: number, value = 0.5): Float32Array {
  return new Float32Array(length).fill(value);
}

/**
 * Advance the microtask queue so async fire-and-forget calls inside onEvent
 * settle before we assert on emitted events.
 */
async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

describe('QuantumInspiredTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('qi-node');
    ctx = createMockContext();
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('attaches without error and stores state on node', () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);
      const state = (node as Record<string, unknown>).__qiState;
      expect(state).toBeDefined();
    });

    it('detaches cleanly — state is removed from node', () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);
      const fullConfig = {
        ...quantumInspiredHandler.defaultConfig,
      } as QuantumInspiredConfig;
      quantumInspiredHandler.onDetach!(node as never, fullConfig, ctx as never);
      expect((node as Record<string, unknown>).__qiState).toBeUndefined();
    });

    it('calls dispose() on the accelerator during detach', async () => {
      const disposeSpy = vi.fn();
      const mockAccelerator: SnnAcceleratorLike = {
        available: false,
        initialize: () => Promise.resolve(),
        encode: (h) => Promise.resolve(h),
        dispose: disposeSpy,
      };
      const provider: SnnAcceleratorProvider = () => mockAccelerator;

      attachTrait(quantumInspiredHandler, node, { acceleratorProvider: provider }, ctx);

      // Trigger lazy init by sending a valid optimize event.
      sendEvent(quantumInspiredHandler, node, { acceleratorProvider: provider }, ctx, {
        type: 'qi:optimize',
        payload: { input: makeInput(128) },
      });
      await flushAsync();

      // Now detach.
      const fullConfig = {
        ...quantumInspiredHandler.defaultConfig,
        acceleratorProvider: provider,
      } as QuantumInspiredConfig;
      quantumInspiredHandler.onDetach!(node as never, fullConfig, ctx as never);

      expect(disposeSpy).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path — optimize() with CPU fallback
  // -------------------------------------------------------------------------

  describe('optimize — CPU fallback (no acceleratorProvider)', () => {
    it('emits qi:result for a valid 128-element Float32Array input', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: makeInput(128, 0.7), requestId: 'req-1' },
      });
      await flushAsync();

      const result = ctx.emittedEvents.find((e) => e.event === 'qi:result');
      expect(result).toBeDefined();
      const data = result!.data as Record<string, unknown>;
      expect(data.requestId).toBe('req-1');
      expect(data.output).toBeInstanceOf(Float32Array);
      expect((data.output as Float32Array).length).toBe(128);
      expect(data.gpuAccelerated).toBe(false); // CPU fallback
    });

    it('output is a Float32Array with values in [0, 1]', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: makeInput(128, 0.5) },
      });
      await flushAsync();

      const result = ctx.emittedEvents.find((e) => e.event === 'qi:result');
      const output = (result!.data as Record<string, unknown>).output as Float32Array;
      for (let i = 0; i < output.length; i++) {
        expect(output[i]).toBeGreaterThanOrEqual(0);
        expect(output[i]).toBeLessThanOrEqual(1);
      }
    });

    it('accepts a plain number[] as input', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      const input = Array.from({ length: 128 }, () => Math.random());
      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input },
      });
      await flushAsync();

      const result = ctx.emittedEvents.find((e) => e.event === 'qi:result');
      expect(result).toBeDefined();
      expect((result!.data as Record<string, unknown>).output).toBeInstanceOf(Float32Array);
    });

    it('increments optimizeCount across repeated calls', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      for (let i = 0; i < 3; i++) {
        sendEvent(quantumInspiredHandler, node, {}, ctx, {
          type: 'qi:optimize',
          payload: { input: makeInput(128) },
        });
        await flushAsync();
      }

      const results = ctx.emittedEvents.filter((e) => e.event === 'qi:result');
      expect(results).toHaveLength(3);
      const lastCount = (results[2].data as Record<string, unknown>).optimizeCount;
      expect(lastCount).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // False cases — invalid input rejected
  // -------------------------------------------------------------------------

  describe('false cases — invalid input', () => {
    it('emits qi:error when input is missing', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { requestId: 'bad-1' },
      });
      await flushAsync();

      const err = ctx.emittedEvents.find((e) => e.event === 'qi:error');
      expect(err).toBeDefined();
      const data = err!.data as Record<string, unknown>;
      expect(data.code).toBe('INVALID_INPUT');
      expect(data.requestId).toBe('bad-1');
    });

    it('emits qi:error when input is an empty array', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: [], requestId: 'bad-2' },
      });
      await flushAsync();

      const err = ctx.emittedEvents.find((e) => e.event === 'qi:error');
      expect(err).toBeDefined();
      expect((err!.data as Record<string, unknown>).code).toBe('INVALID_INPUT');
    });

    it('emits qi:error when input is an empty Float32Array', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: new Float32Array(0) },
      });
      await flushAsync();

      const err = ctx.emittedEvents.find((e) => e.event === 'qi:error');
      expect(err).toBeDefined();
      expect((err!.data as Record<string, unknown>).code).toBe('INVALID_INPUT');
    });

    it('emits qi:error when input is a non-number type', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: 'not-an-array' },
      });
      await flushAsync();

      const err = ctx.emittedEvents.find((e) => e.event === 'qi:error');
      expect(err).toBeDefined();
      expect((err!.data as Record<string, unknown>).code).toBe('INVALID_INPUT');
    });

    it('emits qi:error (SHAPE_MISMATCH) when input length != numNeurons', async () => {
      // Default numNeurons is 128; send 64 elements.
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: makeInput(64), requestId: 'shape-err' },
      });
      await flushAsync();

      const err = ctx.emittedEvents.find((e) => e.event === 'qi:error');
      expect(err).toBeDefined();
      const data = err!.data as Record<string, unknown>;
      expect(data.code).toBe('SHAPE_MISMATCH');
      expect(data.requestId).toBe('shape-err');
    });

    it('emits qi:error (SHAPE_MISMATCH) when numNeurons is customised and input is wrong size', async () => {
      attachTrait(quantumInspiredHandler, node, { numNeurons: 64 }, ctx);

      sendEvent(quantumInspiredHandler, node, { numNeurons: 64 }, ctx, {
        type: 'qi:optimize',
        payload: { input: makeInput(128) }, // 128 != 64
      });
      await flushAsync();

      const err = ctx.emittedEvents.find((e) => e.event === 'qi:error');
      expect(err).toBeDefined();
      expect((err!.data as Record<string, unknown>).code).toBe('SHAPE_MISMATCH');
    });

    it('does NOT emit qi:result when there is an input error', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: null },
      });
      await flushAsync();

      const result = ctx.emittedEvents.find((e) => e.event === 'qi:result');
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Status event
  // -------------------------------------------------------------------------

  describe('qi:status', () => {
    it('reports initial state before any optimize call', () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, { type: 'qi:status' });

      const statusResult = ctx.emittedEvents.find((e) => e.event === 'qi:status_result');
      expect(statusResult).toBeDefined();
      const data = statusResult!.data as Record<string, unknown>;
      expect(data.initialized).toBe(false);
      expect(data.optimizeCount).toBe(0);
      expect(data.numNeurons).toBe(128);
    });

    it('reports initialized=true after an optimize call completes', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: makeInput(128) },
      });
      await flushAsync();

      ctx.clearEvents();
      sendEvent(quantumInspiredHandler, node, {}, ctx, { type: 'qi:status' });

      const statusResult = ctx.emittedEvents.find((e) => e.event === 'qi:status_result');
      const data = statusResult!.data as Record<string, unknown>;
      expect(data.initialized).toBe(true);
      expect(data.optimizeCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Reset event
  // -------------------------------------------------------------------------

  describe('qi:reset', () => {
    it('resets optimizeCount to 0 and emits qi:reset_complete', async () => {
      attachTrait(quantumInspiredHandler, node, {}, ctx);

      sendEvent(quantumInspiredHandler, node, {}, ctx, {
        type: 'qi:optimize',
        payload: { input: makeInput(128) },
      });
      await flushAsync();

      ctx.clearEvents();
      sendEvent(quantumInspiredHandler, node, {}, ctx, { type: 'qi:reset' });

      const resetResult = ctx.emittedEvents.find((e) => e.event === 'qi:reset_complete');
      expect(resetResult).toBeDefined();
      expect((resetResult!.data as Record<string, unknown>).optimizeCount).toBe(0);
    });

    it('re-initializes accelerator on next optimize after reset', async () => {
      const initSpy = vi.fn().mockResolvedValue(undefined);
      const mockAccelerator: SnnAcceleratorLike = {
        available: false,
        initialize: initSpy,
        encode: (h) => Promise.resolve(h),
        dispose: vi.fn(),
      };

      attachTrait(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx
      );

      // First optimize — initialize called once.
      sendEvent(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx,
        { type: 'qi:optimize', payload: { input: makeInput(128) } }
      );
      await flushAsync();
      expect(initSpy).toHaveBeenCalledTimes(1);

      // Reset.
      sendEvent(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx,
        { type: 'qi:reset' }
      );

      // Second optimize after reset — initialize called again.
      sendEvent(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx,
        { type: 'qi:optimize', payload: { input: makeInput(128) } }
      );
      await flushAsync();
      expect(initSpy).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Injected accelerator (mock SnnAccelerator)
  // -------------------------------------------------------------------------

  describe('injected SnnAcceleratorLike', () => {
    it('uses the injected provider instead of CPU fallback', async () => {
      const customOutput = new Float32Array(128).fill(0.99);
      const mockAccelerator: SnnAcceleratorLike = {
        available: true,
        initialize: vi.fn().mockResolvedValue(undefined),
        encode: vi.fn().mockResolvedValue(customOutput),
        dispose: vi.fn(),
      };
      const provider: SnnAcceleratorProvider = () => mockAccelerator;

      attachTrait(quantumInspiredHandler, node, { acceleratorProvider: provider }, ctx);

      sendEvent(quantumInspiredHandler, node, { acceleratorProvider: provider }, ctx, {
        type: 'qi:optimize',
        payload: { input: makeInput(128) },
      });
      await flushAsync();

      const result = ctx.emittedEvents.find((e) => e.event === 'qi:result');
      expect(result).toBeDefined();
      const data = result!.data as Record<string, unknown>;
      expect(data.gpuAccelerated).toBe(true);
      expect(data.output).toBe(customOutput);
    });

    it('reports gpuAccelerated=false when injected accelerator.available is false', async () => {
      const mockAccelerator: SnnAcceleratorLike = {
        available: false,
        initialize: vi.fn().mockResolvedValue(undefined),
        encode: (h) => Promise.resolve(h),
        dispose: vi.fn(),
      };

      attachTrait(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx
      );

      sendEvent(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx,
        { type: 'qi:optimize', payload: { input: makeInput(128) } }
      );
      await flushAsync();

      const result = ctx.emittedEvents.find((e) => e.event === 'qi:result');
      expect((result!.data as Record<string, unknown>).gpuAccelerated).toBe(false);
    });

    it('emits qi:error (ENCODE_FAILED) when accelerator.encode() throws', async () => {
      const mockAccelerator: SnnAcceleratorLike = {
        available: true,
        initialize: vi.fn().mockResolvedValue(undefined),
        encode: vi.fn().mockRejectedValue(new Error('GPU buffer overflow')),
        dispose: vi.fn(),
      };

      attachTrait(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx
      );

      sendEvent(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx,
        { type: 'qi:optimize', payload: { input: makeInput(128), requestId: 'fail-1' } }
      );
      await flushAsync();

      const err = ctx.emittedEvents.find((e) => e.event === 'qi:error');
      expect(err).toBeDefined();
      const data = err!.data as Record<string, unknown>;
      expect(data.code).toBe('ENCODE_FAILED');
      expect(data.requestId).toBe('fail-1');
      expect(data.message).toContain('GPU buffer overflow');
    });

    it('initializes the accelerator only once across multiple optimize calls', async () => {
      const initSpy = vi.fn().mockResolvedValue(undefined);
      const mockAccelerator: SnnAcceleratorLike = {
        available: true,
        initialize: initSpy,
        encode: (h) => Promise.resolve(h),
        dispose: vi.fn(),
      };

      attachTrait(
        quantumInspiredHandler,
        node,
        { acceleratorProvider: () => mockAccelerator },
        ctx
      );

      for (let i = 0; i < 5; i++) {
        sendEvent(
          quantumInspiredHandler,
          node,
          { acceleratorProvider: () => mockAccelerator },
          ctx,
          { type: 'qi:optimize', payload: { input: makeInput(128) } }
        );
        await flushAsync();
      }

      expect(initSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Default config
  // -------------------------------------------------------------------------

  describe('default config', () => {
    it('has numNeurons=128', () => {
      expect(quantumInspiredHandler.defaultConfig?.numNeurons).toBe(128);
    });

    it('has learningRate=0.01', () => {
      expect(quantumInspiredHandler.defaultConfig?.learningRate).toBeCloseTo(0.01);
    });

    it('has snnTimesteps=50', () => {
      expect(quantumInspiredHandler.defaultConfig?.snnTimesteps).toBe(50);
    });

    it('has no acceleratorProvider (undefined) so CPU fallback is default', () => {
      expect(quantumInspiredHandler.defaultConfig?.acceleratorProvider).toBeUndefined();
    });
  });
});
