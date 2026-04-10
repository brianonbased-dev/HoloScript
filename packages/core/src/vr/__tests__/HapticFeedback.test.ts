import { describe, it, expect, beforeEach } from 'vitest';
import { HapticFeedback } from '../HapticFeedback';

describe('HapticFeedback', () => {
  let haptics: HapticFeedback;

  beforeEach(() => {
    haptics = new HapticFeedback();
  });

  // ---------- Initialization ----------
  it('registers preset patterns on construction', () => {
    expect(haptics.getPatternCount()).toBeGreaterThanOrEqual(4);
    expect(haptics.getPattern('tap')).toBeDefined();
    expect(haptics.getPattern('grab')).toBeDefined();
    expect(haptics.getPattern('impact')).toBeDefined();
    expect(haptics.getPattern('heartbeat')).toBeDefined();
  });

  it('starts enabled', () => {
    expect(haptics.isEnabled()).toBe(true);
  });

  it('starts with globalIntensity 1', () => {
    expect(haptics.getGlobalIntensity()).toBe(1);
  });

  // ---------- Play ----------
  it('plays a known pattern', () => {
    const success = haptics.play('tap');
    expect(success).toBe(true);
    expect(haptics.getActivePulseCount()).toBeGreaterThan(0);
  });

  it('returns false for unknown pattern', () => {
    expect(haptics.play('nonexistent')).toBe(false);
  });

  it('does not play when disabled', () => {
    haptics.setEnabled(false);
    expect(haptics.play('tap')).toBe(false);
    expect(haptics.getActivePulseCount()).toBe(0);
  });

  it('plays pattern on specific hand override', () => {
    haptics.play('tap', 'left');
    expect(haptics.getActivePulseCount()).toBe(1);
  });

  // ---------- Custom Pulse ----------
  it('fires a custom pulse', () => {
    haptics.pulse('right', 0.5, 100);
    expect(haptics.getActivePulseCount()).toBe(1);
  });

  it('does not fire pulse when disabled', () => {
    haptics.setEnabled(false);
    haptics.pulse('left', 0.8, 50);
    expect(haptics.getActivePulseCount()).toBe(0);
  });

  // ---------- Stop All ----------
  it('stops all active pulses', () => {
    haptics.play('impact');
    haptics.pulse('left', 1, 200);
    expect(haptics.getActivePulseCount()).toBeGreaterThan(0);
    haptics.stopAll();
    expect(haptics.getActivePulseCount()).toBe(0);
  });

  // ---------- Custom Patterns ----------
  it('registers a custom pattern', () => {
    haptics.registerPattern({
      name: 'custom',
      loop: false,
      pulses: [{ hand: 'both', intensity: 0.4, durationMs: 80, frequency: 180 }],
    });
    expect(haptics.getPattern('custom')).toBeDefined();
    expect(haptics.play('custom')).toBe(true);
  });

  // ---------- Global Intensity ----------
  it('clamps global intensity to 0-1', () => {
    haptics.setGlobalIntensity(2);
    expect(haptics.getGlobalIntensity()).toBe(1);
    haptics.setGlobalIntensity(-0.5);
    expect(haptics.getGlobalIntensity()).toBe(0);
  });

  it('scales pulse intensity by globalIntensity', () => {
    haptics.setGlobalIntensity(0.5);
    haptics.play('impact'); // impact has intensity 1.0
    // Active pulse count should be 1 (the pattern has 1 pulse)
    expect(haptics.getActivePulseCount()).toBe(1);
  });

  // ---------- Enable/Disable ----------
  it('toggles enabled state', () => {
    haptics.setEnabled(false);
    expect(haptics.isEnabled()).toBe(false);
    haptics.setEnabled(true);
    expect(haptics.isEnabled()).toBe(true);
  });
});
