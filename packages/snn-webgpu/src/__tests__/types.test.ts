/**
 * Tests for types.ts - constants, defaults, and utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LIF_PARAMS,
  DEFAULT_ENCODE_PARAMS,
  DEFAULT_DECODE_PARAMS,
  EncodingMode,
  DecodingMode,
  computeDispatchSize,
} from '../types.js';

describe('types', () => {
  describe('DEFAULT_LIF_PARAMS', () => {
    it('should have biologically plausible defaults', () => {
      expect(DEFAULT_LIF_PARAMS.tau).toBe(20.0);
      expect(DEFAULT_LIF_PARAMS.vThreshold).toBe(-55.0);
      expect(DEFAULT_LIF_PARAMS.vReset).toBe(-75.0);
      expect(DEFAULT_LIF_PARAMS.vRest).toBe(-65.0);
      expect(DEFAULT_LIF_PARAMS.dt).toBe(1.0);
    });

    it('should have threshold above resting potential', () => {
      expect(DEFAULT_LIF_PARAMS.vThreshold).toBeGreaterThan(DEFAULT_LIF_PARAMS.vRest);
    });

    it('should have reset below resting potential', () => {
      expect(DEFAULT_LIF_PARAMS.vReset).toBeLessThan(DEFAULT_LIF_PARAMS.vRest);
    });

    it('should have reset below threshold', () => {
      expect(DEFAULT_LIF_PARAMS.vReset).toBeLessThan(DEFAULT_LIF_PARAMS.vThreshold);
    });
  });

  describe('DEFAULT_ENCODE_PARAMS', () => {
    it('should have reasonable encoding defaults', () => {
      expect(DEFAULT_ENCODE_PARAMS.timeWindow).toBe(100);
      expect(DEFAULT_ENCODE_PARAMS.encodingMode).toBe(EncodingMode.Rate);
      expect(DEFAULT_ENCODE_PARAMS.seed).toBe(42);
      expect(DEFAULT_ENCODE_PARAMS.minValue).toBe(0.0);
      expect(DEFAULT_ENCODE_PARAMS.maxValue).toBe(1.0);
      expect(DEFAULT_ENCODE_PARAMS.deltaThreshold).toBe(0.1);
    });
  });

  describe('DEFAULT_DECODE_PARAMS', () => {
    it('should have reasonable decoding defaults', () => {
      expect(DEFAULT_DECODE_PARAMS.decodingMode).toBe(DecodingMode.Rate);
      expect(DEFAULT_DECODE_PARAMS.populationSize).toBe(10);
      expect(DEFAULT_DECODE_PARAMS.outputMin).toBe(0.0);
      expect(DEFAULT_DECODE_PARAMS.outputMax).toBe(1.0);
    });
  });

  describe('EncodingMode', () => {
    it('should have three encoding modes', () => {
      expect(EncodingMode.Rate).toBe(0);
      expect(EncodingMode.Temporal).toBe(1);
      expect(EncodingMode.Delta).toBe(2);
    });
  });

  describe('DecodingMode', () => {
    it('should have four decoding modes', () => {
      expect(DecodingMode.Rate).toBe(0);
      expect(DecodingMode.Temporal).toBe(1);
      expect(DecodingMode.Population).toBe(2);
      expect(DecodingMode.FirstSpike).toBe(3);
    });
  });

  describe('computeDispatchSize', () => {
    it('should compute correct workgroup count for exact multiple', () => {
      expect(computeDispatchSize(256)).toBe(1);
      expect(computeDispatchSize(512)).toBe(2);
      expect(computeDispatchSize(1024)).toBe(4);
    });

    it('should round up for non-exact multiples', () => {
      expect(computeDispatchSize(1)).toBe(1);
      expect(computeDispatchSize(257)).toBe(2);
      expect(computeDispatchSize(513)).toBe(3);
    });

    it('should handle 10K neurons (target use case)', () => {
      expect(computeDispatchSize(10000)).toBe(40); // ceil(10000/256) = 40
    });

    it('should support custom workgroup sizes', () => {
      expect(computeDispatchSize(100, 64)).toBe(2);
      expect(computeDispatchSize(100, 128)).toBe(1);
      expect(computeDispatchSize(100, 32)).toBe(4);
    });

    it('should handle zero neurons', () => {
      expect(computeDispatchSize(0)).toBe(0);
    });

    it('should handle very large neuron counts', () => {
      expect(computeDispatchSize(1000000)).toBe(3907); // ceil(1M/256)
    });
  });
});
