import { describe, it, expect } from 'vitest';
import { AudioPresets } from '../AudioPresets';

describe('AudioPresets', () => {
  it('exports a presets object', () => {
    expect(AudioPresets).toBeDefined();
    expect(typeof AudioPresets).toBe('object');
  });

  it('has expected preset keys', () => {
    const keys = Object.keys(AudioPresets);
    expect(keys).toContain('uiClick');
    expect(keys).toContain('uiHover');
    expect(keys).toContain('ambientLoop');
    expect(keys).toContain('objectInteraction');
    expect(keys).toContain('footstep');
    expect(keys).toContain('notification');
    expect(keys).toContain('music');
  });

  it('uiClick has correct properties', () => {
    const preset = AudioPresets.uiClick;
    expect(preset.volume).toBe(0.6);
    expect(preset.spatialize).toBe(false);
    expect(preset.loop).toBe(false);
    expect(preset.channel).toBe('ui');
  });

  it('ambientLoop is a loop', () => {
    expect(AudioPresets.ambientLoop.loop).toBe(true);
  });

  it('objectInteraction is spatialized', () => {
    expect(AudioPresets.objectInteraction.spatialize).toBe(true);
    expect(AudioPresets.objectInteraction.rolloffFactor).toBeGreaterThan(0);
  });

  it('footstep has valid refDistance and maxDistance', () => {
    const fp = AudioPresets.footstep;
    expect(fp.refDistance).toBeGreaterThan(0);
    expect(fp.maxDistance!).toBeGreaterThan(fp.refDistance!);
  });

  it('music loops and is non-spatial', () => {
    expect(AudioPresets.music.loop).toBe(true);
    expect(AudioPresets.music.spatialize).toBe(false);
  });

  it('all presets have volume between 0 and 1', () => {
    for (const [, preset] of Object.entries(AudioPresets)) {
      if (preset.volume !== undefined) {
        expect(preset.volume).toBeGreaterThanOrEqual(0);
        expect(preset.volume).toBeLessThanOrEqual(1);
      }
    }
  });

  it('distantAmbient has large maxDistance', () => {
    expect(AudioPresets.distantAmbient.maxDistance).toBeGreaterThanOrEqual(50);
  });

  it('notification is non-spatial UI', () => {
    expect(AudioPresets.notification.spatialize).toBe(false);
    expect(AudioPresets.notification.channel).toBe('ui');
  });
});
