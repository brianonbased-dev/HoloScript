/**
 * HapticFeedback Production Tests
 * Sprint CLXVI — pattern registration, play, pulse, global intensity, enable/disable
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HapticFeedback, type HapticPattern } from '../HapticFeedback';

describe('HapticFeedback', () => {
  let haptics: HapticFeedback;

  beforeEach(() => {
    haptics = new HapticFeedback();
  });

  describe('presets', () => {
    it('registers 4 preset patterns on construction', () => {
      expect(haptics.getPatternCount()).toBe(4);
    });

    it('tap preset exists', () => { expect(haptics.getPattern('tap')).toBeTruthy(); });
    it('grab preset exists', () => { expect(haptics.getPattern('grab')).toBeTruthy(); });
    it('impact preset exists', () => { expect(haptics.getPattern('impact')).toBeTruthy(); });
    it('heartbeat preset exists', () => { expect(haptics.getPattern('heartbeat')).toBeTruthy(); });
  });

  describe('registerPattern', () => {
    it('adds a new pattern', () => {
      haptics.registerPattern({ name: 'buzz', loop: false, pulses: [{ hand: 'both', intensity: 0.8, durationMs: 100, frequency: 400 }] });
      expect(haptics.getPattern('buzz')).toBeTruthy();
      expect(haptics.getPatternCount()).toBe(5);
    });

    it('overwrites existing pattern with same name', () => {
      haptics.registerPattern({ name: 'tap', loop: true, pulses: [] });
      expect(haptics.getPattern('tap')?.loop).toBe(true);
    });
  });

  describe('play', () => {
    it('returns true for known pattern', () => { expect(haptics.play('tap')).toBe(true); });
    it('returns false for unknown pattern', () => { expect(haptics.play('unknown')).toBe(false); });
    it('tap adds 1 pulse', () => { haptics.play('tap'); expect(haptics.getActivePulseCount()).toBe(1); });
    it('grab adds 2 pulses', () => { haptics.play('grab'); expect(haptics.getActivePulseCount()).toBe(2); });

    it('returns false when disabled', () => {
      haptics.setEnabled(false);
      expect(haptics.play('tap')).toBe(false);
      expect(haptics.getActivePulseCount()).toBe(0);
    });
  });

  describe('pulse', () => {
    it('adds a single pulse', () => {
      haptics.pulse('right', 0.7, 50);
      expect(haptics.getActivePulseCount()).toBe(1);
    });

    it('does not add pulse when disabled', () => {
      haptics.setEnabled(false);
      haptics.pulse('left', 0.5, 100);
      expect(haptics.getActivePulseCount()).toBe(0);
    });

    it('multiple pulses accumulate', () => {
      haptics.pulse('right', 0.5, 50);
      haptics.pulse('left', 0.3, 80);
      expect(haptics.getActivePulseCount()).toBe(2);
    });
  });

  describe('stopAll', () => {
    it('clears all active pulses', () => {
      haptics.play('grab');
      haptics.pulse('right', 0.5, 50);
      haptics.stopAll();
      expect(haptics.getActivePulseCount()).toBe(0);
    });

    it('is safe to call when no pulses active', () => {
      expect(() => haptics.stopAll()).not.toThrow();
    });
  });

  describe('enable / disable', () => {
    it('starts enabled', () => { expect(haptics.isEnabled()).toBe(true); });
    it('setEnabled(false) disables', () => { haptics.setEnabled(false); expect(haptics.isEnabled()).toBe(false); });
    it('setEnabled(true) re-enables', () => { haptics.setEnabled(false); haptics.setEnabled(true); expect(haptics.isEnabled()).toBe(true); });
  });

  describe('globalIntensity', () => {
    it('starts at 1.0', () => { expect(haptics.getGlobalIntensity()).toBe(1.0); });

    it('clamps above 1.0 to 1.0', () => {
      haptics.setGlobalIntensity(2.0);
      expect(haptics.getGlobalIntensity()).toBe(1.0);
    });

    it('clamps below 0 to 0', () => {
      haptics.setGlobalIntensity(-0.5);
      expect(haptics.getGlobalIntensity()).toBe(0.0);
    });

    it('sets valid value', () => {
      haptics.setGlobalIntensity(0.75);
      expect(haptics.getGlobalIntensity()).toBe(0.75);
    });
  });

  describe('getPattern', () => {
    it('returns undefined for unknown pattern', () => {
      expect(haptics.getPattern('nonexistent')).toBeUndefined();
    });

    it('returns pattern with correct structure', () => {
      const p = haptics.getPattern('tap');
      expect(p?.pulses).toBeInstanceOf(Array);
      expect(p?.pulses[0].hand).toBe('right');
    });
  });
});
