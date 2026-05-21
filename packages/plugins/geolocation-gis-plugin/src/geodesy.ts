/**
 * Geodesy solver — geolocation-gis-plugin
 *
 * Implements WGS-84 geodetic operations without external dependencies:
 *   - Vincenty inverse formula (geodesic distance + azimuths)
 *   - ECEF ↔ LLA coordinate transform (Bowring iterative)
 *   - Great-circle waypoint interpolation (SLERP on unit sphere)
 *   - Spherical point-in-polygon (ray-casting; suitable for <~1000 km polygons)
 *   - CAEL-backed receipt via buildDomainSimulationReceipt
 *
 * References:
 *   Vincenty, T. (1975). "Direct and inverse solutions of geodesics on the
 *   ellipsoid with application of nested equations." Survey Review 23(176):88-93.
 *   WGS-84: NIMA TR8350.2 (3rd ed., 2000)
 */

import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
} from '@holoscript/core';

// ─── WGS-84 constants ─────────────────────────────────────────────────────────
const WGS84_A  = 6_378_137.0;                // semi-major axis (m)
const WGS84_F  = 1 / 298.257_223_563;        // flattening
const WGS84_B  = WGS84_A * (1 - WGS84_F);   // semi-minor axis (m)
const WGS84_E2 = 2 * WGS84_F - WGS84_F ** 2; // first eccentricity squared
// second eccentricity squared
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);

// ─── Public types ─────────────────────────────────────────────────────────────

/** Geodetic coordinates (WGS-84). Lat/lon in decimal degrees, altitude in metres. */
export interface LatLonAlt {
  latDeg:  number; // −90 … +90
  lonDeg:  number; // −180 … +180
  altM:    number; // metres above WGS-84 ellipsoid
}

/** Earth-Centered Earth-Fixed Cartesian coordinates (metres). */
export interface ECEF {
  xM: number;
  yM: number;
  zM: number;
}

/** Geofence defined by an ordered list of vertices forming a closed polygon. */
export interface GeofencePolygon {
  id:       string;
  vertices: { latDeg: number; lonDeg: number }[];
}

/** Result of Vincenty inverse computation. */
export interface VincentyResult {
  distanceM:        number; // geodesic distance (m)
  forwardAzimuthDeg: number; // bearing from p1 → p2 (deg, 0=N, 90=E)
  backAzimuthDeg:   number; // bearing from p2 → p1 (deg)
  /** true if points are antipodal (distance undefined within machine epsilon) */
  antipodal:        boolean;
}

/** A sequence of waypoints along a great-circle path. */
export interface GreatCircleRoute {
  origin:      { latDeg: number; lonDeg: number };
  destination: { latDeg: number; lonDeg: number };
  waypoints:   { latDeg: number; lonDeg: number; fractionOfTotal: number }[];
  totalDistanceM: number;
}

/** Combined result from a full geodesy analysis session. */
export interface GeodesyAnalysisResult {
  vincenty:   VincentyResult;
  route:      GreatCircleRoute;
  ecefOrigin: ECEF;
  ecefDest:   ECEF;
  converged:  boolean;
}

export interface GeodesyReceipt {
  plugin:        string;
  runId:         string;
  payloadHash:   string;
  hashAlgorithm: string;
  cael:          { event: string; schemaVersion: string; ts: string };
  acceptance:    { accepted: boolean; violations: string[] };
  resultSummary: {
    distanceKm:         number;
    forwardAzimuthDeg:  number;
    waypointCount:      number;
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function toRad(deg: number): number { return deg * DEG; }
function toDeg(rad: number): number { return rad * RAD; }
function normalizeDeg(d: number): number { return ((d % 360) + 360) % 360; }

/** Prime vertical radius of curvature N(φ) */
function primeVerticalRadius(sinPhi: number): number {
  return WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
}

// ─── Vincenty inverse ─────────────────────────────────────────────────────────

/**
 * Vincenty inverse formula on WGS-84 ellipsoid.
 * Returns geodesic distance and azimuths between two surface points.
 * Altitude is ignored (surface geodesic).
 */
export function vincentyInverse(
  p1: { latDeg: number; lonDeg: number },
  p2: { latDeg: number; lonDeg: number },
): VincentyResult {
  const phi1 = toRad(p1.latDeg);
  const phi2 = toRad(p2.latDeg);
  const L    = toRad(p2.lonDeg - p1.lonDeg);

  const U1 = Math.atan((1 - WGS84_F) * Math.tan(phi1));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(phi2));

  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaP: number;
  let sinLambda: number, cosLambda: number;
  let sinSigma: number, cosSigma: number, sigma: number;
  let sinAlpha: number, cos2Alpha: number, cos2SigmaM: number;
  let C: number;
  let iterations = 0;

  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);

    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );

    if (sinSigma === 0) {
      // coincident points
      return { distanceM: 0, forwardAzimuthDeg: 0, backAzimuthDeg: 0, antipodal: false };
    }

    cosSigma  = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma     = Math.atan2(sinSigma, cosSigma);
    sinAlpha  = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;

    cos2SigmaM = cos2Alpha !== 0
      ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha
      : 0; // equatorial line

    C = (WGS84_F / 16) * cos2Alpha * (4 + WGS84_F * (4 - 3 * cos2Alpha));

    lambdaP = lambda;
    lambda  = L + (1 - C) * WGS84_F * sinAlpha *
              (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));

  } while (Math.abs(lambda - lambdaP) > 1e-12 && ++iterations < 200);

  const antipodal = iterations >= 200;

  const uSq  = cos2Alpha * WGS84_EP2;
  const A_vc = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B_vc = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  const deltaSigma = B_vc * sinSigma * (
    cos2SigmaM + (B_vc / 4) * (
      cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
      (B_vc / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)
    )
  );

  const distanceM = WGS84_B * A_vc * (sigma - deltaSigma);

  const fwdAz = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
  const bakAz = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda);

  return {
    distanceM,
    forwardAzimuthDeg: normalizeDeg(toDeg(fwdAz)),
    backAzimuthDeg:    normalizeDeg(toDeg(bakAz)),
    antipodal,
  };
}

// ─── ECEF ↔ LLA ──────────────────────────────────────────────────────────────

/** Convert WGS-84 geodetic coordinates to ECEF Cartesian. */
export function llaToECEF(lla: LatLonAlt): ECEF {
  const phi    = toRad(lla.latDeg);
  const lambda = toRad(lla.lonDeg);
  const h      = lla.altM;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const N      = primeVerticalRadius(sinPhi);

  return {
    xM: (N + h) * cosPhi * Math.cos(lambda),
    yM: (N + h) * cosPhi * Math.sin(lambda),
    zM: (N * (1 - WGS84_E2) + h) * sinPhi,
  };
}

/**
 * Convert ECEF Cartesian to WGS-84 geodetic (Bowring iterative, converges in <5 steps).
 * Accurate to sub-millimetre for all altitudes < 10,000 km.
 */
export function ecefToLLA(ecef: ECEF): LatLonAlt {
  const { xM, yM, zM } = ecef;
  const p      = Math.sqrt(xM * xM + yM * yM);
  const lambda = Math.atan2(yM, xM);

  // Initial estimate (Bowring)
  let phi = Math.atan2(zM, p * (1 - WGS84_E2));

  for (let i = 0; i < 10; i++) {
    const sinPhi = Math.sin(phi);
    const N      = primeVerticalRadius(sinPhi);
    const phiNew = Math.atan2(zM + WGS84_E2 * N * sinPhi, p);
    if (Math.abs(phiNew - phi) < 1e-12) { phi = phiNew; break; }
    phi = phiNew;
  }

  const sinPhi = Math.sin(phi);
  const N      = primeVerticalRadius(sinPhi);
  const h      = p / Math.cos(phi) - N;

  return {
    latDeg: toDeg(phi),
    lonDeg: toDeg(lambda),
    altM:   h,
  };
}

// ─── Great-circle waypoints ───────────────────────────────────────────────────

/**
 * Interpolate n+2 waypoints (including endpoints) along the great-circle path
 * between two surface points using SLERP on the unit sphere.
 * Intermediate points are at equal angular spacing.
 */
export function greatCircleWaypoints(
  p1: { latDeg: number; lonDeg: number },
  p2: { latDeg: number; lonDeg: number },
  numIntermediate = 8,
): GreatCircleRoute {
  const vincenty = vincentyInverse(p1, p2);

  // Convert to ECEF unit vectors (ignoring altitude — surface only)
  const toUnitVec = (p: { latDeg: number; lonDeg: number }) => {
    const phi = toRad(p.latDeg), lam = toRad(p.lonDeg);
    const cp  = Math.cos(phi);
    return { x: cp * Math.cos(lam), y: cp * Math.sin(lam), z: Math.sin(phi) };
  };

  const v1 = toUnitVec(p1);
  const v2 = toUnitVec(p2);

  const dot   = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const omega = Math.acos(Math.max(-1, Math.min(1, dot))); // angular separation

  const total = numIntermediate + 2;
  const waypoints = Array.from({ length: total }, (_, k) => {
    const t = k / (total - 1);
    let vx: number, vy: number, vz: number;
    if (omega < 1e-10) {
      vx = v1.x; vy = v1.y; vz = v1.z;
    } else {
      const s = Math.sin(omega);
      const a = Math.sin((1 - t) * omega) / s;
      const b = Math.sin(t * omega) / s;
      vx = a * v1.x + b * v2.x;
      vy = a * v1.y + b * v2.y;
      vz = a * v1.z + b * v2.z;
    }
    // Unit vec → LLA (surface, h=0)
    const latDeg = toDeg(Math.atan2(vz, Math.sqrt(vx * vx + vy * vy)));
    const lonDeg = toDeg(Math.atan2(vy, vx));
    return { latDeg, lonDeg, fractionOfTotal: t };
  });

  return {
    origin:        { latDeg: p1.latDeg, lonDeg: p1.lonDeg },
    destination:   { latDeg: p2.latDeg, lonDeg: p2.lonDeg },
    waypoints,
    totalDistanceM: vincenty.distanceM,
  };
}

// ─── Point-in-geofence ───────────────────────────────────────────────────────

/**
 * Spherical ray-casting algorithm to test if a point lies inside a geofence polygon.
 * Uses gnomonic projection for sub-degree accuracy (suitable for polygons < ~500 km across).
 *
 * Returns true if the point is inside or on the boundary.
 */
export function pointInGeofence(
  point:   { latDeg: number; lonDeg: number },
  polygon: GeofencePolygon,
): boolean {
  const verts = polygon.vertices;
  if (verts.length < 3) return false;

  // Project all vertices and test point onto flat plane using gnomonic projection
  // centred on the first vertex (good for polygons up to ~500 km wide).
  const phi0   = toRad(verts[0].latDeg);
  const lam0   = toRad(verts[0].lonDeg);
  const cosPhi0 = Math.cos(phi0);
  const sinPhi0 = Math.sin(phi0);

  const project = (lat: number, lon: number): [number, number] => {
    const phi = toRad(lat), lam = toRad(lon);
    const c   = sinPhi0 * Math.sin(phi) + cosPhi0 * Math.cos(phi) * Math.cos(lam - lam0);
    const x   = Math.cos(phi) * Math.sin(lam - lam0) / c;
    const y   = (cosPhi0 * Math.sin(phi) - sinPhi0 * Math.cos(phi) * Math.cos(lam - lam0)) / c;
    return [x, y];
  };

  const [px, py] = project(point.latDeg, point.lonDeg);
  const n        = verts.length;
  let inside     = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = project(verts[i].latDeg, verts[i].lonDeg);
    const [xj, yj] = project(verts[j].latDeg, verts[j].lonDeg);
    const intersect = yi > py !== yj > py &&
                      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

// ─── Full analysis entry point ────────────────────────────────────────────────

/**
 * Run a complete geodesy analysis between two points.
 */
export function analyzeGeodesy(
  origin: { latDeg: number; lonDeg: number; altM?: number },
  destination: { latDeg: number; lonDeg: number; altM?: number },
  numWaypoints = 8,
): GeodesyAnalysisResult {
  const p1  = { latDeg: origin.latDeg, lonDeg: origin.lonDeg };
  const p2  = { latDeg: destination.latDeg, lonDeg: destination.lonDeg };
  const lla1: LatLonAlt = { ...p1, altM: origin.altM ?? 0 };
  const lla2: LatLonAlt = { ...p2, altM: destination.altM ?? 0 };

  const vincenty   = vincentyInverse(p1, p2);
  const route      = greatCircleWaypoints(p1, p2, numWaypoints);
  const ecefOrigin = llaToECEF(lla1);
  const ecefDest   = llaToECEF(lla2);

  return { vincenty, route, ecefOrigin, ecefDest, converged: !vincenty.antipodal };
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

export function buildGeodesyReceipt(
  result: GeodesyAnalysisResult,
  options?: { runId?: string },
): GeodesyReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];
  if (result.vincenty.antipodal)
    violations.push({ criterion: 'convergence', message: 'points are antipodal — geodesic undefined' });
  if (!result.converged)
    violations.push({ criterion: 'convergence', message: 'Vincenty iteration did not converge' });

  const raw = buildDomainSimulationReceipt({
    plugin:        'geolocation-gis',
    pluginVersion: '1.0.0',
    runId:         options?.runId ?? `geo-${Date.now().toString(36)}`,
    modelId:       'geodesy-analysis',
    solverConfig: {
      solverType: 'vincenty-wgs84',
      scale:      'global',
    },
    resultSummary: {
      distanceKm:        +(result.vincenty.distanceM / 1000).toFixed(4),
      forwardAzimuthDeg: +result.vincenty.forwardAzimuthDeg.toFixed(4),
      waypointCount:     result.route.waypoints.length,
    },
    cael: {
      version:    'cael.v1',
      event:      'geolocation_gis.geodesy',
      solverType: 'geolocation-gis.vincenty-wgs84',
    },
    acceptance: { accepted: violations.length === 0, violations },
  });

  return raw as unknown as GeodesyReceipt;
}
