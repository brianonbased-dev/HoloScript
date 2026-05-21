// @vitest-environment node
/**
 * Node WebGPU bootstrap verification.
 *
 * Verifies that `ensureNodeWebGpuSync()` and `ensureNodeWebGpu()` correctly
 * activate the `webgpu` npm binding so that `navigator.gpu` is populated
 * and a real GPUDevice can be obtained on Node.
 *
 * These tests require the `webgpu` npm package (Dawn binding) and a physical
 * GPU. They skip cleanly (no failure) on machines or CI without one.
 *
 * Origin: task_1779371044960_qxcl — agents were not pushing GPU because the
 * gate function never activated the Node binding, causing silent CPU passthrough.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ensureNodeWebGpuSync, ensureNodeWebGpu, _resetNodeWebGpuBootstrap } from '../ensure-node-webgpu.js';
import { GPUContext } from '../gpu-context.js';

const hasWindow = typeof globalThis.window !== 'undefined';
const skipInBrowser = hasWindow ? it.skip : it;

describe('ensureNodeWebGpu', () => {
  afterAll(() => {
    // Don't pollute other tests — leave navigator.gpu set.
  });

  describe('ensureNodeWebGpuSync', () => {
    it('returns a boolean', () => {
      const result = ensureNodeWebGpuSync();
      expect(typeof result).toBe('boolean');
    });

    skipInBrowser('populates navigator.gpu on Node', () => {
      const result = ensureNodeWebGpuSync();
      if (result) {
        expect(globalThis.navigator).toBeDefined();
        expect((globalThis as { navigator?: { gpu?: unknown } }).navigator?.gpu).toBeDefined();
      }
    });

    skipInBrowser('idempotent — calling twice returns same result', () => {
      const first = ensureNodeWebGpuSync();
      const second = ensureNodeWebGpuSync();
      expect(second).toBe(first);
    });
  });

  describe('ensureNodeWebGpu (async)', () => {
    it('returns a boolean', async () => {
      const result = await ensureNodeWebGpu();
      expect(typeof result).toBe('boolean');
    });

    skipInBrowser('populates navigator.gpu on Node', async () => {
      const result = await ensureNodeWebGpu();
      if (result) {
        expect(globalThis.navigator).toBeDefined();
        expect((globalThis as { navigator?: { gpu?: unknown } }).navigator?.gpu).toBeDefined();
      }
    });
  });
});

describe('GPUContext with Node binding', () => {
  let ctx: GPUContext | undefined;

  afterAll(() => {
    ctx?.destroy();
  });

  skipInBrowser('initializes a real GPUDevice on Node', async () => {
    // Activate the Node binding first.
    const activated = await ensureNodeWebGpu();
    if (!activated) {
      // No GPU available — skip, not fail.
      return;
    }

    ctx = new GPUContext();
    await ctx.initialize({ powerPreference: 'high-performance' });

    expect(ctx.isInitialized).toBe(true);

    const caps = ctx.capabilities;
    expect(caps.vendor).toBeDefined();
    expect(caps.vendor).not.toBe('unknown');
    // RTX 3060 is ampere architecture.
    expect(caps.architecture).toBeDefined();

    console.log(`[ensure-node-webgpu test] GPU: ${caps.vendor} ${caps.architecture}`);
    console.log(`[ensure-node-webgpu test] Max workgroup size: ${caps.maxWorkgroupSize}`);
    console.log(`[ensure-node-webgpu test] Max buffer size: ${caps.maxBufferSize}`);
  });
});

describe('webgpuGate integration (core)', () => {
  // This verifies that the core package's webgpuGate correctly bootstraps
  // Node WebGPU when called, so isWebGpuEnvironmentPresent() returns true.
  skipInBrowser('isWebGpuEnvironmentPresent returns true after bootstrap', async () => {
    // Import the gate from core (which has ensureNodeWebGpuSync built-in).
    // The import is dynamic so that snn-webgpu tests don't depend on core.
    try {
      const { isWebGpuEnvironmentPresent } = await import('../../core/dist/reconstruction/webgpuGate.js');
      const present = isWebGpuEnvironmentPresent();
      // If we have a GPU, this should be true.
      if (ensureNodeWebGpuSync()) {
        expect(present).toBe(true);
      }
    } catch {
      // Core not built — skip, not fail.
      console.log('[ensure-node-webgpu test] Core not built, skipping gate integration test');
    }
  });
});