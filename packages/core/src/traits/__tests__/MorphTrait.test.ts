/**
 * MorphTrait Tests
 *
 * Tests for blend shapes/morph targets for facial animation.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MorphTrait,
  type MorphTarget,
  type MorphPreset,
  type MorphClip,
  type MorphConfig,
} from '../MorphTrait';

describe('MorphTrait', () => {
  let morph: MorphTrait;

  beforeEach(() => {
    morph = new MorphTrait();
  });

  afterEach(() => {
    morph.dispose?.();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const config = morph.getConfig();

      expect(config.defaultBlendTime).toBe(0.3);
    });

    it('should accept custom config', () => {
      morph = new MorphTrait({
        defaultBlendTime: 0.5,
      });

      const config = morph.getConfig();
      expect(config.defaultBlendTime).toBe(0.5);
    });

    it('should initialize targets from config', () => {
      const targets: MorphTarget[] = [
        { name: 'smile', weight: 0 },
        { name: 'frown', weight: 0 },
      ];

      morph = new MorphTrait({ targets });

      expect(morph.getTarget('smile')).toBeDefined();
      expect(morph.getTarget('frown')).toBeDefined();
    });

    it('should initialize presets from config', () => {
      const presets: MorphPreset[] = [
        { name: 'happy', weights: { smile: 1.0 } },
        { name: 'sad', weights: { frown: 0.8 } },
      ];

      morph = new MorphTrait({ presets });

      expect(morph.getPreset('happy')).toBeDefined();
      expect(morph.getPreset('sad')).toBeDefined();
    });

    it('should initialize clips from config', () => {
      const clips: MorphClip[] = [
        {
          name: 'blink',
          duration: 0.2,
          keyframes: [
            { time: 0, weights: { blink_L: 0, blink_R: 0 } },
            { time: 0.1, weights: { blink_L: 1, blink_R: 1 } },
            { time: 0.2, weights: { blink_L: 0, blink_R: 0 } },
          ],
        },
      ];

      morph = new MorphTrait({ clips });

      expect(morph.getClip('blink')).toBeDefined();
    });
  });

  describe('target management', () => {
    it('should add a morph target', () => {
      morph.addTarget({ name: 'smile', weight: 0 });

      const target = morph.getTarget('smile');
      expect(target).toBeDefined();
      expect(target?.name).toBe('smile');
      expect(target?.weight).toBe(0);
    });

    it('should remove a morph target', () => {
      morph.addTarget({ name: 'temp', weight: 0 });
      expect(morph.getTarget('temp')).toBeDefined();

      morph.removeTarget('temp');
      expect(morph.getTarget('temp')).toBeUndefined();
    });

    it('should get all target names', () => {
      morph.addTarget({ name: 'a', weight: 0 });
      morph.addTarget({ name: 'b', weight: 0 });
      morph.addTarget({ name: 'c', weight: 0 });

      const names = morph.getTargetNames();
      expect(names).toHaveLength(3);
    });

    it('should get target names', () => {
      morph.addTarget({ name: 'smile', weight: 0 });
      morph.addTarget({ name: 'frown', weight: 0 });

      const names = morph.getTargetNames();
      expect(names).toContain('smile');
      expect(names).toContain('frown');
    });

    it('should set target weight', () => {
      morph.addTarget({ name: 'smile', weight: 0 });
      morph.setWeight('smile', 0.5);

      const target = morph.getTarget('smile');
      expect(target?.weight).toBe(0.5);
    });

    it('should clamp weight to min/max', () => {
      morph.addTarget({ name: 'clamped', weight: 0, min: 0, max: 1 });

      morph.setWeight('clamped', 1.5);
      expect(morph.getWeight('clamped')).toBe(1);

      morph.setWeight('clamped', -0.5);
      expect(morph.getWeight('clamped')).toBe(0);
    });

    it('should get weight of target', () => {
      morph.addTarget({ name: 'test', weight: 0.75 });

      expect(morph.getWeight('test')).toBe(0.75);
    });

    it('should return 0 for nonexistent target weight', () => {
      expect(morph.getWeight('missing')).toBe(0);
    });
  });

  describe('preset management', () => {
    beforeEach(() => {
      morph.addTarget({ name: 'smile', weight: 0 });
      morph.addTarget({ name: 'frown', weight: 0 });
      morph.addTarget({ name: 'brow_up', weight: 0 });
    });

    it('should add a preset', () => {
      morph.addPreset({
        name: 'happy',
        weights: { smile: 1.0, brow_up: 0.3 },
      });

      const preset = morph.getPreset('happy');
      expect(preset).toBeDefined();
      expect(preset?.weights.smile).toBe(1.0);
    });

    it('should remove a preset', () => {
      morph.addPreset({ name: 'temp', weights: { smile: 1 } });
      morph.removePreset('temp');

      expect(morph.getPreset('temp')).toBeUndefined();
    });

    it('should get all preset names', () => {
      morph.addPreset({ name: 'a', weights: {} });
      morph.addPreset({ name: 'b', weights: {} });

      const names = morph.getPresetNames();
      expect(names).toHaveLength(2);
    });

    it('should apply preset instantly', () => {
      morph.addPreset({
        name: 'happy',
        weights: { smile: 1.0, frown: 0 },
      });

      morph.applyPreset('happy', 0); // 0 = instant

      expect(morph.getWeight('smile')).toBe(1.0);
    });
  });

  describe('clip management', () => {
    it('should add a clip', () => {
      const clip: MorphClip = {
        name: 'blink',
        duration: 0.2,
        keyframes: [
          { time: 0, weights: { blink: 0 } },
          { time: 0.1, weights: { blink: 1 } },
          { time: 0.2, weights: { blink: 0 } },
        ],
      };

      morph.addClip(clip);

      expect(morph.getClip('blink')).toBeDefined();
    });

    it('should remove a clip', () => {
      morph.addClip({
        name: 'temp',
        duration: 1,
        keyframes: [],
      });

      morph.removeClip('temp');
      expect(morph.getClip('temp')).toBeUndefined();
    });

    it('should check clip exists', () => {
      morph.addClip({ name: 'a', duration: 1, keyframes: [] });
      morph.addClip({ name: 'b', duration: 1, keyframes: [] });

      expect(morph.getClip('a')).toBeDefined();
      expect(morph.getClip('b')).toBeDefined();
    });
  });

  describe('animation playback', () => {
    beforeEach(() => {
      morph.addTarget({ name: 'blink_L', weight: 0 });
      morph.addTarget({ name: 'blink_R', weight: 0 });

      morph.addClip({
        name: 'blink',
        duration: 0.2,
        keyframes: [
          { time: 0, weights: { blink_L: 0, blink_R: 0 } },
          { time: 0.1, weights: { blink_L: 1, blink_R: 1 } },
          { time: 0.2, weights: { blink_L: 0, blink_R: 0 } },
        ],
      });
    });

    it('should play animation clip', () => {
      morph.play('blink');

      expect(morph.isPlaying('blink')).toBe(true);
    });

    it('should stop animation clip', () => {
      morph.play('blink');
      morph.stop('blink');

      expect(morph.isPlaying('blink')).toBe(false);
    });

    it('should stop all animations', () => {
      morph.addClip({ name: 'other', duration: 1, keyframes: [] });
      morph.play('blink');
      morph.play('other');

      morph.stopAll();

      expect(morph.isPlaying('blink')).toBe(false);
      expect(morph.isPlaying('other')).toBe(false);
    });

    it('should return false for nonexistent clip', () => {
      const result = morph.play('missing');
      expect(result).toBe(false);
    });
  });

  describe('blending', () => {
    beforeEach(() => {
      morph.addTarget({ name: 'smile', weight: 0 });
      morph.addTarget({ name: 'frown', weight: 1 });
    });

    it('should blend to target weights using setWeights', () => {
      morph.setWeights({ smile: 1, frown: 0 }); // Instant set

      expect(morph.getWeight('smile')).toBe(1);
      expect(morph.getWeight('frown')).toBe(0);
    });

    it('should blend to weights over time', () => {
      morph.blendToWeights({ smile: 1 }, 1, 'linear'); // 1 second blend

      // Blend is now active
      expect(morph.getWeight('smile')).toBe(0); // Not yet changed
    });
  });

  describe('events', () => {
    it('should register event listeners', () => {
      const callback = vi.fn();
      morph.on('weight-changed', callback);

      morph.addTarget({ name: 'test', weight: 0 });
      morph.setWeight('test', 0.5);

      expect(callback).toHaveBeenCalled();
    });

    it('should remove event listeners', () => {
      const callback = vi.fn();
      morph.on('weight-changed', callback);
      morph.off('weight-changed', callback);

      morph.addTarget({ name: 'test', weight: 0 });
      morph.setWeight('test', 0.5);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should emit preset-applied event', () => {
      const callback = vi.fn();
      morph.on('preset-applied', callback);

      morph.addTarget({ name: 'smile', weight: 0 });
      morph.addPreset({ name: 'happy', weights: { smile: 1 } });
      morph.applyPreset('happy', 0);

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].preset).toBe('happy');
    });

    it('should emit animation-start event', () => {
      const callback = vi.fn();
      morph.on('animation-start', callback);

      morph.addClip({ name: 'test', duration: 1, keyframes: [] });
      morph.play('test');

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].clip).toBe('test');
    });
  });

  describe('update', () => {
    it('should update animations over time', () => {
      morph.addTarget({ name: 'a', weight: 0 });
      morph.addClip({
        name: 'fade',
        duration: 1,
        keyframes: [
          { time: 0, weights: { a: 0 } },
          { time: 1, weights: { a: 1 } },
        ],
      });

      morph.play('fade');
      morph.update(0.5); // 50% through

      // Weight should be somewhere between 0 and 1
      const weight = morph.getWeight('a');
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    });
  });

  describe('reset', () => {
    it('should reset all weights to 0', () => {
      morph.addTarget({ name: 'a', weight: 0.5 });
      morph.addTarget({ name: 'b', weight: 0.8 });

      morph.resetWeights();

      expect(morph.getWeight('a')).toBe(0);
      expect(morph.getWeight('b')).toBe(0);
    });

    it('should stop all animations', () => {
      morph.addClip({ name: 'clip', duration: 1, keyframes: [] });
      morph.play('clip');

      morph.stopAll();

      expect(morph.isPlaying('clip')).toBe(false);
    });
  });

  describe('categories', () => {
    it('should get targets by category', () => {
      morph.addTarget({ name: 'smile', weight: 0, category: 'mouth' });
      morph.addTarget({ name: 'frown', weight: 0, category: 'mouth' });
      morph.addTarget({ name: 'blink', weight: 0, category: 'eyes' });

      const mouthTargets = morph.getTargetsByCategory('mouth');
      expect(mouthTargets).toHaveLength(2);

      const eyeTargets = morph.getTargetsByCategory('eyes');
      expect(eyeTargets).toHaveLength(1);
    });
  });

  describe('serialization', () => {
    it('should get current weights', () => {
      morph.addTarget({ name: 'smile', weight: 0.5 });
      morph.addTarget({ name: 'frown', weight: 0.3 });

      const weights = morph.getWeights();

      expect(weights).toBeDefined();
      expect(weights.smile).toBe(0.5);
      expect(weights.frown).toBe(0.3);
    });

    it('should set weights from object', () => {
      morph.addTarget({ name: 'smile', weight: 0 });
      morph.addTarget({ name: 'frown', weight: 0 });

      morph.setWeights({ smile: 1, frown: 0.5 });

      expect(morph.getWeight('smile')).toBe(1);
      expect(morph.getWeight('frown')).toBe(0.5);
    });
  });
});

describe('MorphTrait auto-blink', () => {
  it('should configure auto-blink', () => {
    const morph = new MorphTrait({
      targets: [
        { name: 'blink_L', weight: 0 },
        { name: 'blink_R', weight: 0 },
      ],
      autoBlink: {
        enabled: true,
        targets: ['blink_L', 'blink_R'],
        interval: 3000,
        duration: 200,
      },
    });

    const config = morph.getConfig();
    expect(config.autoBlink?.enabled).toBe(true);
    expect(config.autoBlink?.interval).toBe(3000);

    morph.dispose?.();
  });
});

describe('MorphTrait lip sync', () => {
  it('should configure lip sync', () => {
    const morph = new MorphTrait({
      lipSync: {
        enabled: true,
        visemeMap: {
          aa: 'mouth_open',
          ee: 'mouth_wide',
          oo: 'mouth_round',
        },
      },
    });

    const config = morph.getConfig();
    expect(config.lipSync?.enabled).toBe(true);
    expect(config.lipSync?.visemeMap.aa).toBe('mouth_open');

    morph.dispose?.();
  });
});
