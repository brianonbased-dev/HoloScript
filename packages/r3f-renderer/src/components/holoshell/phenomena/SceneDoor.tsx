/**
 * SceneDoor
 *
 * The single navigation affordance in HoloShell.
 * Appears as a natural wooden/rock door embedded in a believable surface
 * (cliff face, bookshelf gap, stone arch, etc.). Never a glowing abstract portal.
 *
 * Click opens the door (Y-axis rotation animation 0 → -90°), then calls onNavigate.
 * Keyboard accessible via Enter when focused (wrapper handles).
 *
 * @module holoshell/phenomena/SceneDoor
 */

import React, { useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { SceneDoorProps, SceneId } from '../types';

interface DoorVisualStyle {
  frameColor: string;
  doorColor: string;
  emissive: string;
  roughness: number;
}

const STYLE_MAP: Record<string, DoorVisualStyle> = {
  underwater_rock: {
    frameColor: '#2a2f33',
    doorColor: '#5c4634',
    emissive: '#ffb866',
    roughness: 0.94,
  },
  wood_cliff: {
    frameColor: '#3a2f25',
    doorColor: '#6b4f2f',
    emissive: '#ffcc77',
    roughness: 0.88,
  },
  stone_arch: {
    frameColor: '#4a4a4a',
    doorColor: '#5f5548',
    emissive: '#ffaa55',
    roughness: 0.96,
  },
  bookshelf: {
    frameColor: '#3a2a18',
    doorColor: '#4f3a22',
    emissive: '#ddaa66',
    roughness: 0.82,
  },
  campfire_ring: {
    frameColor: '#2f2a22',
    doorColor: '#4a3a2a',
    emissive: '#ff8844',
    roughness: 0.9,
  },
  zen_rock: {
    frameColor: '#3f3f3f',
    doorColor: '#5a5246',
    emissive: '#c8a46a',
    roughness: 0.95,
  },
};

export const SceneDoor: React.FC<SceneDoorProps> = ({
  position = [-1.2, -0.8, -2.0],
  rotation = [0, 0, 0],
  scale = 1,
  materialType = 'underwater_rock',
  destinationScene,
  onNavigate,
  ariaLabel = 'Enter next scene',
}) => {
  const doorGroupRef = useRef<THREE.Group>(null!);
  const [isOpen, setIsOpen] = useState(false);
  const [openProgress, setOpenProgress] = useState(0); // 0 closed → 1 open

  const style = STYLE_MAP[materialType] ?? STYLE_MAP.underwater_rock;

  // Click handler — begins open animation
  const handleActivate = useCallback(() => {
    if (isOpen) return;
    setIsOpen(true);
  }, [isOpen]);

  // Keyboard support lives at the HoloShellRouter / shell level (global key listeners map to navigate()).
  // SceneDoor only needs pointer activation — natural object affordance.

  // Animate door opening (Y rotation from 0 to -1.57 rad)
  useFrame((_, delta) => {
    if (!isOpen) return;

    const target = 1.0;
    const next = Math.min(target, openProgress + delta * 0.9); // ~1.1s open
    setOpenProgress(next);

    if (doorGroupRef.current) {
      const angle = -next * 1.57; // 90 degrees
      doorGroupRef.current.rotation.y = angle;
    }

    if (next >= 0.999 && openProgress < 0.999) {
      // Fire navigation exactly once when fully open
      onNavigate?.(destinationScene);
    }
  });

  // Subtle idle glow pulse on door (warm invitation)
  const glowOpacity = isOpen ? 0.1 : 0.22 + Math.sin(Date.now() / 900) * 0.06;

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerDown={handleActivate}
      userData={{ phenomena: 'door', destination: destinationScene }}
    >
      {/* Rock / surface frame (subtle arch) */}
      <mesh position={[0, 0.6, -0.08]}>
        <boxGeometry args={[1.35, 2.15, 0.22]} />
        <meshStandardMaterial
          color={style.frameColor}
          roughness={0.98}
          metalness={0.02}
        />
      </mesh>

      {/* Door leaf group (rotates) */}
      <group ref={doorGroupRef} position={[0.48, 0.55, 0.02]}>
        {/* Main wooden slab */}
        <mesh>
          <boxGeometry args={[0.92, 1.85, 0.12]} />
          <meshStandardMaterial
            color={style.doorColor}
            roughness={style.roughness}
            metalness={0.04}
            emissive={style.emissive}
            emissiveIntensity={isOpen ? 0.08 : 0.24}
          />
        </mesh>

        {/* Vertical wood grain suggestion (thin boxes) */}
        {[ -0.28, 0.0, 0.28 ].map((x, idx) => (
          <mesh key={idx} position={[x, 0, 0.08]}>
            <boxGeometry args={[0.04, 1.7, 0.03]} />
            <meshStandardMaterial color="#2f2318" roughness={0.96} />
          </mesh>
        ))}

        {/* Amber light leak crack at the hinge side (invitation) */}
        <mesh position={[-0.42, 0.1, 0.1]}>
          <planeGeometry args={[0.08, 1.4]} />
          <meshBasicMaterial
            color="#ffcc77"
            transparent
            opacity={glowOpacity * 0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Threshold step (natural integration) */}
      <mesh position={[0, -0.35, 0.18]}>
        <boxGeometry args={[1.45, 0.18, 0.48]} />
        <meshStandardMaterial color={style.frameColor} roughness={0.99} />
      </mesh>

      {/* Tiny handle / latch suggestion (no button shape) */}
      <mesh position={[0.32, 0.15, 0.14]}>
        <cylinderGeometry args={[0.03, 0.03, 0.22, 6]} />
        <meshStandardMaterial color="#2a2520" roughness={0.7} />
      </mesh>
    </group>
  );
};

export default SceneDoor;
