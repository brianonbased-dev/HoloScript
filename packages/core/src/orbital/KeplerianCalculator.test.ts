/**
 * Tests for Keplerian Orbital Calculator
 *
 * Covers:
 * - Angle conversions (degrees/radians, normalization)
 * - Kepler's equation solver (Newton-Raphson)
 * - True anomaly calculation
 * - 3D position calculation from orbital elements
 * - Julian date conversions
 * - Orbital path generation
 */

import { describe, it, expect } from 'vitest';
import {
  toDegrees,
  calculatePosition,
  dateToJulian,
  julianToDate,
  generateOrbitalPath,
  type OrbitalElements,
} from './KeplerianCalculator';

// Earth's approximate orbital elements
const earthElements: OrbitalElements = {
  semiMajorAxis: 1.0, // 1 AU
  eccentricity: 0.0167, // Nearly circular
  inclination: 0.0, // Reference plane
  longitudeAscending: 0.0,
  argumentPeriapsis: 102.9,
  meanAnomalyEpoch: 357.5,
  orbitalPeriod: 365.25, // Days
};

// Mercury's approximate orbital elements
const mercuryElements: OrbitalElements = {
  semiMajorAxis: 0.387,
  eccentricity: 0.205, // More eccentric
  inclination: 7.0,
  longitudeAscending: 48.3,
  argumentPeriapsis: 29.1,
  meanAnomalyEpoch: 174.8,
  orbitalPeriod: 87.97,
};

describe('toDegrees', () => {
  it('converts radians to degrees', () => {
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 5);
    expect(toDegrees(0)).toBeCloseTo(0, 5);
    expect(toDegrees(Math.PI / 2)).toBeCloseTo(90, 5);
    expect(toDegrees(2 * Math.PI)).toBeCloseTo(360, 5);
  });
});

describe('dateToJulian / julianToDate', () => {
  it('converts J2000 epoch correctly', () => {
    const j2000 = new Date('2000-01-01T12:00:00Z');
    const jd = dateToJulian(j2000);
    expect(jd).toBeCloseTo(0, 1); // J2000 epoch = 0
  });

  it('round-trips date conversion', () => {
    const original = new Date('2025-06-15T00:00:00Z');
    const jd = dateToJulian(original);
    const converted = julianToDate(jd);
    expect(converted.getTime()).toBeCloseTo(original.getTime(), -3); // Within seconds
  });

  it('handles dates before J2000', () => {
    const before = new Date('1999-01-01T12:00:00Z');
    const jd = dateToJulian(before);
    expect(jd).toBeLessThan(0);
  });

  it('handles dates after J2000', () => {
    const after = new Date('2026-01-01T12:00:00Z');
    const jd = dateToJulian(after);
    expect(jd).toBeGreaterThan(0);
  });
});

describe('calculatePosition', () => {
  it('returns position with x, y, z coordinates', () => {
    const pos = calculatePosition(earthElements, 0);
    expect(pos).toHaveProperty('x');
    expect(pos).toHaveProperty('y');
    expect(pos).toHaveProperty('z');
  });

  it('calculates Earth near 1 AU from sun', () => {
    const pos = calculatePosition(earthElements, 0);
    const distance = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(distance).toBeCloseTo(1.0, 0); // ~1 AU
  });

  it('calculates Mercury closer than Earth', () => {
    const pos = calculatePosition(mercuryElements, 0);
    const distance = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(distance).toBeLessThan(0.5); // Mercury is ~0.3-0.47 AU
  });

  it('position changes over time', () => {
    const pos1 = calculatePosition(earthElements, 0);
    const pos2 = calculatePosition(earthElements, 90); // 90 days later
    expect(pos1.x).not.toBeCloseTo(pos2.x, 2);
  });

  it('handles circular orbit (e=0)', () => {
    const circular: OrbitalElements = {
      semiMajorAxis: 1.0,
      eccentricity: 0.0,
      inclination: 0.0,
      longitudeAscending: 0.0,
      argumentPeriapsis: 0.0,
      meanAnomalyEpoch: 0.0,
      orbitalPeriod: 365.25,
    };
    const pos = calculatePosition(circular, 0);
    const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(dist).toBeCloseTo(1.0, 3); // Exactly at semi-major axis
  });
});

describe('generateOrbitalPath', () => {
  it('generates requested number of points (+1 for closure)', () => {
    const path = generateOrbitalPath(earthElements, 50);
    expect(path.length).toBe(51); // 50 + closing point
  });

  it('closes the loop', () => {
    const path = generateOrbitalPath(earthElements, 20);
    expect(path[0].x).toBeCloseTo(path[path.length - 1].x, 5);
    expect(path[0].y).toBeCloseTo(path[path.length - 1].y, 5);
  });

  it('generates points at roughly constant distance for circular orbit', () => {
    const circular: OrbitalElements = {
      semiMajorAxis: 2.0,
      eccentricity: 0.0,
      inclination: 0.0,
      longitudeAscending: 0.0,
      argumentPeriapsis: 0.0,
      meanAnomalyEpoch: 0.0,
      orbitalPeriod: 365.25,
    };
    const path = generateOrbitalPath(circular, 10);
    for (let i = 0; i < path.length - 1; i++) {
      const dist = Math.sqrt(path[i].x ** 2 + path[i].y ** 2 + path[i].z ** 2);
      expect(dist).toBeCloseTo(2.0, 3);
    }
  });

  it('uses default 100 points', () => {
    const path = generateOrbitalPath(earthElements);
    expect(path.length).toBe(101);
  });
});
