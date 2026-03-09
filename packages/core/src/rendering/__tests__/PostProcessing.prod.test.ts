/**
 * PostProcessingStack — Production Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PostProcessingStack, PP_PRESETS } from '../PostProcessing';

function makeStack() {
  return new PostProcessingStack();
}

describe('PostProcessingStack — construction', () => {
  it('starts with 1 profile (default)', () => {
    expect(makeStack().getProfileCount()).toBe(1);
  });
  it('default profile has id "default"', () => {
    expect(makeStack().getProfile('default')).toBeDefined();
  });
  it('default profile has all effects disabled', () => {
    const p = makeStack().getProfile('default')!;
    expect(p.bloom.enabled).toBe(false);
    expect(p.ssao.enabled).toBe(false);
    expect(p.colorGrading.enabled).toBe(false);
    expect(p.vignette.enabled).toBe(false);
    expect(p.chromaticAberration.enabled).toBe(false);
  });
  it('starts with no active profile', () => {
    expect(makeStack().getActive()).toBeNull();
  });
});

describe('PostProcessingStack — createProfile', () => {
  it('creates a profile with given id and name', () => {
    const s = makeStack();
    const p = s.createProfile('cinematic', 'Cinematic Look');
    expect(p.id).toBe('cinematic');
    expect(p.name).toBe('Cinematic Look');
  });
  it('getProfileCount increments', () => {
    const s = makeStack();
    s.createProfile('a', 'A');
    s.createProfile('b', 'B');
    expect(s.getProfileCount()).toBe(3);
  });
  it('getProfile returns undefined for unknown id', () => {
    expect(makeStack().getProfile('ghost')).toBeUndefined();
  });
  it('new profile has all effects disabled by default', () => {
    const s = makeStack();
    const p = s.createProfile('fresh', 'Fresh');
    expect(p.bloom.enabled).toBe(false);
    expect(p.antiAliasing).toBe('fxaa');
    expect(p.toneMapping).toBe('aces');
  });
});

describe('PostProcessingStack — removeProfile', () => {
  it('removes a profile', () => {
    const s = makeStack();
    s.createProfile('tmp', 'Tmp');
    expect(s.removeProfile('tmp')).toBe(true);
    expect(s.getProfile('tmp')).toBeUndefined();
  });
  it('returns false for unknown id', () => {
    expect(makeStack().removeProfile('nope')).toBe(false);
  });
  it('removes active profile reference when deleted', () => {
    const s = makeStack();
    s.createProfile('p', 'P');
    s.setActive('p');
    s.removeProfile('p');
    expect(s.getActive()).toBeNull();
  });
});

describe('PostProcessingStack — loadPreset', () => {
  it('PP_PRESETS has cinematic/retro/sciFi', () => {
    expect(Object.keys(PP_PRESETS)).toContain('cinematic');
    expect(Object.keys(PP_PRESETS)).toContain('retro');
    expect(Object.keys(PP_PRESETS)).toContain('sciFi');
  });
  it('loadPreset returns a profile', () => {
    const p = makeStack().loadPreset('cinematic');
    expect(p).not.toBeNull();
    expect(p!.id).toBe('cinematic');
  });
  it('cinematic preset has bloom enabled', () => {
    expect(makeStack().loadPreset('cinematic')!.bloom.enabled).toBe(true);
  });
  it('cinematic preset has vignette enabled', () => {
    expect(makeStack().loadPreset('cinematic')!.vignette.enabled).toBe(true);
  });
  it('retro preset has chromaticAberration enabled', () => {
    expect(makeStack().loadPreset('retro')!.chromaticAberration.enabled).toBe(true);
  });
  it('sciFi preset has bloom and ssao enabled', () => {
    const p = makeStack().loadPreset('sciFi')!;
    expect(p.bloom.enabled).toBe(true);
    expect(p.ssao.enabled).toBe(true);
  });
  it('loadPreset accepts custom id', () => {
    const s = makeStack();
    s.loadPreset('cinematic', 'my-cinematic');
    expect(s.getProfile('my-cinematic')).toBeDefined();
    expect(s.getProfile('cinematic')).toBeUndefined();
  });
  it('loadPreset returns null for unknown preset', () => {
    expect(makeStack().loadPreset('fake-preset')).toBeNull();
  });
});

describe('PostProcessingStack — setActive / getActive', () => {
  it('setActive returns true for known profile', () => {
    const s = makeStack();
    expect(s.setActive('default')).toBe(true);
  });
  it('setActive returns false for unknown id', () => {
    expect(makeStack().setActive('ghost')).toBe(false);
  });
  it('getActive returns the active profile', () => {
    const s = makeStack();
    s.setActive('default');
    expect(s.getActive()!.id).toBe('default');
  });
  it('switching active profile works', () => {
    const s = makeStack();
    s.createProfile('p2', 'P2');
    s.setActive('default');
    s.setActive('p2');
    expect(s.getActive()!.id).toBe('p2');
  });
});

describe('PostProcessingStack — setEffectEnabled', () => {
  it('returns false for unknown profile', () => {
    expect(makeStack().setEffectEnabled('ghost', 'bloom', true)).toBe(false);
  });
  it('enables bloom on known profile', () => {
    const s = makeStack();
    s.setEffectEnabled('default', 'bloom', true);
    expect(s.getProfile('default')!.bloom.enabled).toBe(true);
  });
  it('disables effect that was enabled', () => {
    const s = makeStack();
    s.loadPreset('cinematic');
    s.setEffectEnabled('cinematic', 'bloom', false);
    expect(s.getProfile('cinematic')!.bloom.enabled).toBe(false);
  });
  it('toggles all 5 effect types without throwing', () => {
    const s = makeStack();
    const effects = ['bloom', 'ssao', 'colorGrading', 'vignette', 'chromaticAberration'] as const;
    for (const e of effects) {
      expect(() => s.setEffectEnabled('default', e, true)).not.toThrow();
      expect(s.getProfile('default')![e].enabled).toBe(true);
    }
  });
});

describe('PostProcessingStack — blendProfiles', () => {
  it('returns null if either profile not found', () => {
    const s = makeStack();
    expect(s.blendProfiles('default', 'ghost', 0.5)).toBeNull();
    expect(s.blendProfiles('ghost', 'default', 0.5)).toBeNull();
  });
  it('t=0 returns values close to "from"', () => {
    const s = makeStack();
    s.createProfile('a', 'A');
    s.createProfile('b', 'B');
    s.getProfile('a')!.bloom.intensity = 0;
    s.getProfile('b')!.bloom.intensity = 1;
    const blended = s.blendProfiles('a', 'b', 0)!;
    expect(blended.bloom.intensity).toBeCloseTo(0);
  });
  it('t=1 returns values close to "to"', () => {
    const s = makeStack();
    s.createProfile('a', 'A');
    s.createProfile('b', 'B');
    s.getProfile('a')!.bloom.intensity = 0;
    s.getProfile('b')!.bloom.intensity = 1;
    const blended = s.blendProfiles('a', 'b', 1)!;
    expect(blended.bloom.intensity).toBeCloseTo(1);
  });
  it('t=0.5 returns midpoint', () => {
    const s = makeStack();
    s.createProfile('a', 'A');
    s.createProfile('b', 'B');
    s.getProfile('a')!.exposure = 0;
    s.getProfile('b')!.exposure = 1;
    expect(s.blendProfiles('a', 'b', 0.5)!.exposure).toBeCloseTo(0.5);
  });
  it('blended profile id contains both source ids', () => {
    const s = makeStack();
    s.createProfile('x', 'X');
    s.createProfile('y', 'Y');
    const b = s.blendProfiles('x', 'y', 0.5)!;
    expect(b.id).toContain('x');
    expect(b.id).toContain('y');
  });
  it('enabled flag switches at t=0.5 boundary', () => {
    const s = makeStack();
    s.createProfile('a', 'A');
    s.createProfile('b', 'B');
    s.getProfile('a')!.bloom.enabled = false;
    s.getProfile('b')!.bloom.enabled = true;
    expect(s.blendProfiles('a', 'b', 0.4)!.bloom.enabled).toBe(false);
    expect(s.blendProfiles('a', 'b', 0.6)!.bloom.enabled).toBe(true);
  });
  it('ssao samples are rounded integers', () => {
    const s = makeStack();
    s.createProfile('a', 'A');
    s.createProfile('b', 'B');
    s.getProfile('a')!.ssao.samples = 16;
    s.getProfile('b')!.ssao.samples = 32;
    const samples = s.blendProfiles('a', 'b', 0.5)!.ssao.samples;
    expect(Number.isInteger(samples)).toBe(true);
  });
});
