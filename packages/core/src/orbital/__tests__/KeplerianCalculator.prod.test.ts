/**
 * KeplerianCalculator — Production Test Suite
 *
 * Covers:
 *  - dateToJulian / julianToDate  (round-trip + known epoch value)
 *  - calculatePosition            (Earth, Mars, circular orbit, J2000 epoch)
 *  - generateOrbitalPath          (point count, loop closure, valid coords)
 *
 * Reference values are cross-checked against published ephemeris data (J2000).
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePosition,
  dateToJulian,
  julianToDate,
  generateOrbitalPath,
  toDegrees,
  type OrbitalElements,
} from '../KeplerianCalculator';

// ---------------------------------------------------------------------------
// Well-known orbital elements (J2000 values from JPL Horizons / NASA)
// ---------------------------------------------------------------------------

const EARTH: OrbitalElements = {
  semiMajorAxis: 1.00000011,
  eccentricity: 0.01671022,
  inclination: 0.00005,
  longitudeAscending: -11.26064,
  argumentPeriapsis: 102.94719,
  meanAnomalyEpoch: 100.46435,
  orbitalPeriod: 365.25,
};

const MARS: OrbitalElements = {
  semiMajorAxis: 1.52366231,
  eccentricity: 0.09341233,
  inclination: 1.85061,
  longitudeAscending: 49.57854,
  argumentPeriapsis: 336.04084,
  meanAnomalyEpoch: 355.45332,
  orbitalPeriod: 686.971,
};

/** Perfect circle in the ecliptic plane (easy ground-truth) */
const CIRCULAR: OrbitalElements = {
  semiMajorAxis: 5.0,
  eccentricity: 0,
  inclination: 0,
  longitudeAscending: 0,
  argumentPeriapsis: 0,
  meanAnomalyEpoch: 0,
  orbitalPeriod: 100,
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function distance(p: { x: number; y: number; z: number }): number {
  return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
}

// ---------------------------------------------------------------------------
// dateToJulian / julianToDate
// ---------------------------------------------------------------------------

describe('dateToJulian', () => {
  it('returns 0 for the J2000 epoch (2000-01-01T12:00:00Z)', () => {
    const jd = dateToJulian(new Date('2000-01-01T12:00:00Z'));
    expect(jd).toBeCloseTo(0, 6);
  });

  it('returns 1 for one day after J2000', () => {
    const jd = dateToJulian(new Date('2000-01-02T12:00:00Z'));
    expect(jd).toBeCloseTo(1, 6);
  });

  it('returns negative for dates before J2000', () => {
    const jd = dateToJulian(new Date('1999-12-31T12:00:00Z'));
    expect(jd).toBeCloseTo(-1, 6);
  });

  it('returns ~9131.5 for 2025-01-01', () => {
    // 25 years × 365.25 days/year = 9131.25 days
    const jd = dateToJulian(new Date('2025-01-01T12:00:00Z'));
    expect(jd).toBeGreaterThan(9000);
    expect(jd).toBeLessThan(9200);
  });
});

describe('julianToDate', () => {
  it('round-trip: dateToJulian → julianToDate recovers original date', () => {
    const original = new Date('2023-06-15T00:00:00Z');
    const jd = dateToJulian(original);
    const recovered = julianToDate(jd);
    const diffMs = Math.abs(recovered.getTime() - original.getTime());
    expect(diffMs).toBeLessThan(1000); // within 1 second
  });

  it('returns J2000 epoch for julian=0', () => {
    const d = julianToDate(0);
    expect(d.toISOString()).toBe('2000-01-01T12:00:00.000Z');
  });

  it('returns correct date for julian=365', () => {
    const d = julianToDate(365);
    // 365 days after J2000 epoch (2000-01-01T12:00:00Z).
    // Year 2000 is a leap year (366 days), so day 365 = Dec 30, 2000.
    expect(d.getFullYear()).toBe(2000);
    expect(d.getMonth()).toBe(11); // December (0-indexed)
  });
});

// ---------------------------------------------------------------------------
// calculatePosition
// ---------------------------------------------------------------------------

describe('calculatePosition — Earth', () => {
  it('at J2000 (jd=0) is approximately 1 AU from Sun', () => {
    const pos = calculatePosition(EARTH, 0);
    const r = distance(pos);
    // Earth perihelion ≈ 0.983 AU, aphelion ≈ 1.017 AU
    expect(r).toBeGreaterThan(0.95);
    expect(r).toBeLessThan(1.05);
  });

  it('after one full period returns to same position', () => {
    const p0 = calculatePosition(EARTH, 0);
    const p1 = calculatePosition(EARTH, EARTH.orbitalPeriod);
    expect(p0.x).toBeCloseTo(p1.x, 2);
    expect(p0.y).toBeCloseTo(p1.y, 2);
    expect(p0.z).toBeCloseTo(p1.z, 2);
  });

  it('at half-period the ecliptic x coordinate flips sign roughly', () => {
    const p0 = calculatePosition(EARTH, 0);
    const p_half = calculatePosition(EARTH, EARTH.orbitalPeriod / 2);
    // After half an orbit the body should be on the opposite side
    // The dot product of the two position vectors should be negative
    const dot = p0.x * p_half.x + p0.y * p_half.y + p0.z * p_half.z;
    expect(dot).toBeLessThan(0);
  });

  it('z component is very small for near-zero inclination', () => {
    const pos = calculatePosition(EARTH, 0);
    // Earth inclination ≈ 0.00005° → z should be negligible
    expect(Math.abs(pos.z)).toBeLessThan(0.01);
  });
});

describe('calculatePosition — Mars', () => {
  it('is between 1.38 and 1.67 AU at all sampled times', () => {
    for (let i = 0; i <= 10; i++) {
      const jd = (i / 10) * MARS.orbitalPeriod;
      const pos = calculatePosition(MARS, jd);
      const r = distance(pos);
      // Mars perihelion ≈ 1.381 AU, aphelion ≈ 1.666 AU
      expect(r).toBeGreaterThan(1.35);
      expect(r).toBeLessThan(1.70);
    }
  });

  it('after one full period returns to within 0.01 AU', () => {
    const p0 = calculatePosition(MARS, 0);
    const p1 = calculatePosition(MARS, MARS.orbitalPeriod);
    const drift = distance({ x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z });
    expect(drift).toBeLessThan(0.01);
  });
});

describe('calculatePosition — perfect circle', () => {
  it('distance from origin is always exactly 5 AU', () => {
    for (let i = 0; i < 20; i++) {
      const jd = (i / 20) * CIRCULAR.orbitalPeriod;
      const pos = calculatePosition(CIRCULAR, jd);
      expect(distance(pos)).toBeCloseTo(5, 4);
    }
  });

  it('z component is zero (zero inclination / no tilt)', () => {
    for (let i = 0; i < 10; i++) {
      const jd = (i / 10) * CIRCULAR.orbitalPeriod;
      const pos = calculatePosition(CIRCULAR, jd);
      expect(Math.abs(pos.z)).toBeLessThan(1e-10);
    }
  });

  it('traces a circle (x² + y² ≈ r² at all times)', () => {
    for (let i = 0; i < 36; i++) {
      const jd = (i / 36) * CIRCULAR.orbitalPeriod;
      const pos = calculatePosition(CIRCULAR, jd);
      const r2 = pos.x * pos.x + pos.y * pos.y;
      expect(Math.abs(Math.sqrt(r2) - 5)).toBeLessThan(1e-4);
    }
  });
});

// ---------------------------------------------------------------------------
// generateOrbitalPath
// ---------------------------------------------------------------------------

describe('generateOrbitalPath', () => {
  it('returns numPoints + 1 points (closing point appended)', () => {
    const path = generateOrbitalPath(EARTH, 100);
    expect(path.length).toBe(101); // 100 + closing point
  });

  it('default numPoints is 100 → 101 total', () => {
    const path = generateOrbitalPath(EARTH);
    expect(path.length).toBe(101);
  });

  it('first and last points are identical (loop closed)', () => {
    const path = generateOrbitalPath(EARTH, 50);
    expect(path[0].x).toBe(path[path.length - 1].x);
    expect(path[0].y).toBe(path[path.length - 1].y);
    expect(path[0].z).toBe(path[path.length - 1].z);
  });

  it('all points have finite coordinates', () => {
    const path = generateOrbitalPath(MARS, 72);
    for (const p of path) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });

  it('all points are within expected radial bounds for Earth', () => {
    const path = generateOrbitalPath(EARTH, 200);
    for (const p of path) {
      const r = distance(p);
      expect(r).toBeGreaterThan(0.9);
      expect(r).toBeLessThan(1.1);
    }
  });

  it('works with a custom numPoints value of 1', () => {
    const path = generateOrbitalPath(CIRCULAR, 1);
    expect(path.length).toBe(2); // 1 point + closing
  });

  it('circular orbit path has constant radius', () => {
    const path = generateOrbitalPath(CIRCULAR, 360);
    const radii = path.map(distance);
    const minR = Math.min(...radii);
    const maxR = Math.max(...radii);
    expect(maxR - minR).toBeLessThan(1e-4);
  });
});

// ---------------------------------------------------------------------------
// toDegrees utility
// ---------------------------------------------------------------------------

describe('toDegrees', () => {
  it('converts π to 180', () => {
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 10);
  });

  it('converts 0 to 0', () => {
    expect(toDegrees(0)).toBe(0);
  });

  it('converts 2π to 360', () => {
    expect(toDegrees(2 * Math.PI)).toBeCloseTo(360, 10);
  });

  it('converts π/2 to 90', () => {
    expect(toDegrees(Math.PI / 2)).toBeCloseTo(90, 10);
  });
});
