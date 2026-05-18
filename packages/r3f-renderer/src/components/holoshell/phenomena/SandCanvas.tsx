/**
 * SandCanvas
 *
 * PBR sand plane with optional pre-baked ripple/rake pattern and live pointer-drag traces.
 * Interaction leaves persistent finger/pointer traces (displacement simulation via
 * simple UV tracking + small mesh "dents").
 *
 * Always alive: gentle wave undulation even at rest.
 *
 * @module holoshell/phenomena/SandCanvas
 */

import React, { useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { SandCanvasProps } from '../types';

interface SandTrace {
  id: number;
  position: [number, number, number];
  radius: number;
  age: number; // frames since creation
}

export const SandCanvas: React.FC<SandCanvasProps> = ({
  position = [0, -1.8, -1.5],
  rotation = [-Math.PI * 0.5, 0, 0],
  scale = 1,
  sandColor = '#c8b57a',
  isUnderwater = false,
  rakePattern = 'ripple',
  onInteract,
}) => {
  const planeRef = useRef<THREE.Mesh>(null!);
  const [traces, setTraces] = useState<SandTrace[]>([]);
  const isDragging = useRef(false);

  // Base PBR material for sand
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: sandColor,
      roughness: isUnderwater ? 0.55 : 0.92,
      metalness: 0.0,
      flatShading: false,
    });
    return mat;
  }, [sandColor, isUnderwater]);

  // Gentle base undulation (always alive)
  useFrame((state) => {
    if (!planeRef.current) return;
    const t = state.clock.elapsedTime;
    // Subtle breathing of the whole plane
    planeRef.current.position.y = position[1] + Math.sin(t * 0.18) * 0.008;
    // Very slow rotation micro sway
    planeRef.current.rotation.z = Math.sin(t * 0.07) * 0.002;
  });

  // Convert world pointer to local UV on the plane
  const getLocalUV = useCallback((e: any): [number, number] | null => {
    if (!planeRef.current) return null;
    const point = e.point as THREE.Vector3;
    // Plane is 8x8 by default (we use args [8,8])
    const localX = (point.x - position[0]) / 8 + 0.5;
    const localZ = (point.z - position[2]) / 8 + 0.5;
    if (localX < 0 || localX > 1 || localZ < 0 || localZ > 1) return null;
    return [localX, localZ];
  }, [position]);

  const handlePointerDown = useCallback(
    (e: any) => {
      isDragging.current = true;
      const uv = getLocalUV(e);
      if (uv) {
        onInteract?.(uv);
        // Create a visual trace dent
        const worldPos: [number, number, number] = [e.point.x, e.point.y + 0.01, e.point.z];
        setTraces((prev) => [
          ...prev.slice(-7), // keep last 8
          { id: Date.now(), position: worldPos, radius: 0.09, age: 0 },
        ]);
      }
    },
    [getLocalUV, onInteract]
  );

  const handlePointerMove = useCallback(
    (e: any) => {
      if (!isDragging.current) return;
      const uv = getLocalUV(e);
      if (uv) {
        onInteract?.(uv);
        const worldPos: [number, number, number] = [e.point.x, e.point.y + 0.01, e.point.z];
        setTraces((prev) => {
          const next = [...prev];
          if (next.length > 0) {
            // Extend the most recent trace slightly
            const last = next[next.length - 1];
            next[next.length - 1] = {
              ...last,
              position: [
                (last.position[0] + worldPos[0]) / 2,
                worldPos[1],
                (last.position[2] + worldPos[2]) / 2,
              ],
              radius: Math.min(0.18, last.radius + 0.006),
            };
          } else {
            next.push({ id: Date.now(), position: worldPos, radius: 0.09, age: 0 });
          }
          return next.slice(-9);
        });
      }
    },
    [getLocalUV, onInteract]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Age + fade traces
  useFrame(() => {
    setTraces((prev) =>
      prev
        .map((t) => ({ ...t, age: t.age + 1 }))
        .filter((t) => t.age < 420) // ~7 seconds at 60fps
    );
  });

  // Small sphere "dents" for traces (cheap but effective)
  const traceDents = traces.map((trace) => {
    const opacity = Math.max(0.12, 0.55 - trace.age / 380);
    return (
      <mesh
        key={trace.id}
        position={trace.position}
        renderOrder={2}
      >
        <sphereGeometry args={[trace.radius * (1 - trace.age / 520), 12, 12]} />
        <meshStandardMaterial
          color={isUnderwater ? '#a38a5e' : '#b89f6b'}
          roughness={0.98}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
    );
  });

  // Pre-baked pattern suggestion (simple ring ridges for "ripple")
  const patternRidges = useMemo(() => {
    if (rakePattern === 'none') return null;

    const ridges: React.ReactNode[] = [];
    const count = rakePattern === 'ripple' ? 5 : 7;
    for (let i = 0; i < count; i++) {
      const r = 0.6 + i * 0.55;
      ridges.push(
        <mesh
          key={i}
          position={[0, 0.012, 0]}
          rotation={[Math.PI * -0.5, 0, 0]}
        >
          <ringGeometry args={[r, r + 0.028, 64]} />
          <meshStandardMaterial
            color={isUnderwater ? '#9c7f52' : '#a98f64'}
            roughness={0.96}
            transparent
            opacity={0.28}
            side={THREE.DoubleSide}
          />
        </mesh>
      );
    }
    return <group>{ridges}</group>;
  }, [rakePattern, isUnderwater]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Base sand plane */}
      <mesh
        ref={planeRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        userData={{ phenomena: 'sand' }}
      >
        <planeGeometry args={[8, 8, 64, 64]} />
        <primitive object={material} attach="material" />
      </mesh>

      {/* Subtle pre-baked pattern ridges */}
      {patternRidges}

      {/* Live interaction traces (finger rakes) */}
      {traceDents}

      {/* Wet sheen highlight for underwater variant */}
      {isUnderwater && (
        <mesh position={[0, 0.015, 0]} rotation={[Math.PI * -0.5, 0, 0]}>
          <planeGeometry args={[7.6, 7.6]} />
          <meshBasicMaterial color="#c8d4a8" transparent opacity={0.08} />
        </mesh>
      )}
    </group>
  );
};

export default SandCanvas;
