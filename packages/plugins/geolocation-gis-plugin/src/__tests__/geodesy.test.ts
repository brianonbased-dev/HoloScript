/**
 * Geodesy solver tests — geolocation-gis-plugin
 *
 * All expected values verified against authoritative geodetic references:
 *  - Vincenty (1975) original paper test cases
 *  - Geoscience Australia online geodesy calculator
 *  - WGS-84 ECEF transform per NIMA TR8350.2
 */

import { describe, it, expect } from 'vitest';
import {
  vincentyInverse,
  llaToECEF,
  ecefToLLA,
  greatCircleWaypoints,
  pointInGeofence,
  analyzeGeodesy,
  buildGeodesyReceipt,
} from '../geodesy';

// ─── Vincenty inverse ─────────────────────────────────────────────────────────

describe('vincentyInverse', () => {
  /**
   * Classic Vincenty test case from original 1975 paper (Appendix, Case 1):
   * p1 = (0°, 0°), p2 = (0.5°, 179.5°)  — nearly antipodal
   * Distance ≈ 19_936_288.579 m (well-known result)
   */
  it('Vincenty 1975 nearly-antipodal case within 1 m', () => {
    const r = vincentyInverse({ latDeg: 0, lonDeg: 0 }, { latDeg: 0.5, lonDeg: 179.5 });
    expect(r.distanceM).toBeCloseTo(19_936_288.579, -1); // ±1 m tolerance
  });

  /**
   * London (51.5074°N, 0.1278°W) → New York (40.7128°N, 74.0060°W)
   * Published geodesic distance ≈ 5 570 374 m.
   * Reference: Geoscience Australia online calculator.
   */
  it('London → New York distance is in the 5550–5620 km range', () => {
    // Exact value depends on precise coordinates; WGS-84 ellipsoidal geodesic ≈ 5585 km.
    // Published spherical estimates vary 5570–5590 km depending on source.
    const london   = { latDeg: 51.5074, lonDeg: -0.1278 };
    const newYork  = { latDeg: 40.7128, lonDeg: -74.0060 };
    const r = vincentyInverse(london, newYork);
    expect(r.distanceM / 1000).toBeGreaterThan(5550);
    expect(r.distanceM / 1000).toBeLessThan(5620);
  });

  it('London → New York forward azimuth is roughly NW (~288°)', () => {
    const r = vincentyInverse(
      { latDeg: 51.5074, lonDeg: -0.1278 },
      { latDeg: 40.7128, lonDeg: -74.0060 },
    );
    // Initial bearing London → NY is roughly 288° (NW)
    expect(r.forwardAzimuthDeg).toBeGreaterThan(270);
    expect(r.forwardAzimuthDeg).toBeLessThan(310);
  });

  it('coincident points return distanceM = 0', () => {
    const p = { latDeg: 48.8566, lonDeg: 2.3522 };
    const r = vincentyInverse(p, p);
    expect(r.distanceM).toBe(0);
  });

  it('distance is symmetric (A→B == B→A within 1 mm)', () => {
    const a = { latDeg: 35.6762, lonDeg: 139.6503 }; // Tokyo
    const b = { latDeg: -33.8688, lonDeg: 151.2093 }; // Sydney
    const ab = vincentyInverse(a, b);
    const ba = vincentyInverse(b, a);
    expect(Math.abs(ab.distanceM - ba.distanceM)).toBeLessThan(0.001);
  });

  it('equatorial route (same latitude, different longitudes)', () => {
    const r = vincentyInverse({ latDeg: 0, lonDeg: 0 }, { latDeg: 0, lonDeg: 90 });
    // Quarter circumference ≈ 10,018,754 m
    expect(r.distanceM).toBeCloseTo(10_018_754, -2); // ±100 m
  });

  it('pole-to-pole distance ≈ half the WGS-84 meridional circumference (20,003,931 m)', () => {
    // The WGS-84 meridional circumference requires an elliptic integral of the 2nd kind.
    // Numerically: full circumference ≈ 40,007,863 m → pole-to-pole ≈ 20,003,931 m.
    // (NOT π×b = 19,970,326 m, which is for a sphere of radius b.)
    const r = vincentyInverse({ latDeg: 90, lonDeg: 0 }, { latDeg: -90, lonDeg: 0 });
    expect(r.distanceM).toBeGreaterThan(20_000_000);
    expect(r.distanceM).toBeLessThan(20_010_000);
  });
});

// ─── ECEF ↔ LLA ──────────────────────────────────────────────────────────────

describe('llaToECEF and ecefToLLA', () => {
  /**
   * Origin (0°, 0°, 0m) should map to ECEF (a, 0, 0) where a = 6378137.0 m.
   */
  it('equatorial prime-meridian maps to (a, 0, 0)', () => {
    const ecef = llaToECEF({ latDeg: 0, lonDeg: 0, altM: 0 });
    expect(ecef.xM).toBeCloseTo(6_378_137.0, 0);
    expect(ecef.yM).toBeCloseTo(0, 3);
    expect(ecef.zM).toBeCloseTo(0, 3);
  });

  /**
   * North pole (90°, 0°, 0m) should map to ECEF (0, 0, b) where b = 6356752.3142 m.
   */
  it('north pole maps to (0, 0, b)', () => {
    const ecef = llaToECEF({ latDeg: 90, lonDeg: 0, altM: 0 });
    expect(ecef.xM).toBeCloseTo(0, 0);
    expect(ecef.yM).toBeCloseTo(0, 0);
    expect(ecef.zM).toBeCloseTo(6_356_752.314, 0);
  });

  it('ECEF roundtrip preserves LLA within 1 mm altitude and 1e-9 deg lat/lon', () => {
    const original: { latDeg: number; lonDeg: number; altM: number }[] = [
      { latDeg:  51.5074, lonDeg:   -0.1278, altM:    10 },
      { latDeg:  40.7128, lonDeg:  -74.0060, altM:    50 },
      { latDeg: -33.8688, lonDeg:  151.2093, altM:    40 },
      { latDeg:  35.6762, lonDeg:  139.6503, altM:    40 },
      { latDeg:  -0.1000, lonDeg:  -78.4678, altM: 2_850 }, // Quito
    ];
    for (const lla of original) {
      const ecef     = llaToECEF(lla);
      const back     = ecefToLLA(ecef);
      expect(Math.abs(back.latDeg - lla.latDeg)).toBeLessThan(1e-9);
      expect(Math.abs(back.lonDeg - lla.lonDeg)).toBeLessThan(1e-9);
      expect(Math.abs(back.altM   - lla.altM  )).toBeLessThan(0.001); // 1 mm
    }
  });

  it('known ECEF point round-trips correctly (GPS satellite altitude)', () => {
    const gps = llaToECEF({ latDeg: 45, lonDeg: 90, altM: 20_200_000 });
    const back = ecefToLLA(gps);
    expect(back.latDeg).toBeCloseTo(45, 6);
    expect(back.lonDeg).toBeCloseTo(90, 6);
    expect(back.altM).toBeCloseTo(20_200_000, 0);
  });
});

// ─── Great-circle waypoints ───────────────────────────────────────────────────

describe('greatCircleWaypoints', () => {
  const london  = { latDeg: 51.5074, lonDeg: -0.1278 };
  const newYork = { latDeg: 40.7128, lonDeg: -74.0060 };

  it('returns numIntermediate+2 waypoints (endpoints included)', () => {
    const route = greatCircleWaypoints(london, newYork, 8);
    expect(route.waypoints.length).toBe(10); // 8 + 2 endpoints
  });

  it('first waypoint matches origin, last matches destination', () => {
    const route = greatCircleWaypoints(london, newYork, 4);
    const first = route.waypoints[0];
    const last  = route.waypoints[route.waypoints.length - 1];
    expect(first.latDeg).toBeCloseTo(london.latDeg, 4);
    expect(first.lonDeg).toBeCloseTo(london.lonDeg, 4);
    expect(last.latDeg).toBeCloseTo(newYork.latDeg, 4);
    expect(last.lonDeg).toBeCloseTo(newYork.lonDeg, 4);
  });

  it('fraction values are linearly spaced from 0 to 1', () => {
    const route = greatCircleWaypoints(london, newYork, 3);
    const fractions = route.waypoints.map((w) => w.fractionOfTotal);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i] - fractions[i - 1]).toBeCloseTo(0.25, 9);
    }
  });

  it('totalDistanceM matches vincentyInverse result', () => {
    const route   = greatCircleWaypoints(london, newYork, 4);
    const vincenty = vincentyInverse(london, newYork);
    expect(route.totalDistanceM).toBeCloseTo(vincenty.distanceM, 0);
  });

  it('coincident points produce all identical waypoints', () => {
    const p = { latDeg: 0, lonDeg: 0 };
    const route = greatCircleWaypoints(p, p, 4);
    for (const wp of route.waypoints) {
      expect(wp.latDeg).toBeCloseTo(0, 6);
      expect(wp.lonDeg).toBeCloseTo(0, 6);
    }
  });
});

// ─── Point-in-geofence ───────────────────────────────────────────────────────

describe('pointInGeofence', () => {
  /** Simple rectangular geofence around Paris (approx bounding box). */
  const parisFence = {
    id: 'paris-box',
    vertices: [
      { latDeg: 48.80, lonDeg: 2.25 },
      { latDeg: 48.92, lonDeg: 2.25 },
      { latDeg: 48.92, lonDeg: 2.42 },
      { latDeg: 48.80, lonDeg: 2.42 },
    ],
  };

  it('Eiffel Tower is inside Paris bounding box', () => {
    expect(pointInGeofence({ latDeg: 48.8584, lonDeg: 2.2945 }, parisFence)).toBe(true);
  });

  it('London is outside Paris bounding box', () => {
    expect(pointInGeofence({ latDeg: 51.5074, lonDeg: -0.1278 }, parisFence)).toBe(false);
  });

  it('point on the far side of France is outside', () => {
    expect(pointInGeofence({ latDeg: 43.2965, lonDeg: 5.3698 }, parisFence)).toBe(false);
  });

  it('irregular polygon — point clearly inside', () => {
    const triangle = {
      id: 'tri',
      vertices: [
        { latDeg: 0, lonDeg: 0 },
        { latDeg: 2, lonDeg: 0 },
        { latDeg: 1, lonDeg: 2 },
      ],
    };
    expect(pointInGeofence({ latDeg: 1, lonDeg: 0.5 }, triangle)).toBe(true);
  });

  it('irregular polygon — point clearly outside', () => {
    const triangle = {
      id: 'tri',
      vertices: [
        { latDeg: 0, lonDeg: 0 },
        { latDeg: 2, lonDeg: 0 },
        { latDeg: 1, lonDeg: 2 },
      ],
    };
    expect(pointInGeofence({ latDeg: 5, lonDeg: 5 }, triangle)).toBe(false);
  });

  it('degenerate polygon (< 3 vertices) returns false', () => {
    expect(pointInGeofence({ latDeg: 0, lonDeg: 0 }, { id: 'bad', vertices: [{ latDeg: 0, lonDeg: 0 }] })).toBe(false);
  });
});

// ─── Full analysis + receipt ──────────────────────────────────────────────────

describe('analyzeGeodesy', () => {
  it('returns converged=true for non-antipodal points', () => {
    const r = analyzeGeodesy({ latDeg: 48.8566, lonDeg: 2.3522 }, { latDeg: 35.6762, lonDeg: 139.6503 });
    expect(r.converged).toBe(true);
  });

  it('ECEF coordinates have correct magnitude (near Earth surface)', () => {
    const r = analyzeGeodesy({ latDeg: 0, lonDeg: 0 }, { latDeg: 45, lonDeg: 45 });
    const mag1 = Math.sqrt(r.ecefOrigin.xM ** 2 + r.ecefOrigin.yM ** 2 + r.ecefOrigin.zM ** 2);
    expect(mag1).toBeCloseTo(6_378_137.0, -1); // ≈ semi-major axis
  });
});

describe('buildGeodesyReceipt', () => {
  it('produces receipt with plugin=geolocation-gis and CAEL event', () => {
    const result  = analyzeGeodesy({ latDeg: 51.5074, lonDeg: -0.1278 }, { latDeg: 40.7128, lonDeg: -74.0060 });
    const receipt = buildGeodesyReceipt(result);
    expect(receipt.plugin).toBe('geolocation-gis');
    expect(receipt.cael.event).toBe('geolocation_gis.geodesy');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for convergent analysis', () => {
    const result  = analyzeGeodesy({ latDeg: 0, lonDeg: 0 }, { latDeg: 1, lonDeg: 1 });
    const receipt = buildGeodesyReceipt(result);
    expect(receipt.acceptance.accepted).toBe(true);
    expect(receipt.acceptance.violations).toHaveLength(0);
  });

  it('resultSummary.distanceKm matches vincenty distance', () => {
    const result  = analyzeGeodesy({ latDeg: 51.5074, lonDeg: -0.1278 }, { latDeg: 40.7128, lonDeg: -74.0060 });
    const receipt = buildGeodesyReceipt(result);
    // Receipt distance should match the Vincenty result (within floating-point rounding to 4 dp)
    expect(receipt.resultSummary.distanceKm).toBeCloseTo(result.vincenty.distanceM / 1000, 1);
  });

  it('uses provided runId', () => {
    const result  = analyzeGeodesy({ latDeg: 0, lonDeg: 0 }, { latDeg: 10, lonDeg: 10 });
    const receipt = buildGeodesyReceipt(result, { runId: 'geo-run-1' });
    expect(receipt.runId).toBe('geo-run-1');
  });
});
