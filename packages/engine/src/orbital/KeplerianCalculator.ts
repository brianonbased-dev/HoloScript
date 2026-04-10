/**
 * Keplerian Orbital Mechanics Calculator
 *
 * Calculates celestial body positions using classical Keplerian orbital elements.
 * Based on the standard orbital mechanics equations used in astronomy.
 */

export interface OrbitalElements {
  /** Semi-major axis in AU (Astronomical Units) */
  semiMajorAxis: number;

  /** Orbital eccentricity (0 = circle, <1 = ellipse) */
  eccentricity: number;

  /** Inclination in degrees */
  inclination: number;

  /** Longitude of ascending node in degrees */
  longitudeAscending: number;

  /** Argument of periapsis in degrees */
  argumentPeriapsis: number;

  /** Mean anomaly at epoch (J2000) in degrees */
  meanAnomalyEpoch: number;

  /** Orbital period in days */
  orbitalPeriod: number;

  /** Parent body name for moons/satellites (optional) */
  parent?: string;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Normalize angle to [0, 360) range
 */
function normalizeAngle(degrees: number): number {
  degrees = degrees % 360;
  if (degrees < 0) degrees += 360;
  return degrees;
}

/**
 * Solve Kepler's equation using Newton-Raphson iteration
 * M = E - e * sin(E)
 *
 * @param meanAnomaly - Mean anomaly in radians
 * @param eccentricity - Orbital eccentricity
 * @param tolerance - Convergence tolerance (default: 1e-8)
 * @returns Eccentric anomaly in radians
 */
function solveKeplerEquation(
  meanAnomaly: number,
  eccentricity: number,
  tolerance: number = 1e-8
): number {
  // Initial guess
  let E = meanAnomaly;

  // Newton-Raphson iteration
  let delta = Infinity;
  let iterations = 0;
  const maxIterations = 100;

  while (Math.abs(delta) > tolerance && iterations < maxIterations) {
    const f = E - eccentricity * Math.sin(E) - meanAnomaly;
    const fPrime = 1 - eccentricity * Math.cos(E);
    delta = f / fPrime;
    E = E - delta;
    iterations++;
  }

  return E;
}

/**
 * Calculate true anomaly from eccentric anomaly
 *
 * @param eccentricAnomaly - Eccentric anomaly in radians
 * @param eccentricity - Orbital eccentricity
 * @returns True anomaly in radians
 */
function calculateTrueAnomaly(eccentricAnomaly: number, eccentricity: number): number {
  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);

  const cosV = (cosE - eccentricity) / (1 - eccentricity * cosE);
  const sinV = (Math.sqrt(1 - eccentricity * eccentricity) * sinE) / (1 - eccentricity * cosE);

  return Math.atan2(sinV, cosV);
}

/**
 * Calculate position in 3D space from orbital elements at a given time
 *
 * @param elements - Keplerian orbital elements
 * @param julianDate - Julian date (days since J2000 epoch)
 * @returns 3D position in AU (heliocentric or relative to parent)
 */
export function calculatePosition(elements: OrbitalElements, julianDate: number): Position3D {
  const {
    semiMajorAxis,
    eccentricity,
    inclination,
    longitudeAscending,
    argumentPeriapsis,
    meanAnomalyEpoch,
    orbitalPeriod,
  } = elements;

  // Calculate mean motion (degrees per day)
  const meanMotion = 360 / orbitalPeriod;

  // Calculate mean anomaly at current time
  const meanAnomaly = normalizeAngle(meanAnomalyEpoch + meanMotion * julianDate);
  const M = toRadians(meanAnomaly);

  // Solve Kepler's equation for eccentric anomaly
  const E = solveKeplerEquation(M, eccentricity);

  // Calculate true anomaly
  const v = calculateTrueAnomaly(E, eccentricity);

  // Calculate heliocentric distance
  const r = semiMajorAxis * (1 - eccentricity * Math.cos(E));

  // Position in orbital plane (perifocal frame)
  const xOrbital = r * Math.cos(v);
  const yOrbital = r * Math.sin(v);

  // Convert orbital elements to radians
  const i = toRadians(inclination);
  const omega = toRadians(argumentPeriapsis);
  const Omega = toRadians(longitudeAscending);

  // Transform from orbital plane to ecliptic coordinates
  // Using rotation matrices: R_z(-Omega) * R_x(-i) * R_z(-omega)
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);
  const cosCapOmega = Math.cos(Omega);
  const sinCapOmega = Math.sin(Omega);

  // Apply rotation transformations
  const x =
    (cosCapOmega * cosOmega - sinCapOmega * sinOmega * cosI) * xOrbital +
    (-cosCapOmega * sinOmega - sinCapOmega * cosOmega * cosI) * yOrbital;

  const y =
    (sinCapOmega * cosOmega + cosCapOmega * sinOmega * cosI) * xOrbital +
    (-sinCapOmega * sinOmega + cosCapOmega * cosOmega * cosI) * yOrbital;

  const z = sinOmega * sinI * xOrbital + cosOmega * sinI * yOrbital;

  return { x, y, z };
}

/**
 * Convert Date to Julian Date (days since J2000.0 epoch)
 * J2000.0 = January 1, 2000, 12:00 TT (Terrestrial Time)
 *
 * @param date - JavaScript Date object
 * @returns Julian date (days since J2000)
 */
export function dateToJulian(date: Date): number {
  // J2000.0 epoch: January 1, 2000, 12:00:00 UTC
  const j2000 = new Date('2000-01-01T12:00:00Z').getTime();
  const ms = date.getTime();

  // Convert milliseconds to days
  return (ms - j2000) / (1000 * 60 * 60 * 24);
}

/**
 * Convert Julian date to JavaScript Date
 *
 * @param julianDate - Days since J2000
 * @returns JavaScript Date object
 */
export function julianToDate(julianDate: number): Date {
  const j2000 = new Date('2000-01-01T12:00:00Z').getTime();
  const ms = j2000 + julianDate * (1000 * 60 * 60 * 24);
  return new Date(ms);
}

/**
 * Generate orbital path points for visualization
 *
 * @param elements - Orbital elements
 * @param numPoints - Number of points to generate (default: 100)
 * @returns Array of 3D positions around the orbit
 */
export function generateOrbitalPath(
  elements: OrbitalElements,
  numPoints: number = 100
): Position3D[] {
  const points: Position3D[] = [];
  const orbitalPeriod = elements.orbitalPeriod;

  for (let i = 0; i < numPoints; i++) {
    const julianDate = (i / numPoints) * orbitalPeriod;
    points.push(calculatePosition(elements, julianDate));
  }

  // Close the loop
  points.push(points[0]);

  return points;
}
