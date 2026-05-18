/**
 * BubbleField
 *
 * Rising iridescent bubble spheres. Primary interactive element for HoloShell.
 * Bubbles continuously rise using useFrame. Click/tap to pop with burst animation.
 * Uses MeshPhysicalMaterial with iridescence for realistic thin-film look.
 *
 * Zero learned UI — touching nature (bubbles) produces a direct physical response.
 *
 * @module holoshell/phenomena/BubbleField
 */

import React, { useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { BubbleFieldProps } from '../types';
import { seededRandom } from '../types';

interface BubbleData {
  id: number;
  position: [number, number, number];
  radius: number;
  speed: number;
  phase: number;
  seed: number;
}

interface ActiveBurst {
  id: number;
  position: [number, number, number];
  progress: number; // 0..1
}

const DEFAULT_COUNT = 20;
const BOUNDS_Y = { min: -2.2, max: 2.8 };
const BOUNDS_XZ = 2.8;

/**
 * Single bubble mesh with its own animation state.
 * Internal to BubbleField.
 */
const Bubble: React.FC<{
  data: BubbleData;
  onPop: (id: number, pos: [number, number, number]) => void;
  respawn: boolean;
}> = ({ data, onPop, respawn }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [visible, setVisible] = useState(true);
  const [scale, setScale] = useState(1);
  const currentY = useRef(data.position[1]);

  const material = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      metalness: 0.0,
      roughness: 0.04,
      transmission: 0.98,
      thickness: 0.08,
      envMapIntensity: 1.0,
      iridescence: 1.0,
      iridescenceIOR: 1.5,
      iridescenceThicknessRange: [100, 400],
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
  }, []);

  // Reset bubble to bottom when it reaches top or after pop respawn
  const resetBubble = useCallback(() => {
    currentY.current = BOUNDS_Y.min + seededRandom(data.seed + 7) * 0.6;
    if (meshRef.current) {
      meshRef.current.position.y = currentY.current;
      meshRef.current.scale.setScalar(1);
    }
    setVisible(true);
    setScale(1);
  }, [data.seed]);

  // Handle click / pointer down (primary interaction)
  const handlePointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (!visible) return;

      // Trigger pop burst
      setVisible(false);
      setScale(0.001);

      const worldPos: [number, number, number] = [
        meshRef.current.position.x,
        meshRef.current.position.y,
        meshRef.current.position.z,
      ];

      onPop(data.id, worldPos);

      if (respawn) {
        // Respawn after short delay (simulates new bubble rising from floor)
        setTimeout(() => {
          resetBubble();
        }, 1200);
      }
    },
    [visible, data.id, onPop, respawn, resetBubble]
  );

  // Continuous rise animation (always alive)
  useFrame((state) => {
    if (!meshRef.current || !visible) return;

    // Gentle bobbing + steady rise
    const t = state.clock.elapsedTime;
    const bob = Math.sin(t * 1.8 + data.phase) * 0.015;
    currentY.current += data.speed * 0.016; // ~60fps normalized

    // Horizontal drift (very subtle, natural)
    const driftX = Math.sin(t * 0.6 + data.phase * 2) * 0.004;
    const driftZ = Math.cos(t * 0.5 + data.phase * 1.3) * 0.003;

    meshRef.current.position.x = data.position[0] + driftX;
    meshRef.current.position.z = data.position[2] + driftZ;
    meshRef.current.position.y = currentY.current + bob;

    // Reset when out of view (seamless loop)
    if (currentY.current > BOUNDS_Y.max) {
      resetBubble();
    }

    // Subtle scale breathing (iridescence feel)
    const breathe = 1 + Math.sin(t * 2.2 + data.phase) * 0.015;
    meshRef.current.scale.setScalar(scale * breathe);
  });

  return (
    <mesh
      ref={meshRef}
      position={data.position}
      onPointerDown={handlePointerDown}
      onClick={handlePointerDown} // fallback for some environments
      userData={{ phenomena: 'bubble', bubbleId: data.id }}
    >
      <sphereGeometry args={[data.radius, 24, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

/**
 * BubbleField — 20+ rising iridescent spheres.
 * Touch any bubble to pop it with a small particle burst (handled by parent callback).
 */
export const BubbleField: React.FC<BubbleFieldProps> = ({
  position = [0, -1.5, -2],
  rotation = [0, 0, 0],
  scale = 1,
  count = DEFAULT_COUNT,
  floatSpeed = 0.25,
  onPop,
  respawn = true,
}) => {
  const [bursts, setBursts] = useState<ActiveBurst[]>([]);

  // Generate deterministic bubble layout (stable across renders)
  const bubbles: BubbleData[] = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const seed = i * 137.23;
      const r = 0.05 + seededRandom(seed) * 0.07; // 0.05–0.12
      const x = (seededRandom(seed + 1) - 0.5) * BOUNDS_XZ * 2;
      const z = (seededRandom(seed + 2) - 0.5) * BOUNDS_XZ * 1.4 - 0.4;
      const y = BOUNDS_Y.min + seededRandom(seed + 3) * (BOUNDS_Y.max - BOUNDS_Y.min) * 0.6;
      const speed = floatSpeed * (0.75 + seededRandom(seed + 4) * 0.6);
      const phase = seededRandom(seed + 5) * Math.PI * 2;

      return {
        id: i,
        position: [x, y, z],
        radius: r,
        speed,
        phase,
        seed,
      };
    });
  }, [count, floatSpeed]);

  // Called by child bubble on pop
  const handlePop = useCallback(
    (id: number, pos: [number, number, number]) => {
      // Spawn short-lived burst markers (small glowing fragments)
      const burstId = Date.now() + id;
      setBursts((prev) => [...prev, { id: burstId, position: pos, progress: 0 }]);

      // Remove burst after animation
      setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== burstId));
      }, 650);

      onPop?.(id);
    },
    [onPop]
  );

  // Animate burst particles (4 small white sparks flying outward)
  const burstElements = useMemo(() => {
    return bursts.map((burst) => {
      const t = burst.progress;
      return (
        <group key={burst.id} position={burst.position}>
          {[0, 1, 2, 3].map((k) => {
            const angle = (k / 4) * Math.PI * 2 + t * 1.5;
            const dist = t * 0.45;
            const p: [number, number, number] = [
              Math.cos(angle) * dist,
              t * 0.6 + Math.sin(t * 8) * 0.03,
              Math.sin(angle) * dist * 0.7,
            ];
            return (
              <mesh key={k} position={p}>
                <sphereGeometry args={[0.018]} />
                <meshBasicMaterial
                  color="#ffffff"
                  transparent
                  opacity={Math.max(0, 1 - t * 1.4)}
                />
              </mesh>
            );
          })}
        </group>
      );
    });
  }, [bursts]);

  // Progress the bursts
  useFrame(() => {
    if (bursts.length === 0) return;
    setBursts((prev) =>
      prev.map((b) => ({
        ...b,
        progress: Math.min(1, b.progress + 0.065),
      }))
    );
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {bubbles.map((b) => (
        <Bubble key={b.id} data={b} onPop={handlePop} respawn={respawn} />
      ))}
      {burstElements}
    </group>
  );
};

export default BubbleField;
