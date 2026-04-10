import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MorphTrait, MorphConfig } from './MorphTrait';

describe('MorphTrait', () => {
  let trait: MorphTrait;

  beforeEach(() => {
    trait = new MorphTrait();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Target Management', () => {
    it('should add and retrieve targets', () => {
      trait.addTarget({ name: 'smile', weight: 0.5 });
      expect(trait.getTarget('smile')).toBeDefined();
      expect(trait.getWeight('smile')).toBe(0.5);
    });

    it('should clamp weights between min and max', () => {
      trait.addTarget({ name: 'smile', min: 0, max: 1 });
      trait.setWeight('smile', 1.5);
      expect(trait.getWeight('smile')).toBe(1);

      trait.setWeight('smile', -0.5);
      expect(trait.getWeight('smile')).toBe(0);
    });

    it('should emit weight-changed event', () => {
      const spy = vi.fn();
      trait.on('weight-changed', spy);
      trait.addTarget({ name: 'smile' });
      trait.setWeight('smile', 0.8);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'weight-changed',
          target: 'smile',
          weight: 0.8,
        })
      );
    });
  });

  describe('Preset Management', () => {
    beforeEach(() => {
      trait.addTarget({ name: 'smile' });
      trait.addTarget({ name: 'frown' });
      trait.addPreset({
        name: 'happy',
        weights: { smile: 1.0, frown: 0 },
      });
    });

    it('should apply preset instantly', () => {
      trait.applyPreset('happy');
      expect(trait.getWeight('smile')).toBe(1.0);
      expect(trait.getWeight('frown')).toBe(0);
    });

    it('should blend to preset', () => {
      trait.blendToPreset('happy', 1.0); // 1 second blend

      // Advance time by 0.5s
      trait.update(0.5);

      // Should be halfway (approx with regular easing, exact with linear)
      // Default is ease-out, so > 0.5
      expect(trait.getWeight('smile')).toBeGreaterThan(0.5);
      expect(trait.getWeight('smile')).toBeLessThan(1.0);

      // Finish
      trait.update(0.6);
      expect(trait.getWeight('smile')).toBe(1.0);
    });
  });

  describe('Auto Blink', () => {
    it('should trigger blink events', () => {
      trait = new MorphTrait({
        autoBlink: {
          enabled: true,
          targets: ['blink_L', 'blink_R'],
          interval: 1, // 1 sec
          duration: 0.1,
          randomize: 0,
        },
      });
      trait.addTarget({ name: 'blink_L' });
      trait.addTarget({ name: 'blink_R' });

      const spy = vi.spyOn(trait, 'blink');

      // Advance time to trigger blink
      vi.advanceTimersByTime(1100);

      expect(spy).toHaveBeenCalled();
    });
  });
});
