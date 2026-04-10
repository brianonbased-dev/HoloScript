import { describe, it, expect } from 'vitest';
import { solveKepler, computeOrbitalPoints } from '../kepler';

describe('solveKepler', () => {
  it('returns M when eccentricity is 0 (circular orbit)', () => {
    const M = Math.PI / 4;
    const E = solveKepler(M, 0);
    expect(E).toBeCloseTo(M, 10);
  });

  it('converges for moderate eccentricity (e=0.5)', () => {
    const M = 1.0;
    const e = 0.5;
    const E = solveKepler(M, e);
    // Verify Kepler's equation: M = E - e*sin(E)
    const residual = E - e * Math.sin(E) - M;
    expect(Math.abs(residual)).toBeLessThan(1e-12);
  });

  it('converges for high eccentricity (e=0.9)', () => {
    const M = 2.0;
    const e = 0.9;
    const E = solveKepler(M, e);
    const residual = E - e * Math.sin(E) - M;
    expect(Math.abs(residual)).toBeLessThan(1e-10);
  });

  it('handles M=0 correctly', () => {
    const E = solveKepler(0, 0.5);
    expect(E).toBeCloseTo(0, 10);
  });

  it('handles M=PI correctly', () => {
    const E = solveKepler(Math.PI, 0.3);
    const residual = E - 0.3 * Math.sin(E) - Math.PI;
    expect(Math.abs(residual)).toBeLessThan(1e-12);
  });
});

describe('computeOrbitalPoints', () => {
  it('produces the correct number of points', () => {
    const points = computeOrbitalPoints(1, 0, 0, 0, 0, 50, 60);
    // numPoints + 1 (inclusive of both endpoints)
    expect(points).toHaveLength(61);
  });

  it('generates a circular orbit in the XZ plane when inclination=0', () => {
    const a = 1;
    const scale = 10;
    const points = computeOrbitalPoints(a, 0, 0, 0, 0, scale, 120);

    // All Y values should be ~0 for zero inclination
    for (const [, y] of points) {
      expect(Math.abs(y)).toBeLessThan(1e-10);
    }

    // All points should be at distance ~a*scale from origin (circular)
    for (const [x, , z] of points) {
      const dist = Math.sqrt(x * x + z * z);
      expect(dist).toBeCloseTo(a * scale, 5);
    }
  });

  it('produces an elliptical orbit for nonzero eccentricity', () => {
    const a = 2;
    const e = 0.5;
    const scale = 10;
    const points = computeOrbitalPoints(a, e, 0, 0, 0, scale, 120);

    const distances = points.map(([x, , z]) => Math.sqrt(x * x + z * z));
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);

    // Periapsis = a*(1-e), Apoapsis = a*(1+e)
    expect(minDist).toBeCloseTo(a * (1 - e) * scale, 1);
    expect(maxDist).toBeCloseTo(a * (1 + e) * scale, 1);
  });

  it('tilts the orbit out of the XZ plane for nonzero inclination', () => {
    const points = computeOrbitalPoints(1, 0, 45, 0, 0, 10, 60);
    // With 45 degree inclination, some Y values should be significantly nonzero
    const maxY = Math.max(...points.map(([, y]) => Math.abs(y)));
    expect(maxY).toBeGreaterThan(1);
  });
});
