/**
 * Tests for SNNNetwork - Full network orchestration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import { SNNNetwork } from '../snn-network.js';
import type { NetworkConfig } from '../types.js';

describe('SNNNetwork', () => {
  let ctx: GPUContext;

  const SIMPLE_CONFIG: NetworkConfig = {
    layers: [
      { name: 'input', neuronCount: 100 },
      { name: 'output', neuronCount: 50 },
    ],
    connections: [
      {
        from: 'input',
        to: 'output',
        weightInit: 'random',
        stdpEnabled: false,
      },
    ],
    dt: 1.0,
  };

  const MULTI_LAYER_CONFIG: NetworkConfig = {
    layers: [
      { name: 'input', neuronCount: 200 },
      { name: 'hidden1', neuronCount: 100, lifParams: { tau: 15.0 } },
      { name: 'hidden2', neuronCount: 50 },
      { name: 'output', neuronCount: 20 },
    ],
    connections: [
      { from: 'input', to: 'hidden1', weightInit: 'random', stdpEnabled: true, learningRate: 0.01 },
      { from: 'hidden1', to: 'hidden2', weightInit: 'random', stdpEnabled: true },
      {
        from: 'hidden2',
        to: 'output',
        weightInit: 'uniform',
        uniformValue: 0.3,
        stdpEnabled: false,
      },
    ],
    dt: 0.5,
  };

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('construction and validation', () => {
    it('should create a simple two-layer network', () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      expect(network).toBeDefined();
      network.destroy();
    });

    it('should create a multi-layer network', () => {
      const network = new SNNNetwork(ctx, MULTI_LAYER_CONFIG);
      expect(network).toBeDefined();
      network.destroy();
    });

    it('should reject duplicate layer names', async () => {
      const badConfig: NetworkConfig = {
        layers: [
          { name: 'layer', neuronCount: 100 },
          { name: 'layer', neuronCount: 50 }, // duplicate!
        ],
        connections: [],
      };

      const network = new SNNNetwork(ctx, badConfig);
      await expect(network.initialize()).rejects.toThrow('Duplicate layer names');
      network.destroy();
    });

    it('should reject connections to unknown layers', async () => {
      const badConfig: NetworkConfig = {
        layers: [{ name: 'input', neuronCount: 100 }],
        connections: [
          { from: 'input', to: 'nonexistent', weightInit: 'zeros', stdpEnabled: false },
        ],
      };

      const network = new SNNNetwork(ctx, badConfig);
      await expect(network.initialize()).rejects.toThrow('unknown target layer');
      network.destroy();
    });

    it('should reject connections from unknown layers', async () => {
      const badConfig: NetworkConfig = {
        layers: [{ name: 'output', neuronCount: 100 }],
        connections: [
          { from: 'nonexistent', to: 'output', weightInit: 'zeros', stdpEnabled: false },
        ],
      };

      const network = new SNNNetwork(ctx, badConfig);
      await expect(network.initialize()).rejects.toThrow('unknown source layer');
      network.destroy();
    });
  });

  describe('initialization', () => {
    it('should initialize all layers and connections', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      expect(network.totalNeurons).toBe(150); // 100 + 50
      expect(network.layerNames).toEqual(['input', 'output']);
      expect(network.gpuMemoryBytes).toBeGreaterThan(0);

      network.destroy();
    });

    it('should be idempotent', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();
      await network.initialize(); // Should not throw
      network.destroy();
    });

    it('should handle large networks (target: 10K neurons)', async () => {
      const largeConfig: NetworkConfig = {
        layers: [
          { name: 'input', neuronCount: 5000 },
          { name: 'output', neuronCount: 5000 },
        ],
        connections: [{ from: 'input', to: 'output', weightInit: 'zeros', stdpEnabled: false }],
      };

      const network = new SNNNetwork(ctx, largeConfig);
      await network.initialize();
      expect(network.totalNeurons).toBe(10000);
      network.destroy();
    });
  });

  describe('simulation', () => {
    it('should step once and return stats', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      const stats = await network.step();

      expect(stats.totalSpikes).toBeGreaterThanOrEqual(0);
      expect(stats.layerSpikes.size).toBe(2);
      expect(stats.layerAvgVoltage.size).toBe(2);
      expect(stats.stepTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.simTimeMs).toBe(1.0);

      network.destroy();
    });

    it('should step N times', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      const stats = await network.stepN(10);
      expect(stats.simTimeMs).toBe(10.0);

      network.destroy();
    });

    it('should throw when stepping before initialization', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await expect(network.step()).rejects.toThrow('not initialized');
      network.destroy();
    });
  });

  describe('input injection', () => {
    it('should accept spike input for a layer', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      const spikes = new Float32Array(100);
      spikes[0] = 1.0;
      spikes[10] = 1.0;
      network.setInputSpikes('input', spikes);

      network.destroy();
    });

    it('should accept synaptic input for a layer', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      const currents = new Float32Array(100).fill(5.0);
      network.setSynapticInput('input', currents);

      network.destroy();
    });

    it('should reject mismatched spike input length', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      const wrongSize = new Float32Array(50);
      expect(() => network.setInputSpikes('input', wrongSize)).toThrow('must match');

      network.destroy();
    });

    it('should throw for unknown layer', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      const data = new Float32Array(100);
      expect(() => network.setInputSpikes('nonexistent', data)).toThrow('not found');

      network.destroy();
    });
  });

  describe('readback', () => {
    it('should read layer spikes', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();
      await network.step();

      const result = await network.readLayerSpikes('output');
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(50);

      network.destroy();
    });

    it('should read layer membrane potentials', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      const result = await network.readLayerMembrane('input');
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(100);

      network.destroy();
    });

    it('should read connection weights', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      const result = await network.readConnectionWeights('input', 'output');
      expect(result.data).toBeInstanceOf(Float32Array);
      // Weight matrix: pre_count * post_count = 100 * 50 = 5000
      expect(result.data.length).toBe(5000);

      network.destroy();
    });

    it('should throw for unknown connection', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();

      await expect(network.readConnectionWeights('output', 'input')).rejects.toThrow(
        'No connection found'
      );

      network.destroy();
    });
  });

  describe('state reset', () => {
    it('should reset all layers to initial state', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();
      await network.stepN(5);

      expect(network.currentSimTimeMs).toBe(5.0);

      network.resetState();
      expect(network.currentSimTimeMs).toBe(0);

      network.destroy();
    });
  });

  describe('weight initialization', () => {
    it('should support random weight initialization', async () => {
      const config: NetworkConfig = {
        layers: [
          { name: 'a', neuronCount: 10 },
          { name: 'b', neuronCount: 10 },
        ],
        connections: [{ from: 'a', to: 'b', weightInit: 'random', stdpEnabled: false }],
      };

      const network = new SNNNetwork(ctx, config);
      await network.initialize();
      network.destroy();
    });

    it('should support uniform weight initialization', async () => {
      const config: NetworkConfig = {
        layers: [
          { name: 'a', neuronCount: 10 },
          { name: 'b', neuronCount: 10 },
        ],
        connections: [
          { from: 'a', to: 'b', weightInit: 'uniform', uniformValue: 0.25, stdpEnabled: false },
        ],
      };

      const network = new SNNNetwork(ctx, config);
      await network.initialize();
      network.destroy();
    });

    it('should support zero weight initialization', async () => {
      const config: NetworkConfig = {
        layers: [
          { name: 'a', neuronCount: 10 },
          { name: 'b', neuronCount: 10 },
        ],
        connections: [{ from: 'a', to: 'b', weightInit: 'zeros', stdpEnabled: false }],
      };

      const network = new SNNNetwork(ctx, config);
      await network.initialize();
      network.destroy();
    });
  });

  describe('STDP learning', () => {
    it('should run STDP weight updates when enabled', async () => {
      const config: NetworkConfig = {
        layers: [
          { name: 'input', neuronCount: 50 },
          { name: 'output', neuronCount: 20 },
        ],
        connections: [
          {
            from: 'input',
            to: 'output',
            weightInit: 'random',
            stdpEnabled: true,
            learningRate: 0.01,
          },
        ],
      };

      const network = new SNNNetwork(ctx, config);
      await network.initialize();

      // Set some input spikes
      const spikes = new Float32Array(50);
      spikes[0] = 1.0;
      spikes[5] = 1.0;
      spikes[10] = 1.0;
      network.setInputSpikes('input', spikes);

      // Step should run STDP pass
      await network.step();
      network.destroy();
    });
  });

  describe('multi-layer simulation', () => {
    it('should propagate activity through multiple layers', async () => {
      const network = new SNNNetwork(ctx, MULTI_LAYER_CONFIG);
      await network.initialize();

      expect(network.totalNeurons).toBe(370); // 200+100+50+20
      expect(network.layerNames).toEqual(['input', 'hidden1', 'hidden2', 'output']);

      await network.step();

      // Read spikes from all layers
      for (const name of network.layerNames) {
        const result = await network.readLayerSpikes(name);
        expect(result.data).toBeInstanceOf(Float32Array);
      }

      network.destroy();
    });
  });

  describe('destroy', () => {
    it('should clean up all resources', async () => {
      const network = new SNNNetwork(ctx, SIMPLE_CONFIG);
      await network.initialize();
      network.destroy();

      expect(network.layerNames).toEqual([]);
      await expect(network.step()).rejects.toThrow('not initialized');
    });
  });
});
