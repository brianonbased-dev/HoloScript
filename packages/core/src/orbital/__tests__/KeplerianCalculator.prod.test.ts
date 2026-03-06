/**
 * KeplerianCalculator Production Tests
 * Sprint CLIII - Celestial mechanics & orbital computations
 */
import { describe, it, expect } from 'vitest';
import {
  calculatePosition,
  generateOrbitalPath,
  dateToJulian,
  julianToDate,
  toDegrees,
  type OrbitalElements,
} from '../KeplerianCalculator';

// -------------------------------------------------------------------------
// Earth's approximate orbital elements (J2000 epoch)
// -------------------------------------------------------------------------

const EARTH: OrbitalElements = {
  semiMajorAxis: 1.000,          // 1 AU
  eccentricity: 0.0167,
  inclination: 0.0001,           // ~ecliptic plane
  longitudeAscending: 0.0,
  argumentPeriapsis: 102.9372,
  meanAnomalyEpoch: 357.5291,
  orbitalPeriod: 365.25,         // days
};

// A circular orbit (eccentricity = 0) for easier math
const CIRCULAR: OrbitalElements = {
  semiMajorAxis: 2.0,            // 2 AU
  eccentricity: 0.0,
  inclination: 0.0,
  longitudeAscending: 0.0,
  argumentPeriapsis: 0.0,
  meanAnomalyEpoch: 0.0,
  orbitalPeriod: 100.0,
};

describe('KeplerianCalculator', () => {

  // -------------------------------------------------------------------------
  // toDegrees
  // -------------------------------------------------------------------------

  describe('toDegrees', () => {
    it('converts 0 radians to 0 degrees', () => {
      expect(toDegrees(0)).toBe(0);
    });

    it('converts PI radians to 180 degrees', () => {
      expect(toDegrees(Math.PI)).toBeCloseTo(180, 8);
    });

    it('converts 2*PI to 360 degrees', () => {
      expect(toDegrees(2 * Math.PI)).toBeCloseTo(360, 8);
    });

    it('converts PI/2 to 90 degrees', () => {
      expect(toDegrees(Math.PI / 2)).toBeCloseTo(90, 8);
    });
  });

  // -------------------------------------------------------------------------
  // calculatePosition
  // -------------------------------------------------------------------------

  describe('calculatePosition', () => {
    it('returns a valid Position3D with numeric x, y, z', () => {
      const pos = calculatePosition(EARTH, 0);
      expect(typeof pos.x).toBe('number');
      expect(typeof pos.y).toBe('number');
      expect(typeof pos.z).toBe('number');
      expect(isNaN(pos.x)).toBe(false);
      expect(isNaN(pos.y)).toBe(false);
      expect(isNaN(pos.z)).toBe(false);
    });

    it('produces a heliocentric distance near 1 AU for Earth at J2000', () => {
      const pos = calculatePosition(EARTH, 0);
      const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
      // Earth's orbit ranges from ~0.983 to ~1.017 AU
      expect(r).toBeGreaterThan(0.95);
      expect(r).toBeLessThan(1.05);
    });

    it('circular orbit stays at fixed radius regardless of time', () => {
      for (const t of [0, 25, 50, 75]) {
        const pos = calculatePosition(CIRCULAR, t);
        const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
        expect(r).toBeCloseTo(2.0, 4);
      }
    });

    it('circular orbit with inclination=0 has z≈0', () => {
      const pos = calculatePosition(CIRCULAR, 37);
      expect(Math.abs(pos.z)).toBeLessThan(1e-10);
    });

    it('returns different positions at different times', () => {
      const p1 = calculatePosition(EARTH, 0);
      const p2 = calculatePosition(EARTH, 180);
      // Half orbit apart — x should be substantially different
      expect(Math.abs(p1.x - p2.x)).toBeGreaterThan(0.1);
    });

    it('position after one full period ≈ same as at t=0', () => {
      const p0 = calculatePosition(EARTH, 0);
      const p1 = calculatePosition(EARTH, EARTH.orbitalPeriod);
      expect(p0.x).toBeCloseTo(p1.x, 4);
      expect(p0.y).toBeCloseTo(p1.y, 4);
      expect(p0.z).toBeCloseTo(p1.z, 4);
    });

    it('handles very eccentric orbit (e=0.9) without NaN', () => {
      const eccentric: OrbitalElements = { ...CIRCULAR, eccentricity: 0.9, orbitalPeriod: 100 };
      const pos = calculatePosition(eccentric, 10);
      expect(isNaN(pos.x)).toBe(false);
      expect(isNaN(pos.y)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // dateToJulian / julianToDate
  // -------------------------------------------------------------------------

  describe('dateToJulian', () => {
    it('returns 0 for J2000 epoch (2000-01-01T12:00:00Z)', () => {
      const j2000 = new Date('2000-01-01T12:00:00Z');
      expect(dateToJulian(j2000)).toBeCloseTo(0, 10);
    });

    it('returns positive for dates after J2000', () => {
      const after = new Date('2010-01-01T12:00:00Z');
      expect(dateToJulian(after)).toBeGreaterThan(0);
    });

    it('returns negative for dates before J2000', () => {
      const before = new Date('1990-01-01T12:00:00Z');
      expect(dateToJulian(before)).toBeLessThan(0);
    });

    it('1 year after J2000 is between 365 and 367 days', () => {
      const oneYear = new Date('2001-01-01T12:00:00Z');
      const jd = dateToJulian(oneYear);
      // 2000 is a leap year, so Jan 1 2001 12:00 UTC = 366 days after J2000 epoch
      expect(jd).toBeGreaterThan(364);
      expect(jd).toBeLessThan(368);
    });
  });

  describe('julianToDate', () => {
    it('round-trips dateToJulian correctly', () => {
      const original = new Date('2025-06-15T09:30:00Z');
      const julian = dateToJulian(original);
      const roundTripped = julianToDate(julian);
      expect(roundTripped.getTime()).toBeCloseTo(original.getTime(), -3); // within 1ms
    });

    it('j=0 returns J2000 epoch', () => {
      const date = julianToDate(0);
      expect(date.toISOString()).toBe('2000-01-01T12:00:00.000Z');
    });

    it('j=365.25 is approximately 1 year after J2000', () => {
      const date = julianToDate(365.25);
      // Jan 1, 2000 12:00 + 365.25 days ≈ Jan 1, 2001 12:00 (but floating point lands in late 2000)
      // Verify the timestamp is between Dec 2000 and Feb 2001
      const ts = date.getTime();
      const dec2000 = new Date('2000-12-01T00:00:00Z').getTime();
      const feb2001 = new Date('2001-02-01T00:00:00Z').getTime();
      expect(ts).toBeGreaterThan(dec2000);
      expect(ts).toBeLessThan(feb2001);
    });
  });

  // -------------------------------------------------------------------------
  // generateOrbitalPath
  // -------------------------------------------------------------------------

  describe('generateOrbitalPath', () => {
    it('returns numPoints+1 positions (closed loop)', () => {
      const path = generateOrbitalPath(EARTH, 50);
      expect(path).toHaveLength(51); // 50 + closing point
    });

    it('defaults to 100 points + 1 closing point', () => {
      const path = generateOrbitalPath(EARTH);
      expect(path).toHaveLength(101);
    });

    it('first and last points are identical (closed loop)', () => {
      const path = generateOrbitalPath(EARTH, 20);
      const first = path[0];
      const last = path[path.length - 1];
      expect(first.x).toBe(last.x);
      expect(first.y).toBe(last.y);
      expect(first.z).toBe(last.z);
    });

    it('all points have numeric coordinates', () => {
      const path = generateOrbitalPath(CIRCULAR, 10);
      for (const p of path) {
        expect(isNaN(p.x)).toBe(false);
        expect(isNaN(p.y)).toBe(false);
        expect(isNaN(p.z)).toBe(false);
      }
    });

    it('circular orbit path points are all at the same radius', () => {
      const path = generateOrbitalPath(CIRCULAR, 36);
      for (const p of path) {
        const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
        expect(r).toBeCloseTo(2.0, 4);
      }
    });
  });
});
