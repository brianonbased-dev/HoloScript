/**
 * AdvancedLightingTrait — comprehensive tests
 */
import { describe, it, expect } from 'vitest';
import {
  AdvancedLightingTrait,
  type AdvancedLightingConfig,
  type AreaRectLightConfig,
  type AreaDiskLightConfig,
  type IESLightConfig,
} from '../AdvancedLightingTrait';

function makeRectConfig(overrides: Partial<AreaRectLightConfig> = {}): AreaRectLightConfig {
  return { width: 2, height: 1, intensity: 500, color: [1, 1, 1], ...overrides };
}

function makeDiskConfig(overrides: Partial<AreaDiskLightConfig> = {}): AreaDiskLightConfig {
  return { radius: 1, intensity: 300, color: [1, 0.9, 0.8], ...overrides };
}

function makeIESConfig(overrides: Partial<IESLightConfig> = {}): IESLightConfig {
  return { profilePath: 'lights/office.ies', intensity: 1000, color: [1, 1, 1], ...overrides };
}

describe('AdvancedLightingTrait — metadata', () => {
  it('has name "advanced_lighting"', () => {
    expect(AdvancedLightingTrait.name).toBe('advanced_lighting');
  });
});

describe('AdvancedLightingTrait — validate', () => {
  it('accepts valid area_rect config', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    expect(AdvancedLightingTrait.validate!(config)).toBe(true);
  });

  it('accepts valid area_disk config', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_disk', config: makeDiskConfig() }],
    };
    expect(AdvancedLightingTrait.validate!(config)).toBe(true);
  });

  it('accepts valid ies config', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'ies', config: makeIESConfig() }],
    };
    expect(AdvancedLightingTrait.validate!(config)).toBe(true);
  });

  it('accepts multiple lights of different types', () => {
    const config: AdvancedLightingConfig = {
      lights: [
        { type: 'area_rect', config: makeRectConfig() },
        { type: 'area_disk', config: makeDiskConfig() },
        { type: 'ies', config: makeIESConfig() },
      ],
    };
    expect(AdvancedLightingTrait.validate!(config)).toBe(true);
  });

  it('throws when lights array is empty', () => {
    const config: AdvancedLightingConfig = { lights: [] };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('at least one light entry');
  });

  it('throws when lights is not an array', () => {
    const config = { lights: null } as unknown as AdvancedLightingConfig;
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow();
  });

  it('throws for unknown light type', () => {
    const config = {
      lights: [{ type: 'laser_beam', config: {} }],
    } as unknown as AdvancedLightingConfig;
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('Unknown light type');
  });

  it('throws area_rect with width <= 0', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig({ width: 0 }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('width and height must be > 0');
  });

  it('throws area_rect with height <= 0', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig({ height: -1 }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('width and height must be > 0');
  });

  it('throws area_rect with negative intensity', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig({ intensity: -1 }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('intensity must be >= 0');
  });

  it('throws area_disk with radius <= 0', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_disk', config: makeDiskConfig({ radius: 0 }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('radius must be > 0');
  });

  it('throws ies without profilePath', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'ies', config: makeIESConfig({ profilePath: '' }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('profilePath is required');
  });
});

describe('AdvancedLightingTrait — compile (unity)', () => {
  it('generates Unity HDRP code for area_rect light', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'unity');
    expect(result).toContain('LightType.Rectangle');
    expect(result).toContain('AdvancedLightingSetup');
  });

  it('includes area_disk in Unity output', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_disk', config: makeDiskConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'unity');
    expect(result).toContain('LightType.Disc');
  });

  it('includes IES light in Unity output', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'ies', config: makeIESConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'unity');
    expect(result).toContain('office.ies');
  });
});

describe('AdvancedLightingTrait — compile (unreal)', () => {
  it('generates Unreal code for area_rect light', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'unreal');
    expect(result).toContain('ARectLight');
  });
});

describe('AdvancedLightingTrait — compile (web)', () => {
  it('generates web code', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'web');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('react-three-fiber target produces output', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'react-three-fiber');
    expect(typeof result).toBe('string');
  });
});

describe('AdvancedLightingTrait — compile (generic fallback)', () => {
  it('unknown target returns generic output', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'godot');
    expect(typeof result).toBe('string');
  });
});
