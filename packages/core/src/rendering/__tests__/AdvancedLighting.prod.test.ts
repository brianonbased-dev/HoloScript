import { describe, it, expect, beforeEach } from 'vitest';
import {
  AdvancedLightingManager,
  parseIESProfile,
  sampleIES,
  rectSolidAngle,
  diskSolidAngle,
  buildCircleCookie,
  sampleCookie,
  type AdvancedLight,
  type LightType,
  type IESProfile,
} from '../AdvancedLighting';

describe('AdvancedLighting — Production Tests', () => {
  // ---------------------------------------------------------------------------
  // IES Profile
  // ---------------------------------------------------------------------------
  describe('parseIESProfile', () => {
    it('parses minimal IES data and finds maxCandela', () => {
      const vertAngles = [0, 45, 90];
      const horizAngles = [0, 90, 180, 270];
      const candela = [
        [100, 80, 50],
        [100, 80, 50],
        [100, 80, 50],
        [100, 80, 50],
      ];
      const profile = parseIESProfile('test_ies', vertAngles, horizAngles, candela);
      expect(profile.id).toBe('test_ies');
      expect(profile.maxCandela).toBe(100);
    });
  });

  describe('sampleIES', () => {
    const vert = [0, 45, 90];
    const horiz = [0, 90, 180];
    const candela = [
      [100, 75, 25],
      [100, 75, 25],
      [100, 75, 25],
    ];
    let profile: IESProfile;
    beforeEach(() => {
      profile = parseIESProfile('test', vert, horiz, candela);
    });

    it('returns 1.0 at peak (vertical=0, max candela)', () => {
      const v = sampleIES(profile, 0, 0);
      expect(v).toBeCloseTo(1, 3);
    });

    it('returns lower value at greater vertical angle', () => {
      const v0 = sampleIES(profile, 0, 0);
      const v90 = sampleIES(profile, 90, 0);
      expect(v0).toBeGreaterThan(v90);
    });

    it('returns value in [0, 1]', () => {
      for (const vt of [0, 22.5, 45, 90]) {
        const v = sampleIES(profile, vt, 45);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.01);
      }
    });

    it('zero candela profile returns 0', () => {
      const emptyProfile = parseIESProfile('empty', [0], [0], [[0]]);
      expect(sampleIES(emptyProfile, 0, 0)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Area Lights
  // ---------------------------------------------------------------------------
  describe('rectSolidAngle', () => {
    it('returns a positive solid angle for a nearby rect light', () => {
      const sa = rectSolidAngle(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 5, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        1,
        1
      );
      expect(sa).toBeGreaterThan(0);
    });

    it('solid angle decreases with distance', () => {
      const sa_close = rectSolidAngle(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        1,
        1
      );
      const sa_far = rectSolidAngle(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 20, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        1,
        1
      );
      expect(sa_close).toBeGreaterThan(sa_far);
    });
  });

  describe('diskSolidAngle', () => {
    it('returns positive solid angle for nearby disk', () => {
      const sa = diskSolidAngle({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 0 }, 1);
      expect(sa).toBeGreaterThan(0);
    });

    it('solid angle decreases with distance', () => {
      const sa_close = diskSolidAngle({ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, 1);
      const sa_far = diskSolidAngle({ x: 0, y: 0, z: 0 }, { x: 0, y: 20, z: 0 }, 1);
      expect(sa_close).toBeGreaterThan(sa_far);
    });

    it('larger radius increases solid angle', () => {
      const sa_small = diskSolidAngle({ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }, 0.5);
      const sa_large = diskSolidAngle({ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }, 3);
      expect(sa_large).toBeGreaterThan(sa_small);
    });
  });

  // ---------------------------------------------------------------------------
  // Light Cookies
  // ---------------------------------------------------------------------------
  describe('buildCircleCookie', () => {
    it('creates correct dimensions', () => {
      const cookie = buildCircleCookie(32, 32);
      expect(cookie.width).toBe(32);
      expect(cookie.height).toBe(32);
      expect(cookie.pixels.length).toBe(32 * 32 * 4);
    });

    it('center pixel is bright (value ≈ 1)', () => {
      const cookie = buildCircleCookie(64, 64);
      const [r] = sampleCookie(cookie, 0.5, 0.5);
      expect(r).toBeGreaterThan(0.9);
    });

    it('corner pixel is dark (outside circle)', () => {
      const cookie = buildCircleCookie(64, 64);
      const [r] = sampleCookie(cookie, 0, 0);
      expect(r).toBeLessThan(0.1);
    });

    it('soft edge transitional pixels are between 0 and 1', () => {
      const cookie = buildCircleCookie(64, 64, 0.1);
      const [r] = sampleCookie(cookie, 0.85, 0.5); // near edge
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    });
  });

  describe('sampleCookie', () => {
    it('clamps UV to valid range', () => {
      const cookie = buildCircleCookie(16, 16);
      expect(() => sampleCookie(cookie, -1, -1)).not.toThrow();
      expect(() => sampleCookie(cookie, 2, 2)).not.toThrow();
    });

    it('returns RGBA tuple', () => {
      const cookie = buildCircleCookie(8, 8);
      const result = sampleCookie(cookie, 0.5, 0.5);
      expect(result.length).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // AdvancedLightingManager
  // ---------------------------------------------------------------------------
  describe('AdvancedLightingManager', () => {
    let mgr: AdvancedLightingManager;
    beforeEach(() => {
      mgr = new AdvancedLightingManager();
    });

    it('starts empty', () => {
      expect(mgr.getLightCount()).toBe(0);
    });

    it('addLight generates a unique ID', () => {
      const l1 = mgr.addLight({ type: 'point' });
      const l2 = mgr.addLight({ type: 'point' });
      expect(l1.id).not.toBe(l2.id);
    });

    it('addLight defaults are sensible', () => {
      const light = mgr.addLight({ type: 'directional' });
      expect(light.enabled).toBe(true);
      expect(light.intensity).toBe(1);
      expect(light.color).toEqual([1, 1, 1]);
    });

    it('removeLight decrements count', () => {
      const l = mgr.addLight({ type: 'spot' });
      mgr.removeLight(l.id);
      expect(mgr.getLightCount()).toBe(0);
    });

    it('getLight returns the correct light', () => {
      const l = mgr.addLight({ type: 'area', intensity: 4 });
      expect(mgr.getLight(l.id)?.intensity).toBe(4);
    });

    it('getLightsByType filters correctly', () => {
      mgr.addLight({ type: 'point' });
      mgr.addLight({ type: 'area' });
      mgr.addLight({ type: 'area' });
      expect(mgr.getLightsByType('area').length).toBe(2);
      expect(mgr.getLightsByType('point').length).toBe(1);
    });

    it('getEnabledCount excludes disabled lights', () => {
      const l1 = mgr.addLight({ type: 'point' });
      const l2 = mgr.addLight({ type: 'point', enabled: false });
      expect(mgr.getEnabledCount()).toBe(1);
    });

    it('setCookie attaches cookie to light', () => {
      const l = mgr.addLight({ type: 'spot' });
      const cookie = buildCircleCookie(16, 16);
      mgr.setCookie(l.id, cookie);
      expect(mgr.getLight(l.id)?.cookie).toBeDefined();
    });

    it('setIES attaches IES profile', () => {
      const l = mgr.addLight({ type: 'ies' });
      const profile = parseIESProfile('test', [0, 90], [0], [[100], [0]]);
      mgr.setIES(l.id, profile);
      expect(mgr.getLight(l.id)?.ies?.id).toBe('test');
    });

    it('getTotalEmissivePower sums enabled emissive mesh lights', () => {
      mgr.addLight({ type: 'emissive_mesh', intensity: 5, color: [1, 1, 1] });
      mgr.addLight({ type: 'emissive_mesh', intensity: 3, color: [1, 1, 1], enabled: false });
      mgr.addLight({ type: 'point', intensity: 100 }); // not emissive
      expect(mgr.getTotalEmissivePower()).toBeCloseTo(5, 3);
    });

    it('clear() removes all lights', () => {
      mgr.addLight({ type: 'point' });
      mgr.addLight({ type: 'spot' });
      mgr.clear();
      expect(mgr.getLightCount()).toBe(0);
    });
  });
});
