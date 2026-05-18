/**
 * LeafField
 *
 * Gentle drifting/falling leaves. Used for Zen Garden and library dust/leaf scenes.
 * Leaves rotate and sway with subtle wind. Touch to acknowledge (for content state).
 *
 * @module holoshell/phenomena/LeafField
 */

import React, { useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { LeafFieldProps } from '../types';
import { seededRandom } from '../types';

interface LeafDatum {
  id: number;
  pos: [number, number, number];
  rotSpeed: number;
  drift: number;
  phase: number;
  size: number;
}

export const LeafField: React.FC<LeafFieldProps> = ({
  position = [0, 0.8, -1.8],
  rotation = [0, 0, 0],
  scale = 1,
  count = 7,
  driftSpeed = 0.12,
  color = '#c4720a',
  wind = true,
  onTouch,
}) => {
  const groupRef = useRef<THREE.Group>(null!);

  const leaves: LeafDatum[] = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const s = i * 31.7;
      return {
        id: i,
        pos: [
          (seededRandom(s) - 0.5) * 3.4,
          0.3 + seededRandom(s + 2) * 2.6,
          (seededRandom(s + 1) - 0.5) * 2.8,
        ],
        rotSpeed: 0.6 + seededRandom(s + 3) * 1.4,
        drift: driftSpeed * (0.7 + seededRandom(s + 4) * 0.9),
        phase: seededRandom(s + 5) * Math.PI * 2,
        size: 0.11 + seededRandom(s + 6) * 0.07,
      };
    });
  }, [count, driftSpeed]);

  const leafMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.86,
    });
  }, [color]);

  const handleLeafClick = useCallback(
    (id: number, e: any) => {
      e.stopPropagation();
      onTouch?.(id);
      // Visual: quick scale pop then continue drifting (parent can hide via state)
    },
    [onTouch]
  );

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    groupRef.current.children.forEach((child, idx) => {
      const leaf = leaves[idx];
      if (!leaf) return;

      const y = leaf.pos[1] + Math.sin(t * 0.4 + leaf.phase) * 0.08;
      const x = leaf.pos[0] + Math.sin(t * 0.18 + leaf.phase * 0.7) * (wind ? 0.15 : 0.04);
      const z = leaf.pos[2] + Math.cos(t * 0.15 + leaf.phase) * (wind ? 0.09 : 0.02);

      child.position.set(x, y, z);

      // Gentle tumbling rotation
      child.rotation.x = Math.sin(t * leaf.rotSpeed * 0.6 + leaf.phase) * 1.1;
      child.rotation.y = t * leaf.rotSpeed * 0.4 + leaf.phase * 2;
      child.rotation.z = Math.cos(t * leaf.rotSpeed * 0.5) * 0.7;
    });
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      {leaves.map((leaf) => (
        <mesh
          key={leaf.id}
          position={leaf.pos}
          onPointerDown={(e) => handleLeafClick(leaf.id, e)}
          userData={{ phenomena: 'leaf', leafId: leaf.id }}
        >
          {/* Simple plane leaf shape — cheap & readable */}
          <planeGeometry args={[leaf.size * 1.6, leaf.size]} />
          <primitive object={leafMaterial} attach="material" />
        </mesh>
      ))}
    </group>
  );
};

export default LeafField;
