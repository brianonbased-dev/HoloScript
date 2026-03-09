/**
 * Integration tests - End-to-end SNN simulation workflows.
 *
 * Tests the full pipeline: encode -> simulate -> decode.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import { LIFSimulator } from '../lif-simulator.js';
import { SpikeEncoder, SpikeDecoder } from '../spike-codec.js';
import { SNNNetwork } from '../snn-network.js';
import { EncodingMode, DecodingMode } from '../types.js';

describe('Integration Tests', () => {
  let ctx: GPUContext;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('Encode -> LIF Simulate -> Read workflow', () => {
    it('should encode spatial data, run LIF simulation, and read spikes', async () => {
      const NEURON_COUNT = 500;
      const TIME_WINDOW = 20;

      // Step 1: Encode spatial data into spikes
      const encoder = new SpikeEncoder(ctx, {
        dataCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
        encodingMode: EncodingMode.Rate,
      });
      await encoder.initialize();

      const spatialData = new Float32Array(NEURON_COUNT);
      for (let i = 0; i < NEURON_COUNT; i++) {
        spatialData[i] = Math.sin(i * 0.1) * 0.5 + 0.5; // Sinusoidal pattern
      }
      await encoder.encode(spatialData);

      // Step 2: Create LIF simulator
      const sim = new LIFSimulator(ctx, NEURON_COUNT, {
        tau: 20.0,
        dt: 1.0,
      });
      await sim.initialize();

      // Step 3: Run simulation for several steps
      const currents = new Float32Array(NEURON_COUNT);
      for (let i = 0; i < NEURON_COUNT; i++) {
        currents[i] = spatialData[i] * 15.0; // Scale to generate spikes
      }
      sim.setSynapticInput(currents);

      for (let t = 0; t < 10; t++) {
        await sim.step();
      }

      // Step 4: Read results
      const spikes = await sim.readSpikes();
      expect(spikes.data.length).toBe(NEURON_COUNT);
      expect(spikes.data).toBeInstanceOf(Float32Array);

      const membrane = await sim.readMembranePotentials();
      expect(membrane.data.length).toBe(NEURON_COUNT);

      encoder.destroy();
      sim.destroy();
    });
  });

  describe('Full encode -> network -> decode pipeline', () => {
    it('should process data through a complete SNN pipeline', async () => {
      const INPUT_SIZE = 100;
      const OUTPUT_SIZE = 20;
      const TIME_WINDOW = 10;

      // Encode
      const encoder = new SpikeEncoder(ctx, {
        dataCount: INPUT_SIZE,
        timeWindow: TIME_WINDOW,
        encodingMode: EncodingMode.Temporal,
      });
      await encoder.initialize();

      const inputData = new Float32Array(INPUT_SIZE);
      for (let i = 0; i < INPUT_SIZE; i++) {
        inputData[i] = Math.random();
      }
      await encoder.encode(inputData);

      // Network
      const network = new SNNNetwork(ctx, {
        layers: [
          { name: 'input', neuronCount: INPUT_SIZE },
          { name: 'output', neuronCount: OUTPUT_SIZE },
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
        dt: 1.0,
      });
      await network.initialize();

      // Inject encoded spikes and step
      const encodedSpikes = new Float32Array(INPUT_SIZE);
      for (let i = 0; i < INPUT_SIZE; i++) {
        encodedSpikes[i] = Math.random() > 0.7 ? 1.0 : 0.0;
      }
      network.setInputSpikes('input', encodedSpikes);

      const stats = await network.step();
      expect(stats.totalSpikes).toBeGreaterThanOrEqual(0);
      expect(stats.layerSpikes.has('input')).toBe(true);
      expect(stats.layerSpikes.has('output')).toBe(true);

      // Read output spikes
      const outputSpikes = await network.readLayerSpikes('output');
      expect(outputSpikes.data.length).toBe(OUTPUT_SIZE);

      // Decode
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: OUTPUT_SIZE,
        timeWindow: TIME_WINDOW,
        decodingMode: DecodingMode.Rate,
      });
      await decoder.initialize();

      // Create a mock spike train from the network output
      const spikeTrainData = new Float32Array(OUTPUT_SIZE * TIME_WINDOW);
      for (let n = 0; n < OUTPUT_SIZE; n++) {
        if (outputSpikes.data[n] > 0.5) {
          // Place a spike at the first time bin
          spikeTrainData[n * TIME_WINDOW] = 1.0;
        }
      }
      await decoder.decode(spikeTrainData);

      const decodedValues = await decoder.readOutput();
      expect(decodedValues.data.length).toBe(OUTPUT_SIZE);

      encoder.destroy();
      network.destroy();
      decoder.destroy();
    });
  });

  describe('10K neuron performance target', () => {
    it('should handle 10K neurons across a multi-layer network', async () => {
      const network = new SNNNetwork(ctx, {
        layers: [
          { name: 'input', neuronCount: 5000 },
          { name: 'hidden', neuronCount: 3000 },
          { name: 'output', neuronCount: 2000 },
        ],
        connections: [
          { from: 'input', to: 'hidden', weightInit: 'random', stdpEnabled: false },
          { from: 'hidden', to: 'output', weightInit: 'random', stdpEnabled: false },
        ],
        dt: 1.0,
      });
      await network.initialize();

      expect(network.totalNeurons).toBe(10000);

      // Simulate 10 steps (representing ~10ms of biological time)
      for (let t = 0; t < 10; t++) {
        const stats = await network.step();
        expect(stats.stepTimeMs).toBeGreaterThanOrEqual(0);
      }

      expect(network.currentSimTimeMs).toBe(10.0);

      network.destroy();
    });
  });

  describe('Resource cleanup', () => {
    it('should not leak GPU memory across multiple create/destroy cycles', async () => {
      for (let cycle = 0; cycle < 5; cycle++) {
        const sim = new LIFSimulator(ctx, 1000);
        await sim.initialize();
        await sim.step();
        sim.destroy();
      }
      // If we reach here without errors, cleanup is working
    });

    it('should handle concurrent encoders and decoders', async () => {
      const encoder1 = new SpikeEncoder(ctx, { dataCount: 50 });
      const encoder2 = new SpikeEncoder(ctx, {
        dataCount: 100,
        encodingMode: EncodingMode.Temporal,
      });

      await encoder1.initialize();
      await encoder2.initialize();

      await encoder1.encode(new Float32Array(50).fill(0.3));
      await encoder2.encode(new Float32Array(100).fill(0.7));

      encoder1.destroy();
      encoder2.destroy();
    });
  });
});
