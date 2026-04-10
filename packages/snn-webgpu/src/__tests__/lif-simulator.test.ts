/**
 * Tests for LIFSimulator - High-level LIF neuron simulation API.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import { LIFSimulator } from '../lif-simulator.js';
import { DEFAULT_LIF_PARAMS } from '../types.js';

describe('LIFSimulator', () => {
  let ctx: GPUContext;
  const NEURON_COUNT = 1000;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('construction', () => {
    it('should create with default parameters', () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      expect(sim.count).toBe(NEURON_COUNT);
      expect(sim.currentParams).toEqual(DEFAULT_LIF_PARAMS);
      sim.destroy();
    });

    it('should accept custom parameters', () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT, {
        tau: 10.0,
        vThreshold: -50.0,
      });
      expect(sim.currentParams.tau).toBe(10.0);
      expect(sim.currentParams.vThreshold).toBe(-50.0);
      expect(sim.currentParams.vRest).toBe(DEFAULT_LIF_PARAMS.vRest); // unchanged
      sim.destroy();
    });

    it('should handle 10K neurons (target specification)', () => {
      const sim = new LIFSimulator(ctx, 10000);
      expect(sim.count).toBe(10000);
      sim.destroy();
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();
      expect(sim.gpuMemoryBytes).toBeGreaterThan(0);
      sim.destroy();
    });

    it('should be idempotent', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();
      await sim.initialize(); // Should not throw
      sim.destroy();
    });

    it('should throw when stepping before initialization', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await expect(sim.step()).rejects.toThrow('not initialized');
      sim.destroy();
    });
  });

  describe('simulation stepping', () => {
    it('should step once', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();
      await sim.step();
      expect(sim.currentStep).toBe(1);
      sim.destroy();
    });

    it('should step N times', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();
      await sim.stepN(10);
      expect(sim.currentStep).toBe(10);
      sim.destroy();
    });
  });

  describe('synaptic input', () => {
    it('should accept valid synaptic input', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();

      const currents = new Float32Array(NEURON_COUNT);
      for (let i = 0; i < NEURON_COUNT; i++) {
        currents[i] = Math.random() * 5.0;
      }
      sim.setSynapticInput(currents);
      sim.destroy();
    });

    it('should reject mismatched input length', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();

      const wrongSize = new Float32Array(500);
      expect(() => sim.setSynapticInput(wrongSize)).toThrow('must match neuron count');
      sim.destroy();
    });
  });

  describe('parameter updates', () => {
    it('should update parameters mid-simulation', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();

      sim.updateParams({ tau: 15.0 });
      expect(sim.currentParams.tau).toBe(15.0);
      expect(sim.currentParams.vThreshold).toBe(DEFAULT_LIF_PARAMS.vThreshold); // unchanged
      sim.destroy();
    });
  });

  describe('readback', () => {
    it('should read spikes', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();
      await sim.step();

      const result = await sim.readSpikes();
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(NEURON_COUNT);
      expect(result.readbackTimeMs).toBeGreaterThanOrEqual(0);
      sim.destroy();
    });

    it('should read membrane potentials', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();

      const result = await sim.readMembranePotentials();
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(NEURON_COUNT);
      sim.destroy();
    });
  });

  describe('state reset', () => {
    it('should reset simulation state', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();
      await sim.stepN(5);
      expect(sim.currentStep).toBe(5);

      sim.resetState();
      expect(sim.currentStep).toBe(0);
      sim.destroy();
    });
  });

  describe('GPU memory tracking', () => {
    it('should report positive memory after initialization', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();

      // 5 buffers: params(32) + membrane(4000) + synaptic(4000) + spikes(4000) + refractory(4000)
      expect(sim.gpuMemoryBytes).toBeGreaterThan(0);
      sim.destroy();
    });
  });

  describe('destroy', () => {
    it('should clean up all resources', async () => {
      const sim = new LIFSimulator(ctx, NEURON_COUNT);
      await sim.initialize();
      sim.destroy();

      // After destroy, operations should throw
      await expect(sim.step()).rejects.toThrow('not initialized');
    });
  });
});
