import { describe, it, expect, beforeEach } from 'vitest';
import { PostProcessingStack } from '@holoscript/engine/rendering';

describe('PostProcessingStack', () => {
  let pp: PostProcessingStack;

  beforeEach(() => {
    pp = new PostProcessingStack();
  });

  it('starts with 1 default profile', () => {
    expect(pp.getProfileCount()).toBe(1);
    expect(pp.getProfile('default')).toBeDefined();
  });

  it('createProfile adds a new profile', () => {
    const p = pp.createProfile('custom', 'Custom');
    expect(p.id).toBe('custom');
    expect(pp.getProfileCount()).toBe(2);
  });

  it('loadPreset creates profile from preset', () => {
    const p = pp.loadPreset('cinematic');
    expect(p).not.toBeNull();
    expect(p!.bloom.enabled).toBe(true);
    expect(p!.toneMapping).toBe('filmic');
  });

  it('loadPreset returns null for unknown preset', () => {
    expect(pp.loadPreset('nonexistent')).toBeNull();
  });

  it('removeProfile deletes and clears active', () => {
    pp.createProfile('temp', 'Temp');
    pp.setActive('temp');
    expect(pp.getActive()!.id).toBe('temp');
    pp.removeProfile('temp');
    expect(pp.getActive()).toBeNull();
    expect(pp.getProfileCount()).toBe(1);
  });

  it('setActive returns false for unknown profile', () => {
    expect(pp.setActive('nope')).toBe(false);
  });

  it('setActive + getActive tracks active profile', () => {
    expect(pp.getActive()).toBeNull();
    pp.setActive('default');
    expect(pp.getActive()!.id).toBe('default');
  });

  it('setEffectEnabled toggles effect on profile', () => {
    const p = pp.getProfile('default')!;
    expect(p.bloom.enabled).toBe(false);
    pp.setEffectEnabled('default', 'bloom', true);
    expect(pp.getProfile('default')!.bloom.enabled).toBe(true);
  });

  it('setEffectEnabled returns false for unknown profile', () => {
    expect(pp.setEffectEnabled('nope', 'bloom', true)).toBe(false);
  });

  it('blendProfiles blends at t=0 and t=1', () => {
    pp.loadPreset('cinematic', 'a');
    pp.loadPreset('retro', 'b');
    const at0 = pp.blendProfiles('a', 'b', 0)!;
    const at1 = pp.blendProfiles('a', 'b', 1)!;
    expect(at0.toneMapping).toBe('filmic'); // from A
    expect(at1.toneMapping).toBe('reinhard'); // from B
  });

  it('blendProfiles returns null for missing profiles', () => {
    expect(pp.blendProfiles('a', 'b', 0.5)).toBeNull();
  });
});
