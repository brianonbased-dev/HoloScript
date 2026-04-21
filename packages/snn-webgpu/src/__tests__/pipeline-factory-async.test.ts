/**
 * Tests for PipelineFactory async compilation APIs.
 *
 * Covers:
 *  - getPipelineAsync: non-blocking pipeline creation and result caching
 *  - warmupAsync: parallel precompilation of multiple pipelines
 *  - checkShaderCompilationErrors: surfaces WGSL compilation diagnostics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import {
  PipelineFactory,
  type ShaderEntryPoint,
  type ShaderCategory,
} from '../pipeline-factory.js';

describe('PipelineFactory async compilation', () => {
  let ctx: GPUContext;
  let factory: PipelineFactory;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
    factory = new PipelineFactory(ctx);
  });

  afterEach(() => {
    factory.clearCache();
    ctx.destroy();
  });

  // ── getPipelineAsync ────────────────────────────────────────────────────

  describe('getPipelineAsync', () => {
    it('should return a compute pipeline for a valid entry point', async () => {
      const pipeline = await factory.getPipelineAsync('lif_step');
      expect(pipeline).toBeDefined();
    });

    it('should cache the pipeline — second call returns same reference', async () => {
      const p1 = await factory.getPipelineAsync('lif_step');
      const p2 = await factory.getPipelineAsync('lif_step');
      expect(p1).toBe(p2);
    });

    it('should produce a pipeline that is also returned by synchronous getPipeline', async () => {
      // Warm the cache via async path
      const asyncPipeline = await factory.getPipelineAsync('lif_step_batch');
      // Sync path should hit the same cache entry
      const syncPipeline = factory.getPipeline('lif_step_batch');
      expect(asyncPipeline).toBe(syncPipeline);
    });

    it('should create distinct pipelines for different entry points', async () => {
      const p1 = await factory.getPipelineAsync('lif_step');
      const p2 = await factory.getPipelineAsync('encode_rate');
      expect(p1).not.toBe(p2);
    });

    it('should handle concurrent requests for the same entry point', async () => {
      // Two concurrent calls must not double-compile or store conflicting entries
      const [p1, p2] = await Promise.all([
        factory.getPipelineAsync('decode_temporal'),
        factory.getPipelineAsync('decode_temporal'),
      ]);
      expect(p1).toBe(p2);
    });

    it('should work for all available entry points', async () => {
      const entryPoints = factory.getAvailableEntryPoints();
      const pipelines = await Promise.all(entryPoints.map(ep => factory.getPipelineAsync(ep)));
      expect(pipelines).toHaveLength(entryPoints.length);
      pipelines.forEach(p => expect(p).toBeDefined());
    });
  });

  // ── warmupAsync ─────────────────────────────────────────────────────────

  describe('warmupAsync', () => {
    it('should precompile all pipelines when called with no arguments', async () => {
      await factory.warmupAsync();

      // After warmup every entry point should be in cache (sync lookup works)
      const entryPoints = factory.getAvailableEntryPoints();
      for (const ep of entryPoints) {
        const pipeline = factory.getPipeline(ep);
        expect(pipeline).toBeDefined();
      }
    });

    it('should precompile only the specified entry points', async () => {
      const subset: ShaderEntryPoint[] = ['lif_step', 'encode_rate', 'tropical_activate'];
      await factory.warmupAsync(subset);

      // Requested pipelines must be in cache
      for (const ep of subset) {
        const pipeline = factory.getPipeline(ep);
        expect(pipeline).toBeDefined();
      }
    });

    it('should resolve without error when called on an empty subset', async () => {
      await expect(factory.warmupAsync([])).resolves.toBeUndefined();
    });

    it('should be idempotent — calling twice does not throw', async () => {
      await factory.warmupAsync(['lif_step', 'lif_step_batch']);
      await expect(factory.warmupAsync(['lif_step', 'lif_step_batch'])).resolves.toBeUndefined();
    });
  });

  // ── checkShaderCompilationErrors ────────────────────────────────────────

  describe('checkShaderCompilationErrors', () => {
    it('should return an array (empty on mock device)', async () => {
      const msgs = await factory.checkShaderCompilationErrors('lif');
      expect(Array.isArray(msgs)).toBe(true);
    });

    it('should not throw for any shader category', async () => {
      const categories: ShaderCategory[] = [
        'lif',
        'synaptic',
        'encode',
        'decode',
        'tropical',
        'tropicalGraph',
      ];

      for (const category of categories) {
        await expect(factory.checkShaderCompilationErrors(category)).resolves.toBeDefined();
      }
    });

    it('should force-compile the shader module if not yet cached', async () => {
      // Accessing compilation info for a fresh factory forces module creation
      const msgs = await factory.checkShaderCompilationErrors('synaptic');
      // The module should now be cached
      const module1 = factory.getShaderModule('synaptic');
      const module2 = factory.getShaderModule('synaptic');
      expect(module1).toBe(module2); // same reference — cached
      expect(msgs).toBeDefined();
    });
  });

  // ── cross-path cache coherence ───────────────────────────────────────────

  describe('cache coherence across sync / async paths', () => {
    it('sync getPipeline then async getPipelineAsync returns same instance', async () => {
      const syncP = factory.getPipeline('stdp_weight_update');
      const asyncP = await factory.getPipelineAsync('stdp_weight_update');
      expect(syncP).toBe(asyncP);
    });

    it('clearCache invalidates async pipeline cache', async () => {
      const p1 = await factory.getPipelineAsync('lif_step');
      factory.clearCache();
      const p2 = await factory.getPipelineAsync('lif_step');
      // After clearing, a new object must have been created
      expect(p1).not.toBe(p2);
    });
  });
});
