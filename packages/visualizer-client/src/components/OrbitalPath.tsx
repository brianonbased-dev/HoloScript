import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { _OrbData } from '../types';
import { solveKepler } from '../utils/kepler';

export const OrbitalPath = ({ orb, parentOrb, scale = 50 }: OrbitalPathProps) => {
  const points = useMemo(() => {
    const props = orb.properties;
    if (!props?.semiMajorAxis) return [];

    const a = props.semiMajorAxis;
    const e = props.eccentricity || 0;
    const i = (props.inclination || 0) * (Math.PI / 180);
    const Omega = (props.longitudeAscending || 0) * (Math.PI / 180);
    const w = (props.argumentPeriapsis || 0) * (Math.PI / 180);

    const pathPoints: THREE.Vector3[] = [];
    const numPoints = 120;

    // Scaling logic mirrors OrbitalTrait.ts
    const currentScale = props.parent ? scale * 5 : scale;

    for (let step = 0; step <= numPoints; step++) {
      const M = (step / numPoints) * Math.PI * 2;
      const E = solveKepler(M, e);

      // Position in orbital plane
      const xOrb = a * (Math.cos(E) - e);
      const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E);

      // Rotation to ecliptic
      const cosw = Math.cos(w);
      const sinw = Math.sin(w);
      const cosI = Math.cos(i);
      const sinI = Math.sin(i);
      const cosOmega = Math.cos(Omega);
      const sinOmega = Math.sin(Omega);

      // Mapping to Three.js coordinates (x, z, y) -> (x, y, z)
      // Mirroring the runtime's coordinate transform
      const x =
        (cosOmega * cosw - sinOmega * sinw * cosI) * xOrb +
        (-cosOmega * sinw - sinOmega * cosw * cosI) * yOrb;

      const z =
        (sinOmega * cosw + cosOmega * sinw * cosI) * xOrb +
        (-sinOmega * sinw + cosOmega * cosw * cosI) * yOrb;

      const y = sinw * sinI * xOrb + cosw * sinI * yOrb;

      pathPoints.push(new THREE.Vector3(x * currentScale, y * currentScale, z * currentScale));
    }

    return pathPoints;
  }, [orb.properties, scale]);

  if (points.length === 0) return null;

  return (
    <group
      position={
        parentOrb ? [parentOrb.position.x, parentOrb.position.y, parentOrb.position.z] : [0, 0, 0]
      }
    >
      <Line
        points={points}
        color={orb.hologram?.color || '#ffffff'}
        opacity={0.3}
        transparent
        lineWidth={1}
      />
    </group>
  );
};
