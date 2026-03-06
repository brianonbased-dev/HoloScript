/**
 * Tests for GPUContext - WebGPU device lifecycle management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GPUContext } from '../gpu-context.js';

describe('GPUContext', () => {
  let ctx: GPUContext;

  beforeEach(() => {
    ctx = new GPUContext();
  });

  afterEach(() => {
    if (ctx.isInitialized) {
      ctx.destroy();
    }
  });

  describe('initialization', () => {
    it('should not be initialized before calling initialize()', () => {
      expect(ctx.isInitialized).toBe(false);
    });

    it('should initialize successfully', async () => {
      await ctx.initialize();
      expect(ctx.isInitialized).toBe(true);
    });

    it('should be idempotent when called multiple times', async () => {
      await ctx.initialize();
      await ctx.initialize(); // Should not throw
      expect(ctx.isInitialized).toBe(true);
    });

    it('should throw when accessing device before initialization', () => {
      expect(() => ctx.device).toThrow('GPUContext not initialized');
    });

    it('should throw when accessing adapter before initialization', () => {
      expect(() => ctx.adapter).toThrow('GPUContext not initialized');
    });

    it('should throw when accessing capabilities before initialization', () => {
      expect(() => ctx.capabilities).toThrow('GPUContext not initialized');
    });

    it('should report capabilities after initialization', async () => {
      await ctx.initialize();
      const caps = ctx.capabilities;

      expect(caps.maxWorkgroupSize).toHaveLength(3);
      expect(caps.maxWorkgroupSize[0]).toBe(256);
      expect(caps.maxWorkgroupsPerDimension).toBe(65535);
      expect(caps.maxStorageBufferBindingSize).toBeGreaterThan(0);
      expect(caps.maxBufferSize).toBeGreaterThan(0);
      expect(caps.vendor).toBe('mock-vendor');
      expect(caps.architecture).toBe('mock-arch');
    });

    it('should accept custom options', async () => {
      await ctx.initialize({
        powerPreference: 'low-power',
        label: 'test-device',
        maxBufferSize: 64 * 1024 * 1024,
      });
      expect(ctx.isInitialized).toBe(true);
    });

    it('should throw if WebGPU is not available', async () => {
      const originalGpu = (navigator as any).gpu;
      (navigator as any).gpu = undefined;

      const freshCtx = new GPUContext();
      await expect(freshCtx.initialize()).rejects.toThrow('WebGPU is not supported');

      (navigator as any).gpu = originalGpu;
    });

    it('should throw if adapter returns null', async () => {
      const originalGpu = (navigator as any).gpu;
      (navigator as any).gpu = { requestAdapter: vi.fn().mockResolvedValue(null) };

      const freshCtx = new GPUContext();
      await expect(freshCtx.initialize()).rejects.toThrow('Failed to obtain a WebGPU adapter');

      (navigator as any).gpu = originalGpu;
    });
  });

  describe('shader module creation', () => {
    it('should create shader modules', async () => {
      await ctx.initialize();
      const module = ctx.createShaderModule('// empty shader', 'test-shader');
      expect(module).toBeDefined();
    });
  });

  describe('compute pipeline creation', () => {
    it('should create compute pipelines', async () => {
      await ctx.initialize();
      const module = ctx.createShaderModule('// empty shader');
      const pipeline = ctx.createComputePipeline(module, 'main');
      expect(pipeline).toBeDefined();
    });
  });

  describe('neuron capacity validation', () => {
    it('should accept counts within limits', async () => {
      await ctx.initialize();
      const result = ctx.validateNeuronCapacity(10000);
      expect(result).toBe(10000);
    });

    it('should clamp counts exceeding GPU limits', async () => {
      await ctx.initialize();
      const maxNeurons = 65535 * 256; // maxWorkgroups * workgroupSize
      const overLimit = maxNeurons + 1000;
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = ctx.validateNeuronCapacity(overLimit);
      expect(result).toBe(maxNeurons);
      expect(consoleWarn).toHaveBeenCalledOnce();

      consoleWarn.mockRestore();
    });
  });

  describe('submitAndWait', () => {
    it('should submit command buffer and wait for completion', async () => {
      await ctx.initialize();
      const encoder = ctx.device.createCommandEncoder();
      const cmdBuffer = encoder.finish();

      await ctx.submitAndWait(cmdBuffer);
      expect(ctx.device.queue.submit).toHaveBeenCalledWith([cmdBuffer]);
      expect(ctx.device.queue.onSubmittedWorkDone).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clean up device', async () => {
      await ctx.initialize();
      ctx.destroy();
      expect(ctx.isInitialized).toBe(false);
    });

    it('should be safe to call multiple times', async () => {
      await ctx.initialize();
      ctx.destroy();
      ctx.destroy(); // Should not throw
      expect(ctx.isInitialized).toBe(false);
    });

    it('should throw on reinitialization after destroy', async () => {
      await ctx.initialize();
      ctx.destroy();
      await expect(ctx.initialize()).rejects.toThrow('cannot be reinitialized');
    });
  });
});
