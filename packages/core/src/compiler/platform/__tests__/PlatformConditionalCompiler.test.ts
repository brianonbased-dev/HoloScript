import { describe, it, expect } from 'vitest';
import {
  PlatformConditionalCompiler,
  createPlatformConditionalCompiler,
  type PlatformBlock,
} from '../PlatformConditionalCompiler';

function block(platforms: string[], content: Record<string, unknown>, negated = false): PlatformBlock {
  return { platforms: platforms as any, content, negated };
}

describe('PlatformConditionalCompiler', () => {
  // ===== PARSING =====
  it('parses @platform(vr) annotation', () => {
    const result = PlatformConditionalCompiler.parseAnnotation('@platform(vr)');
    expect(result.platforms).toEqual(['vr']);
    expect(result.negated).toBe(false);
  });

  it('parses @platform(!automotive) negation', () => {
    const result = PlatformConditionalCompiler.parseAnnotation('@platform(!automotive)');
    expect(result.platforms).toEqual(['automotive']);
    expect(result.negated).toBe(true);
  });

  it('parses @platform(quest3, pcvr) multi-target', () => {
    const result = PlatformConditionalCompiler.parseAnnotation('@platform(quest3, pcvr)');
    expect(result.platforms).toEqual(['quest3', 'pcvr']);
    expect(result.negated).toBe(false);
  });

  it('throws on invalid annotation', () => {
    expect(() => PlatformConditionalCompiler.parseAnnotation('badformat')).toThrow();
  });

  // ===== RESOLUTION =====
  it('resolves VR category block for quest3 target', () => {
    const compiler = createPlatformConditionalCompiler('quest3');
    const result = compiler.resolve([block(['vr'], { handTracking: true })]);
    expect(result.resolvedTraits).toEqual({ handTracking: true });
    expect(result.stats.included).toBe(1);
  });

  it('resolves specific quest3 block for quest3 target', () => {
    const compiler = createPlatformConditionalCompiler('quest3');
    const result = compiler.resolve([block(['quest3'], { passthrough: true })]);
    expect(result.resolvedTraits).toEqual({ passthrough: true });
  });

  it('eliminates VR block for ios target', () => {
    const compiler = createPlatformConditionalCompiler('ios');
    const result = compiler.resolve([block(['vr'], { handTracking: true })]);
    expect(result.resolvedTraits).toEqual({});
    expect(result.stats.eliminated).toBe(1);
  });

  it('negation: !automotive includes for vr target', () => {
    const compiler = createPlatformConditionalCompiler('quest3');
    const result = compiler.resolve([block(['automotive'], { safetyMode: true }, true)]);
    expect(result.resolvedTraits).toEqual({ safetyMode: true });
  });

  it('negation: !automotive excludes for android-auto target', () => {
    const compiler = createPlatformConditionalCompiler('android-auto');
    const result = compiler.resolve([block(['automotive'], { safetyMode: true }, true)]);
    expect(result.resolvedTraits).toEqual({});
    expect(result.stats.eliminated).toBe(1);
  });

  it('wildcard @platform(*) matches all targets', () => {
    const compiler = createPlatformConditionalCompiler('watchos');
    const result = compiler.resolve([block(['*'], { baseColor: '#fff' })]);
    expect(result.resolvedTraits).toEqual({ baseColor: '#fff' });
  });

  it('multi-target @platform(vr, ar) matches both categories', () => {
    const vrCompiler = createPlatformConditionalCompiler('quest3');
    const arCompiler = createPlatformConditionalCompiler('webxr');
    const mobileCompiler = createPlatformConditionalCompiler('ios');

    const blocks = [block(['vr', 'ar'], { spatialAudio: true })];
    expect(vrCompiler.resolve(blocks).stats.included).toBe(1);
    expect(arCompiler.resolve(blocks).stats.included).toBe(1);
    expect(mobileCompiler.resolve(blocks).stats.eliminated).toBe(1);
  });

  it('reports dead code elimination stats', () => {
    const compiler = createPlatformConditionalCompiler('ios');
    const result = compiler.resolve([
      block(['vr'], { a: 1 }),
      block(['ar'], { b: 2 }),
      block(['mobile'], { c: 3 }),
      block(['desktop'], { d: 4 }),
    ]);
    expect(result.stats.totalBlocks).toBe(4);
    expect(result.stats.included).toBe(1);
    expect(result.stats.eliminated).toBe(3);
    expect(result.stats.deadCodeRatio).toBe(0.75);
  });

  it('warns when no blocks match', () => {
    const compiler = createPlatformConditionalCompiler('watchos');
    const result = compiler.resolve([block(['vr'], { a: 1 }), block(['ar'], { b: 2 })]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('watchos');
  });

  it('preserves base traits when blocks merge', () => {
    const compiler = createPlatformConditionalCompiler('quest3');
    const result = compiler.resolve(
      [block(['vr'], { newProp: true })],
      { existing: 'value' },
    );
    expect(result.resolvedTraits).toEqual({ existing: 'value', newProp: true });
  });

  it('later blocks override earlier blocks (cascade)', () => {
    const compiler = createPlatformConditionalCompiler('quest3');
    const result = compiler.resolve([
      block(['vr'], { quality: 'low' }),
      block(['quest3'], { quality: 'high' }),
    ]);
    expect(result.resolvedTraits).toEqual({ quality: 'high' });
    expect(result.stats.included).toBe(2);
  });

  // ===== VALIDATION =====
  it('validates unknown platform name → error', () => {
    const errors = PlatformConditionalCompiler.validatePlatforms([
      block(['vr'], {}),
      block(['fake-platform'], {}),
    ]);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('fake-platform');
  });

  it('validates all valid platforms → no errors', () => {
    const errors = PlatformConditionalCompiler.validatePlatforms([
      block(['vr', 'ar', 'mobile', 'desktop', 'automotive', 'wearable', '*'], {}),
      block(['quest3', 'ios', 'android-auto', 'watchos'], {}),
    ]);
    expect(errors.length).toBe(0);
  });

  // ===== ACCESSORS =====
  it('getTarget and getCategory return correct values', () => {
    const compiler = createPlatformConditionalCompiler('quest3');
    expect(compiler.getTarget()).toBe('quest3');
    expect(compiler.getCategory()).toBe('vr');
  });
});
