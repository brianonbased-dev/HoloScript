/**
 * GlowField
 *
 * Ambient floating light motes / bioluminescent particles.
 * Used for kelp glow in underwater, fireflies in night scenes, dust in libraries.
 * Pulses slowly. Non-interactive by default (pure atmosphere).
 *
 * @module holoshell/phenomena/GlowField
 */

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { GlowFieldProps } from '../types';
import { seededRandom } from '../types';

interface Mote {
  id: number;
  pos: [number, number, number];
  phase: number;
  speed: number;
  size: number;
}

export const GlowField: React.FC<GlowFieldProps> = ({
  position = [1.0, 0.0, -2.5],
  rotation = [0, 0, 0],
  scale = 1,
  color = '#20ff8a',
  pulseRate = 0.3,
  intensity = 0.6,
  count = 14,
}) => {
  const pointsRef = useRef<THREE.Points>(null!);

  const { geometry, material } = useMemo(() => {
    const motes: Mote[] = Array.from({ length: count }, (_, i) => {
      const s = i * 41.3;
      return {
        id: i,
        pos: [
          (seededRandom(s) - 0.5) * 3.8,
          (seededRandom(s + 1) - 0.3) * 2.4,
          (seededRandom(s + 2) - 0.5) * 2.2,
        ],
        phase: seededRandom(s + 3) * Math.PI * 2,
        speed: 0.4 + seededRandom(s + 4) * 0.7,
        size: 0.9 + seededRandom(s + 5) * 1.6,
      };
    });

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const phaseAttr = new Float32Array(count);
    const sizeAttr = new Float32Array(count);

    motes.forEach((m, i) => {
      pos[i * 3] = m.pos[0];
      pos[i * 3 + 1] = m.pos[1];
      pos[i * 3 + 2] = m.pos[2];
      phaseAttr[i] = m.phase;
      sizeAttr[i] = m.size;
    });

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phaseAttr, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizeAttr, 1));

    // Store motes on geometry for animation lookup
    (geo as any).userData = { motes };

    const mat = new THREE.PointsMaterial({
      size: 0.09,
      color,
      transparent: true,
      opacity: intensity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [count, color, intensity]);

  // Animate pulse + gentle drift
  useFrame((state) => {
    if (!pointsRef.current) return;
    const t = state.clock.elapsedTime;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const sizeAttr = pointsRef.current.geometry.attributes.aSize as THREE.BufferAttribute;

    const motes: Mote[] = (pointsRef.current.geometry as any).userData.motes || [];

    motes.forEach((m, i) => {
      const pulse = (Math.sin(t * pulseRate * 2.0 + m.phase) * 0.5 + 0.5) * intensity + 0.25;
      const y = m.pos[1] + Math.sin(t * m.speed * 0.3 + m.phase) * 0.22;

      posAttr.setY(i, y);
      sizeAttr.setX(i, m.size * (0.7 + pulse * 0.55));
    });

    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;

    // Global opacity pulse
    (pointsRef.current.material as THREE.PointsMaterial).opacity =
      intensity * (0.75 + Math.sin(t * pulseRate * 1.6) * 0.25);
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <points ref={pointsRef} geometry={geometry} material={material} />
    </group>
  );
};

export default GlowField;
