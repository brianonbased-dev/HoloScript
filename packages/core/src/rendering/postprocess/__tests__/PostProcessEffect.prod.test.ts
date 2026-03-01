/**
 * PostProcessEffect Production Tests
 *
 * BloomEffect and ToneMapEffect: construction, enabled (getter/setter),
 * intensity (getter/setter), params, initialized (getter), dispose.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BloomEffect, ToneMapEffect } from '../PostProcessEffect';

describe('PostProcessEffect — Production', () => {
  describe('BloomEffect', () => {
    let bloom: BloomEffect;

    beforeEach(() => {
      bloom = new BloomEffect();
    });

    it('constructs with type "bloom"', () => {
      expect(bloom.type).toBe('bloom');
      expect(bloom.name).toBe('Bloom');
    });

    it('starts enabled (getter)', () => {
      expect(bloom.enabled).toBe(true);
    });

    it('toggle enabled (setter)', () => {
      bloom.enabled = false;
      expect(bloom.enabled).toBe(false);
    });

    it('default intensity', () => {
      expect(bloom.intensity).toBeGreaterThan(0);
    });

    it('set intensity', () => {
      bloom.intensity = 2.5;
      expect(bloom.intensity).toBe(2.5);
    });

    it('getParams returns params', () => {
      const params = bloom.getParams();
      expect(params).toBeDefined();
    });

    it('setParams updates', () => {
      bloom.setParams({ intensity: 0.5 });
      expect(bloom.getParams().intensity).toBe(0.5);
    });

    it('starts uninitialized (getter)', () => {
      expect(bloom.initialized).toBe(false);
    });

    it('disposes safely (no GPU)', () => {
      // dispose without init should not error
      expect(() => bloom.dispose()).not.toThrow();
    });

    it('custom params in constructor', () => {
      const b = new BloomEffect({ intensity: 0.3, threshold: 0.9 });
      expect(b.getParams().intensity).toBe(0.3);
    });
  });

  describe('ToneMapEffect', () => {
    let tonemap: ToneMapEffect;

    beforeEach(() => {
      tonemap = new ToneMapEffect();
    });

    it('constructs with type "tonemap"', () => {
      expect(tonemap.type).toBe('tonemap');
    });

    it('starts enabled', () => {
      expect(tonemap.enabled).toBe(true);
    });

    it('getParams returns params', () => {
      const params = tonemap.getParams();
      expect(params).toBeDefined();
    });

    it('disposes safely', () => {
      expect(() => tonemap.dispose()).not.toThrow();
    });

    it('custom params', () => {
      const t = new ToneMapEffect({ exposure: 2.0 });
      expect(t.getParams().exposure).toBe(2.0);
    });
  });
});
