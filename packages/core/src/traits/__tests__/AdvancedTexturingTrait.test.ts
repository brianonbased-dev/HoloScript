/**
 * AdvancedTexturingTrait — comprehensive tests
 */
import { describe, it, expect } from 'vitest';
import { AdvancedTexturingTrait, type AdvancedTexturingConfig } from '../AdvancedTexturingTrait';

describe('AdvancedTexturingTrait — metadata', () => {
  it('has name "advanced_texturing"', () => {
    expect(AdvancedTexturingTrait.name).toBe('advanced_texturing');
  });
});

describe('AdvancedTexturingTrait — validate', () => {
  it('accepts standard mode', () => {
    expect(AdvancedTexturingTrait.validate!({ mode: 'standard' })).toBe(true);
  });

  it('accepts displacement mode with displacement config', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'displacement',
      displacement: { heightMap: 'height.png', scale: 0.5, bias: 0 },
    };
    expect(AdvancedTexturingTrait.validate!(config)).toBe(true);
  });

  it('throws for displacement mode without displacement config', () => {
    expect(() => AdvancedTexturingTrait.validate!({ mode: 'displacement' })).toThrow(
      'displacement mode requires displacement config'
    );
  });

  it('throws for pom mode without pom config', () => {
    expect(() => AdvancedTexturingTrait.validate!({ mode: 'pom' })).toThrow(
      'pom mode requires pom config'
    );
  });

  it('accepts pom mode with pom config', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'pom',
      pom: { heightMap: 'h.png', scale: 0.1, steps: 16 },
    };
    expect(AdvancedTexturingTrait.validate!(config)).toBe(true);
  });

  it('throws for triplanar mode without triplanar config', () => {
    expect(() => AdvancedTexturingTrait.validate!({ mode: 'triplanar' })).toThrow(
      'triplanar mode requires triplanar config'
    );
  });

  it('accepts triplanar mode with triplanar config', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'triplanar',
      triplanar: { albedoMapX: 'x.png', albedoMapY: 'y.png', albedoMapZ: 'z.png', scale: 1 },
    };
    expect(AdvancedTexturingTrait.validate!(config)).toBe(true);
  });

  it('throws for detail mode without detail config', () => {
    expect(() => AdvancedTexturingTrait.validate!({ mode: 'detail' })).toThrow(
      'detail mode requires detail config'
    );
  });

  it('accepts detail mode with detail config', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'detail',
      detail: { albedoMap: 'a.png', normalMap: 'n.png', scale: 4, intensity: 0.5 },
    };
    expect(AdvancedTexturingTrait.validate!(config)).toBe(true);
  });

  it('throws for invalid mode', () => {
    expect(() =>
      AdvancedTexturingTrait.validate!({ mode: 'holographic' } as unknown as AdvancedTexturingConfig)
    ).toThrow('Invalid texturing mode');
  });

  it('throws for displacement.scale === 0', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'displacement',
      displacement: { heightMap: 'h.png', scale: 0, bias: 0 },
    };
    expect(() => AdvancedTexturingTrait.validate!(config)).toThrow('displacement.scale must not be 0');
  });

  it('throws for pom.steps < 1', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'pom',
      pom: { heightMap: 'h.png', scale: 0.1, steps: 0 },
    };
    expect(() => AdvancedTexturingTrait.validate!(config)).toThrow('pom.steps must be >= 1');
  });

  it('throws for pom.scale <= 0', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'pom',
      pom: { heightMap: 'h.png', scale: 0, steps: 8 },
    };
    expect(() => AdvancedTexturingTrait.validate!(config)).toThrow('pom.scale must be > 0');
  });

  it('throws for atlas dimensions <= 0', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'standard',
      atlas: { width: 0, height: 512 },
    };
    expect(() => AdvancedTexturingTrait.validate!(config)).toThrow('atlas dimensions must be > 0');
  });

  it('accepts standard mode with valid atlas', () => {
    const config: AdvancedTexturingConfig = {
      mode: 'standard',
      atlas: { width: 1024, height: 1024 },
    };
    expect(AdvancedTexturingTrait.validate!(config)).toBe(true);
  });
});

describe('AdvancedTexturingTrait — compile', () => {
  it('compiles unity target', () => {
    const result = AdvancedTexturingTrait.compile!({ mode: 'standard' }, 'unity');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('compiles unreal target', () => {
    const result = AdvancedTexturingTrait.compile!({ mode: 'standard' }, 'unreal');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('compiles web target', () => {
    const result = AdvancedTexturingTrait.compile!({ mode: 'standard' }, 'web');
    expect(typeof result).toBe('string');
  });

  it('compiles react-three-fiber target', () => {
    const result = AdvancedTexturingTrait.compile!({ mode: 'standard' }, 'react-three-fiber');
    expect(typeof result).toBe('string');
  });

  it('compiles webgpu target', () => {
    const result = AdvancedTexturingTrait.compile!({ mode: 'displacement', displacement: { heightMap: 'h.png', scale: 0.5, bias: 0 } }, 'webgpu');
    expect(typeof result).toBe('string');
  });

  it('compiles generic fallback for unknown target', () => {
    const result = AdvancedTexturingTrait.compile!({ mode: 'standard' }, 'godot');
    expect(typeof result).toBe('string');
  });
});
