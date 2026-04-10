/**
 * Solve Kepler's equation M = E - e*sin(E) via Newton-Raphson iteration.
 * @param M Mean anomaly (radians)
 * @param e Eccentricity (0 <= e < 1)
 * @returns Eccentric anomaly E (radians)
 */
export function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 10; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

/**
 * Compute orbital path points in 3D space from Keplerian elements.
 * Returns array of [x, y, z] tuples.
 */
export function computeOrbitalPoints(
  semiMajorAxis: number,
  eccentricity: number,
  inclination: number,
  longitudeAscending: number,
  argumentPeriapsis: number,
  scale: number,
  numPoints: number = 120,
): Array<[number, number, number]> {
  const a = semiMajorAxis;
  const e = eccentricity;
  const i = inclination * (Math.PI / 180);
  const Omega = longitudeAscending * (Math.PI / 180);
  const w = argumentPeriapsis * (Math.PI / 180);

  const points: Array<[number, number, number]> = [];

  for (let step = 0; step <= numPoints; step++) {
    const M = (step / numPoints) * Math.PI * 2;
    const E = solveKepler(M, e);

    const xOrb = a * (Math.cos(E) - e);
    const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E);

    const cosw = Math.cos(w);
    const sinw = Math.sin(w);
    const cosI = Math.cos(i);
    const sinI = Math.sin(i);
    const cosOmega = Math.cos(Omega);
    const sinOmega = Math.sin(Omega);

    const x =
      (cosOmega * cosw - sinOmega * sinw * cosI) * xOrb +
      (-cosOmega * sinw - sinOmega * cosw * cosI) * yOrb;

    const z =
      (sinOmega * cosw + cosOmega * sinw * cosI) * xOrb +
      (-sinOmega * sinw + cosOmega * cosw * cosI) * yOrb;

    const y = sinw * sinI * xOrb + cosw * sinI * yOrb;

    points.push([x * scale, y * scale, z * scale]);
  }

  return points;
}
