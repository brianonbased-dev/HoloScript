/**
 * SubsurfaceScatteringTrait — tests
 */
import { describe, it, expect } from 'vitest';
import { SubsurfaceScatteringTrait } from '../SubsurfaceScatteringTrait';

const validConfig = {
  method: 'burley' as const,
  scatterRadius: { r: 1.0, g: 0.2, b: 0.1 },
  intensity: 1.0,
  subsurfaceColor: { r: 0.8, g: 0.5, b: 0.4 },
};

describe('SubsurfaceScatteringTrait', () => {
  it('has name "subsurface_scattering"', () => {
    expect(SubsurfaceScatteringTrait.name).toBe('subsurface_scattering');
  });

  it('validate returns true for valid config', () => {
    expect(SubsurfaceScatteringTrait.validate!(validConfig)).toBe(true);
  });

  it('validate throws for invalid method', () => {
    expect(() => SubsurfaceScatteringTrait.validate!({ ...validConfig, method: 'invalid' as never })).toThrow();
  });
});
