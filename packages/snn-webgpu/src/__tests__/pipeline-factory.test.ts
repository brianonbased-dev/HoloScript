/**
 * Tests for PipelineFactory - Compute pipeline creation and caching.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import {
  PipelineFactory,
  type ShaderEntryPoint,
  type ShaderCategory,
} from '../pipeline-factory.js';

describe('PipelineFactory', () => {
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

  describe('getShaderModule', () => {
    it('should create shader modules for all categories', () => {
      const categories: ShaderCategory[] = ['lif', 'synaptic', 'encode', 'decode'];

      for (const category of categories) {
        const module = factory.getShaderModule(category);
        expect(module).toBeDefined();
      }
    });

    it('should cache shader modules', () => {
      const module1 = factory.getShaderModule('lif');
      const module2 = factory.getShaderModule('lif');
      expect(module1).toBe(module2); // Same reference
    });
  });

  describe('getPipeline', () => {
    it('should create pipelines for all entry points', () => {
      const entryPoints = factory.getAvailableEntryPoints();
      expect(entryPoints.length).toBeGreaterThan(0);

      for (const ep of entryPoints) {
        const pipeline = factory.getPipeline(ep);
        expect(pipeline).toBeDefined();
      }
    });

    it('should cache pipelines', () => {
      const p1 = factory.getPipeline('lif_step');
      const p2 = factory.getPipeline('lif_step');
      expect(p1).toBe(p2);
    });

    it('should create distinct pipelines for different entry points', () => {
      const p1 = factory.getPipeline('lif_step');
      const p2 = factory.getPipeline('lif_step_batch');
      expect(p1).not.toBe(p2);
    });
  });

  describe('getAvailableEntryPoints', () => {
    it('should list all entry points', () => {
      const eps = factory.getAvailableEntryPoints();

      // LIF
      expect(eps).toContain('lif_step');
      expect(eps).toContain('lif_step_batch');

      // Synaptic
      expect(eps).toContain('compute_synaptic_current');
      expect(eps).toContain('compute_synaptic_current_tiled');
      expect(eps).toContain('stdp_weight_update');

      // Encoding
      expect(eps).toContain('encode_rate');
      expect(eps).toContain('encode_temporal');
      expect(eps).toContain('encode_delta');

      // Decoding
      expect(eps).toContain('decode_rate');
      expect(eps).toContain('decode_temporal');
      expect(eps).toContain('decode_population');
      expect(eps).toContain('decode_first_spike');
    });

    it('should have 12 entry points total', () => {
      expect(factory.getAvailableEntryPoints()).toHaveLength(12);
    });
  });

  describe('createBindGroup', () => {
    it('should create a bind group with buffer entries', () => {
      const buffer1 = ctx.device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM });
      const buffer2 = ctx.device.createBuffer({ size: 256, usage: GPUBufferUsage.STORAGE });

      const bindGroup = factory.createBindGroup('lif_step', [buffer1, buffer2], 'test-bg');
      expect(bindGroup).toBeDefined();
    });
  });

  describe('encodeDispatch', () => {
    it('should encode a compute dispatch command', () => {
      const buffer = ctx.device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM });
      const bindGroup = factory.createBindGroup('lif_step', [buffer], 'dispatch-bg');

      const encoder = ctx.device.createCommandEncoder();
      factory.encodeDispatch(encoder, 'lif_step', bindGroup, 40);

      // Should not throw
      const cmdBuffer = encoder.finish();
      expect(cmdBuffer).toBeDefined();
    });
  });

  describe('getShaderSource', () => {
    it('should return WGSL source code', () => {
      const source = factory.getShaderSource('lif');
      expect(source).toContain('lif_step');
      expect(source).toContain('LIFParams');
    });

    it('should return different sources for different categories', () => {
      const lifSource = factory.getShaderSource('lif');
      const synapticSource = factory.getShaderSource('synaptic');
      expect(lifSource).not.toBe(synapticSource);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached pipelines and modules', () => {
      factory.getPipeline('lif_step');
      factory.getPipeline('encode_rate');

      factory.clearCache();

      // After clearing, creating again should work (new objects)
      const newPipeline = factory.getPipeline('lif_step');
      expect(newPipeline).toBeDefined();
    });
  });
});
