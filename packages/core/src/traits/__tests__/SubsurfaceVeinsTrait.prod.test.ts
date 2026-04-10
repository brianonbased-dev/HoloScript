import { describe, it, expect } from 'vitest';
import { SubsurfaceVeinsTrait } from '../SubsurfaceVeinsTrait';
import type { SubsurfaceVeinsConfig } from '../SubsurfaceVeinsTrait';

const base: SubsurfaceVeinsConfig = {
  segmentCount: 50_000,
  pulseBpm: 66,
};

describe('SubsurfaceVeinsTrait — Production Tests', () => {
  describe('validate()', () => {
    it('accepts valid base config', () => {
      expect(SubsurfaceVeinsTrait.validate(base)).toBe(true);
    });

    it('throws when segmentCount <= 0', () => {
      expect(() => SubsurfaceVeinsTrait.validate({ ...base, segmentCount: 0 })).toThrow('segmentCount');
    });

    it('throws when segmentCount is unbounded', () => {
      expect(() => SubsurfaceVeinsTrait.validate({ ...base, segmentCount: 900_000 })).toThrow('cap');
    });

    it('throws when pulseBpm <= 0', () => {
      expect(() => SubsurfaceVeinsTrait.validate({ ...base, pulseBpm: 0 })).toThrow('pulseBpm');
    });

    it('throws on invalid color channels', () => {
      expect(() =>
        SubsurfaceVeinsTrait.validate({
          ...base,
          color: { r: 1.2, g: 0.1, b: 0.1 },
        })
      ).toThrow('color channels');
    });
  });

  describe('compile()', () => {
    it('emits web payload with pulseBpm and pulseHz', () => {
      const out = SubsurfaceVeinsTrait.compile(base, 'web');
      expect(out).toContain('pulseBpm: 66');
      expect(out).toContain('pulseHz');
      expect(out).toContain('segmentCount: 50000');
    });

    it('emits unity pulse shader hint', () => {
      const out = SubsurfaceVeinsTrait.compile(base, 'unity');
      expect(out).toContain('pulseBpm = 66f');
      expect(out).toContain('sin(_Time.y');
    });

    it('emits unreal pulse expression', () => {
      const out = SubsurfaceVeinsTrait.compile(base, 'unreal');
      expect(out).toContain('PulseBPM = 66.0');
      expect(out).toContain('sin(Time');
    });

    it('falls back to generic output for unknown target', () => {
      const out = SubsurfaceVeinsTrait.compile(base, 'custom-target');
      expect(out).toContain('Subsurface Veins config');
      expect(out).toContain('"segmentCount": 50000');
    });
  });
});
