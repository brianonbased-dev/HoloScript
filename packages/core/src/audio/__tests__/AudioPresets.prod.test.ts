/**
 * AudioPresets — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { AudioPresets } from '../AudioPresets';

describe('AudioPresets — structure', () => {
  it('exports AudioPresets object', () => {
    expect(AudioPresets).toBeDefined();
  });
  it('has at least 8 presets', () => {
    expect(Object.keys(AudioPresets).length).toBeGreaterThanOrEqual(8);
  });
  it('contains expected preset names', () => {
    const keys = Object.keys(AudioPresets);
    for (const name of [
      'uiClick',
      'uiHover',
      'ambientLoop',
      'objectInteraction',
      'distantAmbient',
      'footstep',
      'notification',
      'music',
    ]) {
      expect(keys).toContain(name);
    }
  });
});

describe('AudioPresets — uiClick', () => {
  it('has volume 0.6', () => {
    expect(AudioPresets.uiClick.volume).toBeCloseTo(0.6);
  });
  it('spatialize=false', () => {
    expect(AudioPresets.uiClick.spatialize).toBe(false);
  });
  it('loop=false', () => {
    expect(AudioPresets.uiClick.loop).toBe(false);
  });
  it('channel=ui', () => {
    expect(AudioPresets.uiClick.channel).toBe('ui');
  });
});

describe('AudioPresets — uiHover', () => {
  it('has volume 0.3', () => {
    expect(AudioPresets.uiHover.volume).toBeCloseTo(0.3);
  });
  it('spatialize=false', () => {
    expect(AudioPresets.uiHover.spatialize).toBe(false);
  });
});

describe('AudioPresets — ambientLoop', () => {
  it('loop=true', () => {
    expect(AudioPresets.ambientLoop.loop).toBe(true);
  });
  it('spatialize=false', () => {
    expect(AudioPresets.ambientLoop.spatialize).toBe(false);
  });
  it('channel=ambient', () => {
    expect(AudioPresets.ambientLoop.channel).toBe('ambient');
  });
  it('maxDistance=100', () => {
    expect(AudioPresets.ambientLoop.maxDistance).toBe(100);
  });
});

describe('AudioPresets — objectInteraction', () => {
  it('spatialize=true', () => {
    expect(AudioPresets.objectInteraction.spatialize).toBe(true);
  });
  it('loop=false', () => {
    expect(AudioPresets.objectInteraction.loop).toBe(false);
  });
  it('channel=sfx', () => {
    expect(AudioPresets.objectInteraction.channel).toBe('sfx');
  });
  it('rolloffFactor > 1 (close proximity)', () => {
    expect(AudioPresets.objectInteraction.rolloffFactor!).toBeGreaterThan(1);
  });
});

describe('AudioPresets — distantAmbient', () => {
  it('loop=true', () => {
    expect(AudioPresets.distantAmbient.loop).toBe(true);
  });
  it('spatialize=true', () => {
    expect(AudioPresets.distantAmbient.spatialize).toBe(true);
  });
  it('large maxDistance', () => {
    expect(AudioPresets.distantAmbient.maxDistance!).toBeGreaterThanOrEqual(50);
  });
  it('rolloffFactor<1 (distant source)', () => {
    expect(AudioPresets.distantAmbient.rolloffFactor!).toBeLessThan(1);
  });
});

describe('AudioPresets — footstep', () => {
  it('spatialize=true', () => {
    expect(AudioPresets.footstep.spatialize).toBe(true);
  });
  it('loop=false', () => {
    expect(AudioPresets.footstep.loop).toBe(false);
  });
  it('channel=sfx', () => {
    expect(AudioPresets.footstep.channel).toBe('sfx');
  });
});

describe('AudioPresets — notification', () => {
  it('spatialize=false', () => {
    expect(AudioPresets.notification.spatialize).toBe(false);
  });
  it('channel=ui', () => {
    expect(AudioPresets.notification.channel).toBe('ui');
  });
});

describe('AudioPresets — music', () => {
  it('loop=true', () => {
    expect(AudioPresets.music.loop).toBe(true);
  });
  it('spatialize=false', () => {
    expect(AudioPresets.music.spatialize).toBe(false);
  });
  it('channel=music', () => {
    expect(AudioPresets.music.channel).toBe('music');
  });
  it('lower volume than sfx', () => {
    expect(AudioPresets.music.volume!).toBeLessThan(AudioPresets.objectInteraction.volume!);
  });
});
