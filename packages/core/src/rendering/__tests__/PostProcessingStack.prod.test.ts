/**
 * PostProcessingStack.prod.test.ts
 *
 * Production tests for PostProcessingStack — profile management, preset loading,
 * active profile, effect toggles, and profile blending.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PostProcessingStack } from '../PostProcessing';

describe('PostProcessingStack', () => {
  let stack: PostProcessingStack;

  beforeEach(() => { stack = new PostProcessingStack(); });

  describe('initial state', () => {
    it('has a default profile', () => {
      expect(stack.getProfileCount()).toBe(1);
      expect(stack.getProfile('default')).toBeDefined();
    });

    it('no active profile initially', () => {
      expect(stack.getActive()).toBeNull();
    });
  });

  describe('createProfile / getProfile / removeProfile', () => {
    it('createProfile stores profile', () => {
      stack.createProfile('cinematic', 'Cinematic');
      expect(stack.getProfile('cinematic')).toBeDefined();
    });

    it('createProfile default bloom is disabled', () => {
      const p = stack.createProfile('x', 'X');
      expect(p.bloom.enabled).toBe(false);
    });

    it('getProfile returns undefined for unknown id', () => {
      expect(stack.getProfile('ghost')).toBeUndefined();
    });

    it('getProfileCount increases', () => {
      stack.createProfile('a', 'A');
      stack.createProfile('b', 'B');
      expect(stack.getProfileCount()).toBe(3); // default + a + b
    });

    it('removeProfile removes it', () => {
      stack.createProfile('x', 'X');
      stack.removeProfile('x');
      expect(stack.getProfile('x')).toBeUndefined();
    });

    it('removeProfile returns true for existing profile', () => {
      stack.createProfile('x', 'X');
      expect(stack.removeProfile('x')).toBe(true);
    });

    it('removeProfile returns false for unknown profile', () => {
      expect(stack.removeProfile('ghost')).toBe(false);
    });

    it('removing active profile clears active', () => {
      stack.createProfile('x', 'X');
      stack.setActive('x');
      stack.removeProfile('x');
      expect(stack.getActive()).toBeNull();
    });
  });

  describe('setActive / getActive', () => {
    it('setActive returns true for existing profile', () => {
      expect(stack.setActive('default')).toBe(true);
    });

    it('setActive returns false for unknown profile', () => {
      expect(stack.setActive('ghost')).toBe(false);
    });

    it('getActive returns the active profile', () => {
      stack.setActive('default');
      expect(stack.getActive()!.id).toBe('default');
    });
  });

  describe('loadPreset', () => {
    it('loads cinematic preset', () => {
      const p = stack.loadPreset('cinematic');
      expect(p).not.toBeNull();
      expect(p!.bloom.enabled).toBe(true);
    });

    it('loads retro preset with chromaticAberration enabled', () => {
      const p = stack.loadPreset('retro');
      expect(p!.chromaticAberration.enabled).toBe(true);
    });

    it('loads sciFi preset', () => {
      const p = stack.loadPreset('sciFi');
      expect(p!.ssao.enabled).toBe(true);
    });

    it('returns null for unknown preset', () => {
      expect(stack.loadPreset('ghost')).toBeNull();
    });

    it('preset is stored with custom id', () => {
      stack.loadPreset('cinematic', 'myCinematic');
      expect(stack.getProfile('myCinematic')).toBeDefined();
    });
  });

  describe('setEffectEnabled', () => {
    it('enables bloom on default profile', () => {
      stack.setEffectEnabled('default', 'bloom', true);
      expect(stack.getProfile('default')!.bloom.enabled).toBe(true);
    });

    it('disables vignette', () => {
      stack.setEffectEnabled('default', 'vignette', false);
      expect(stack.getProfile('default')!.vignette.enabled).toBe(false);
    });

    it('returns false for unknown profile', () => {
      expect(stack.setEffectEnabled('ghost', 'bloom', true)).toBe(false);
    });

    it('returns true on success', () => {
      expect(stack.setEffectEnabled('default', 'ssao', true)).toBe(true);
    });
  });

  describe('blendProfiles', () => {
    it('returns null if source unknown', () => {
      stack.createProfile('b', 'B');
      expect(stack.blendProfiles('ghost', 'b', 0.5)).toBeNull();
    });

    it('returns null if target unknown', () => {
      expect(stack.blendProfiles('default', 'ghost', 0.5)).toBeNull();
    });

    it('t=0 returns from profile values', () => {
      const from = stack.createProfile('from', 'From');
      const to   = stack.createProfile('to', 'To');
      from.exposure = 1; to.exposure = 3;
      const blended = stack.blendProfiles('from', 'to', 0);
      expect(blended!.exposure).toBeCloseTo(1, 5);
    });

    it('t=1 returns to profile values', () => {
      const from = stack.createProfile('from', 'From');
      const to   = stack.createProfile('to', 'To');
      from.exposure = 1; to.exposure = 3;
      const blended = stack.blendProfiles('from', 'to', 1);
      expect(blended!.exposure).toBeCloseTo(3, 5);
    });

    it('t=0.5 interpolates exposure midpoint', () => {
      const from = stack.createProfile('from', 'From');
      const to   = stack.createProfile('to', 'To');
      from.exposure = 1; to.exposure = 3;
      const blended = stack.blendProfiles('from', 'to', 0.5);
      expect(blended!.exposure).toBeCloseTo(2, 5);
    });

    it('bloom.enabled follows t>0.5 rule', () => {
      const from = stack.createProfile('from', 'From');
      const to   = stack.createProfile('to', 'To');
      from.bloom.enabled = false; to.bloom.enabled = true;
      expect(stack.blendProfiles('from', 'to', 0.4)!.bloom.enabled).toBe(false);
      expect(stack.blendProfiles('from', 'to', 0.6)!.bloom.enabled).toBe(true);
    });

    it('ssao.samples interpolated and rounded', () => {
      const from = stack.createProfile('from', 'From');
      const to   = stack.createProfile('to', 'To');
      from.ssao.samples = 16; to.ssao.samples = 32;
      const blended = stack.blendProfiles('from', 'to', 0.5);
      expect(blended!.ssao.samples).toBe(24);
    });
  });
});
