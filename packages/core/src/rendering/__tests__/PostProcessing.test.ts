import { describe, it, expect, beforeEach } from 'vitest';
import { PostProcessingStack, PP_PRESETS } from '../PostProcessing';

describe('PostProcessingStack', () => {
  let stack: PostProcessingStack;

  beforeEach(() => {
    stack = new PostProcessingStack();
  });

  it('starts with default profile', () => {
    expect(stack.getProfileCount()).toBe(1);
    expect(stack.getProfile('default')).toBeDefined();
  });

  it('createProfile adds new profile', () => {
    stack.createProfile('custom', 'Custom');
    expect(stack.getProfileCount()).toBe(2);
    expect(stack.getProfile('custom')!.name).toBe('Custom');
  });

  it('removeProfile', () => {
    stack.createProfile('tmp', 'Temp');
    expect(stack.removeProfile('tmp')).toBe(true);
    expect(stack.getProfile('tmp')).toBeUndefined();
  });

  it('removeProfile returns false for missing', () => {
    expect(stack.removeProfile('nope')).toBe(false);
  });

  it('setActive and getActive', () => {
    expect(stack.setActive('default')).toBe(true);
    expect(stack.getActive()!.id).toBe('default');
  });

  it('setActive returns false for missing profile', () => {
    expect(stack.setActive('nope')).toBe(false);
  });

  it('getActive returns null if none set', () => {
    expect(stack.getActive()).toBeNull();
  });

  // Presets
  it('loadPreset creates profile from preset', () => {
    const profile = stack.loadPreset('cinematic');
    expect(profile).not.toBeNull();
    expect(profile!.bloom.enabled).toBe(true);
  });

  it('loadPreset returns null for unknown preset', () => {
    expect(stack.loadPreset('nonexistent')).toBeNull();
  });

  // Effect toggles
  it('setEffectEnabled toggles bloom', () => {
    expect(stack.setEffectEnabled('default', 'bloom', false)).toBe(true);
    expect(stack.getProfile('default')!.bloom.enabled).toBe(false);
  });

  it('setEffectEnabled returns false for missing profile', () => {
    expect(stack.setEffectEnabled('nope', 'bloom', true)).toBe(false);
  });

  // Blend
  it('blendProfiles interpolates settings', () => {
    stack.createProfile('a', 'A');
    stack.createProfile('b', 'B');
    const a = stack.getProfile('a')!;
    const b = stack.getProfile('b')!;
    a.exposure = 1;
    b.exposure = 3;
    const blended = stack.blendProfiles('a', 'b', 0.5);
    expect(blended).not.toBeNull();
    expect(blended!.exposure).toBeCloseTo(2, 1);
  });

  it('blendProfiles returns null for missing profiles', () => {
    expect(stack.blendProfiles('nope', 'nah', 0.5)).toBeNull();
  });

  // PP_PRESETS
  it('PP_PRESETS has expected keys', () => {
    expect(PP_PRESETS).toHaveProperty('cinematic');
    expect(PP_PRESETS).toHaveProperty('retro');
  });
});
