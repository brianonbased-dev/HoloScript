/**
 * Tests for SpikeEncoder and SpikeDecoder.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import { SpikeEncoder, SpikeDecoder } from '../spike-codec.js';
import { EncodingMode, DecodingMode } from '../types.js';

describe('SpikeEncoder', () => {
  let ctx: GPUContext;
  const DATA_COUNT = 100;
  const TIME_WINDOW = 50;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('construction', () => {
    it('should create with rate encoding by default', () => {
      const encoder = new SpikeEncoder(ctx, { dataCount: DATA_COUNT });
      expect(encoder).toBeDefined();
      encoder.destroy();
    });

    it('should accept custom parameters', () => {
      const encoder = new SpikeEncoder(ctx, {
        dataCount: DATA_COUNT,
        timeWindow: TIME_WINDOW,
        encodingMode: EncodingMode.Temporal,
        minValue: -1.0,
        maxValue: 1.0,
      });
      expect(encoder).toBeDefined();
      encoder.destroy();
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const encoder = new SpikeEncoder(ctx, { dataCount: DATA_COUNT });
      await encoder.initialize();
      encoder.destroy();
    });

    it('should be idempotent', async () => {
      const encoder = new SpikeEncoder(ctx, { dataCount: DATA_COUNT });
      await encoder.initialize();
      await encoder.initialize();
      encoder.destroy();
    });

    it('should throw when encoding before initialization', async () => {
      const encoder = new SpikeEncoder(ctx, { dataCount: DATA_COUNT });
      const data = new Float32Array(DATA_COUNT);
      await expect(encoder.encode(data)).rejects.toThrow('not initialized');
      encoder.destroy();
    });
  });

  describe('encoding', () => {
    it('should encode data with rate coding', async () => {
      const encoder = new SpikeEncoder(ctx, {
        dataCount: DATA_COUNT,
        timeWindow: TIME_WINDOW,
        encodingMode: EncodingMode.Rate,
      });
      await encoder.initialize();

      const data = new Float32Array(DATA_COUNT);
      for (let i = 0; i < DATA_COUNT; i++) {
        data[i] = i / DATA_COUNT;
      }

      await encoder.encode(data);
      const result = await encoder.readSpikeTrains();

      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(DATA_COUNT * TIME_WINDOW);
      encoder.destroy();
    });

    it('should encode data with temporal coding', async () => {
      const encoder = new SpikeEncoder(ctx, {
        dataCount: DATA_COUNT,
        timeWindow: TIME_WINDOW,
        encodingMode: EncodingMode.Temporal,
      });
      await encoder.initialize();

      const data = new Float32Array(DATA_COUNT).fill(0.5);
      await encoder.encode(data);

      const result = await encoder.readSpikeTrains();
      expect(result.data.length).toBe(DATA_COUNT * TIME_WINDOW);
      encoder.destroy();
    });

    it('should encode data with delta coding', async () => {
      const encoder = new SpikeEncoder(ctx, {
        dataCount: DATA_COUNT,
        timeWindow: TIME_WINDOW,
        encodingMode: EncodingMode.Delta,
        deltaThreshold: 0.1,
      });
      await encoder.initialize();

      const data = new Float32Array(DATA_COUNT).fill(0.5);
      await encoder.encode(data);
      encoder.destroy();
    });

    it('should reject mismatched input length', async () => {
      const encoder = new SpikeEncoder(ctx, { dataCount: DATA_COUNT });
      await encoder.initialize();

      const wrongSize = new Float32Array(DATA_COUNT + 10);
      await expect(encoder.encode(wrongSize)).rejects.toThrow('must match dataCount');
      encoder.destroy();
    });
  });

  describe('spike train buffer handle', () => {
    it('should expose the spike train buffer for chaining', async () => {
      const encoder = new SpikeEncoder(ctx, { dataCount: DATA_COUNT });
      await encoder.initialize();

      const handle = encoder.spikeTrainHandle;
      expect(handle).toBeDefined();
      expect(handle.buffer).toBeDefined();
      encoder.destroy();
    });
  });
});

describe('SpikeDecoder', () => {
  let ctx: GPUContext;
  const NEURON_COUNT = 100;
  const TIME_WINDOW = 50;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('construction', () => {
    it('should create with rate decoding by default', () => {
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
      });
      expect(decoder).toBeDefined();
      decoder.destroy();
    });

    it('should accept custom parameters', () => {
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
        decodingMode: DecodingMode.Population,
        populationSize: 10,
        outputMin: -1.0,
        outputMax: 1.0,
      });
      expect(decoder).toBeDefined();
      decoder.destroy();
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
      });
      await decoder.initialize();
      decoder.destroy();
    });

    it('should accept external spike train buffer', async () => {
      const encoder = new SpikeEncoder(ctx, {
        dataCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
      });
      await encoder.initialize();

      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
      });
      await decoder.initialize(encoder.spikeTrainHandle);

      encoder.destroy();
      decoder.destroy();
    });
  });

  describe('decoding', () => {
    it('should decode with rate decoding', async () => {
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
        decodingMode: DecodingMode.Rate,
      });
      await decoder.initialize();

      // Create mock spike train
      const spikes = new Float32Array(NEURON_COUNT * TIME_WINDOW);
      await decoder.decode(spikes);

      const result = await decoder.readOutput();
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(NEURON_COUNT);
      decoder.destroy();
    });

    it('should decode with temporal decoding', async () => {
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
        decodingMode: DecodingMode.Temporal,
      });
      await decoder.initialize();

      const spikes = new Float32Array(NEURON_COUNT * TIME_WINDOW);
      await decoder.decode(spikes);

      const result = await decoder.readOutput();
      expect(result.data.length).toBe(NEURON_COUNT);
      decoder.destroy();
    });

    it('should decode with population decoding', async () => {
      const POP_SIZE = 10;
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
        decodingMode: DecodingMode.Population,
        populationSize: POP_SIZE,
      });
      await decoder.initialize();

      const spikes = new Float32Array(NEURON_COUNT * TIME_WINDOW);
      await decoder.decode(spikes);

      const result = await decoder.readOutput();
      // Population decoding: output size = neuronCount / populationSize
      expect(result.data.length).toBe(NEURON_COUNT / POP_SIZE);
      decoder.destroy();
    });

    it('should decode with first-spike decoding', async () => {
      const POP_SIZE = 10;
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
        decodingMode: DecodingMode.FirstSpike,
        populationSize: POP_SIZE,
      });
      await decoder.initialize();

      const spikes = new Float32Array(NEURON_COUNT * TIME_WINDOW);
      await decoder.decode(spikes);

      const result = await decoder.readOutput();
      expect(result.data.length).toBe(NEURON_COUNT / POP_SIZE);
      decoder.destroy();
    });
  });

  describe('tuning curves', () => {
    it('should accept custom tuning curves', async () => {
      const decoder = new SpikeDecoder(ctx, {
        neuronCount: NEURON_COUNT,
        timeWindow: TIME_WINDOW,
        decodingMode: DecodingMode.Population,
        populationSize: 10,
      });
      await decoder.initialize();

      const curves = new Float32Array(NEURON_COUNT);
      for (let i = 0; i < NEURON_COUNT; i++) {
        curves[i] = Math.sin((i * Math.PI) / NEURON_COUNT);
      }
      decoder.setTuningCurves(curves);
      decoder.destroy();
    });
  });
});
