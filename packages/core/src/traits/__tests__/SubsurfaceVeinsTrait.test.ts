/**
 * SubsurfaceVeinsTrait — tests
 */
import { describe, it, expect } from 'vitest';
import { SubsurfaceVeinsTrait } from '../SubsurfaceVeinsTrait';

const validConfig = { segmentCount: 1000, pulseBpm: 72 };

describe('SubsurfaceVeinsTrait', () => {
  it('has name "subsurface_veins"', () => {
    expect(SubsurfaceVeinsTrait.name).toBe('subsurface_veins');
  });

  it('validate returns true for valid config', () => {
    expect(SubsurfaceVeinsTrait.validate!(validConfig)).toBe(true);
  });

  it('validate throws for non-positive segmentCount', () => {
    expect(() => SubsurfaceVeinsTrait.validate!({ segmentCount: -1, pulseBpm: 72 })).toThrow();
  });
});
