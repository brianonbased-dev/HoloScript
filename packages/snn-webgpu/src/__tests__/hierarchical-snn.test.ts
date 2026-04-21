/**
 * Tests for HierarchicalSNN (large-scale SNN with hierarchical workgroup
 * decomposition and shared-memory synaptic current tiling).
 *
 * Paper-2 (SNN NeurIPS) §5.4 implementation test suite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import {
  HierarchicalSNN,
  type HierarchicalConfig,
  type HierarchicalStats,
} from '../large-scale-snn.js';

// ── Helpers ───────────────────────────────────────────────────────────────

async function makeCtx(): Promise<GPUContext> {
  const ctx = new GPUContext();
  await ctx.initialize();
  return ctx;
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('HierarchicalSNN', () => {
  let ctx: GPUContext;

  beforeEach(async () => {
    ctx = await makeCtx();
  });

  afterEach(() => {
    ctx.destroy();
  });

  // ── Initialization ──────────────────────────────────────────────────────

  describe('initialization', () => {
    it('initializes with neuronCount=256 and no synaptic pathway', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 0 });
      await snn.initialize();
      snn.destroy();
    });

    it('initializes with neuronCount=1024 and synapticInputCount=64', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 1024, synapticInputCount: 64 });
      await snn.initialize();
      snn.destroy();
    });

    it('initialize() is idempotent', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 0 });
      await snn.initialize();
      await snn.initialize(); // second call is a no-op
      snn.destroy();
    });

    it('throws if step() is called before initialize()', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 64, synapticInputCount: 0 });
      await expect(snn.step()).rejects.toThrow('initialize');
      snn.destroy();
    });
  });

  // ── Dispatch count assertions ───────────────────────────────────────────

  describe('getStats() dispatch counts', () => {
    it('reports correct partitionDispatch for N=256, neuronsPerThread=4', async () => {
      // ceil(256 / (256 * 4)) = ceil(0.25) = 1
      const snn = new HierarchicalSNN(ctx, {
        neuronCount: 256,
        synapticInputCount: 0,
        neuronsPerThread: 4,
      });
      await snn.initialize();
      const stats = snn.getStats();
      expect(stats.partitionDispatch).toBe(1);
      snn.destroy();
    });

    it('reports correct partitionDispatch for N=1024, neuronsPerThread=4', async () => {
      // ceil(1024 / (256 * 4)) = ceil(1) = 1
      const snn = new HierarchicalSNN(ctx, {
        neuronCount: 1024,
        synapticInputCount: 0,
        neuronsPerThread: 4,
      });
      await snn.initialize();
      const stats = snn.getStats();
      expect(stats.partitionDispatch).toBe(1);
      snn.destroy();
    });

    it('reports correct partitionDispatch for N=2048, neuronsPerThread=4', async () => {
      // ceil(2048 / (256 * 4)) = ceil(2) = 2
      const snn = new HierarchicalSNN(ctx, {
        neuronCount: 2048,
        synapticInputCount: 0,
        neuronsPerThread: 4,
      });
      await snn.initialize();
      const stats = snn.getStats();
      expect(stats.partitionDispatch).toBe(2);
      snn.destroy();
    });

    it('reports correct partitionDispatch for N=1000000 (1M neurons), neuronsPerThread=4', async () => {
      // ceil(1_000_000 / (256 * 4)) = ceil(976.5625) = 977
      const snn = new HierarchicalSNN(ctx, {
        neuronCount: 1_000_000,
        synapticInputCount: 0,
        neuronsPerThread: 4,
      });
      // Do NOT call initialize() — we only test the stats calculation here
      // (1M neuron buffer allocation is fine but slow for CI; dispatch math is pure TS)
      const stats = snn.getStats();
      expect(stats.partitionDispatch).toBe(977);
      snn.destroy();
    });

    it('workgroupReductionFactor ≥ 4 for default neuronsPerThread=4', async () => {
      // baseline ceil(1024/256)=4 vs partition ceil(1024/1024)=1 → factor=4
      const snn = new HierarchicalSNN(ctx, {
        neuronCount: 1024,
        synapticInputCount: 0,
        neuronsPerThread: 4,
      });
      await snn.initialize();
      const stats = snn.getStats();
      expect(stats.workgroupReductionFactor).toBeGreaterThanOrEqual(4);
      snn.destroy();
    });

    it('reports preTileCount=0 when synapticInputCount=0', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 0 });
      await snn.initialize();
      expect(snn.getStats().preTileCount).toBe(0);
      snn.destroy();
    });

    it('reports preTileCount=1 for synapticInputCount=256', async () => {
      // ceil(256/256) = 1
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 256 });
      await snn.initialize();
      expect(snn.getStats().preTileCount).toBe(1);
      snn.destroy();
    });

    it('reports preTileCount=2 for synapticInputCount=512', async () => {
      // ceil(512/256) = 2
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 512 });
      await snn.initialize();
      expect(snn.getStats().preTileCount).toBe(2);
      snn.destroy();
    });

    it('reports synapticDispatch=0 when synapticInputCount=0', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 512, synapticInputCount: 0 });
      await snn.initialize();
      expect(snn.getStats().synapticDispatch).toBe(0);
      snn.destroy();
    });

    it('reports synapticDispatch > 0 when synapticInputCount > 0', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 512, synapticInputCount: 64 });
      await snn.initialize();
      expect(snn.getStats().synapticDispatch).toBeGreaterThan(0);
      snn.destroy();
    });
  });

  // ── step() ──────────────────────────────────────────────────────────────

  describe('step()', () => {
    it('completes a step without error for N=256, no synapses', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 0 });
      await snn.initialize();
      await snn.step();
      snn.destroy();
    });

    it('completes multiple steps without error', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 0 });
      await snn.initialize();
      for (let i = 0; i < 5; i++) {
        await snn.step();
      }
      snn.destroy();
    });

    it('completes a step with synaptic pathway (N=256, pre=64)', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 64 });
      await snn.initialize();
      await snn.step();
      snn.destroy();
    });

    it('accepts pre-spike injection before step', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 64 });
      await snn.initialize();
      const spikes = new Float32Array(64).fill(0);
      spikes[0] = 1.0;
      spikes[31] = 1.0;
      snn.setPreSpikes(spikes);
      await snn.step();
      snn.destroy();
    });

    it('accepts direct synaptic current injection', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 0 });
      await snn.initialize();
      const currents = new Float32Array(256).fill(2.0); // above threshold
      snn.setSynapticInput(currents);
      await snn.step();
      snn.destroy();
    });
  });

  // ── readSpikes() ─────────────────────────────────────────────────────────

  describe('readSpikes()', () => {
    it('returns a Float32Array of length neuronCount', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 512, synapticInputCount: 0 });
      await snn.initialize();
      await snn.step();
      const spikes = await snn.readSpikes();
      expect(spikes).toBeInstanceOf(Float32Array);
      expect(spikes.length).toBe(512);
      snn.destroy();
    });

    it('spike values are in {0, 1}', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 256, synapticInputCount: 0 });
      await snn.initialize();
      await snn.step();
      const spikes = await snn.readSpikes();
      for (const v of spikes) {
        expect(v === 0.0 || v === 1.0).toBe(true);
      }
      snn.destroy();
    });
  });

  // ── readMembrane() ────────────────────────────────────────────────────────

  describe('readMembrane()', () => {
    it('returns a Float32Array of length neuronCount', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 128, synapticInputCount: 0 });
      await snn.initialize();
      await snn.step();
      const v = await snn.readMembrane();
      expect(v).toBeInstanceOf(Float32Array);
      expect(v.length).toBe(128);
      snn.destroy();
    });
  });

  // ── setPreSpikes validation ───────────────────────────────────────────────

  describe('setPreSpikes() validation', () => {
    it('throws if synapticInputCount=0', async () => {
      const snn = new HierarchicalSNN(ctx, { neuronCount: 64, synapticInputCount: 0 });
      await snn.initialize();
      const spikes = new Float32Array(0);
      expect(() => snn.setPreSpikes(spikes)).toThrow('synapticInputCount=0');
      snn.destroy();
    });
  });
});
