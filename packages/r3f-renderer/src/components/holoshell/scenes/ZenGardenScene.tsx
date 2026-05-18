/**
 * ZenGardenScene
 *
 * Sand + leaves + morning light. Calm, contemplative.
 * Raked sand patterns, drifting leaves, soft god rays.
 *
 * @module holoshell/scenes/ZenGardenScene
 */

import React from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneComponentProps } from '../types';
import { SandCanvas } from '../phenomena/SandCanvas';
import { LeafField } from '../phenomena/LeafField';
import { GlowField } from '../phenomena/GlowField';
import { SceneDoor } from '../phenomena/SceneDoor';

export interface ZenGardenSceneProps extends SceneComponentProps {}

/**
 * A tranquil Japanese-inspired stone garden at dawn.
 * Bamboo cluster, raked gravel, stone lantern, and a single zen_rock door.
 * Everything breathes slowly — leaves drift, mist pulses, sand has subtle life.
 */
const ZenGardenScene: React.FC<ZenGardenSceneProps> = ({
  onNavigateRequest,
  onInteraction,
}) => {
  const { camera } = useThree();

  // Gentle downward contemplative gaze across the raked garden toward the door
  React.useEffect(() => {
    camera.lookAt(-0.8, -0.25, -2.35);
  }, [camera]);

  const handleNavigate = (id: string) => {
    onNavigateRequest?.(id as any);
    onInteraction?.('door_opened', { destination: id });
  };

  const handleSandRake = (uv: [number, number]) => {
    onInteraction?.('sand_rake', { uv });
  };

  const handleLeafTouch = (id: number) => {
    onInteraction?.('leaf_touch', { id });
  };

  return (
    <group>
      {/* === FAR BACKGROUND: large stone garden wall (weathered plaster) === */}
      <mesh position={[0, 1.4, -4.22]} rotation={[0.08, 0, 0]}>
        <planeGeometry args={[16, 7.5]} />
        <meshBasicMaterial
          color="#c8b89a"
          transparent
          opacity={0.72}
          depthWrite={false}
          side={2}
        />
      </mesh>
      {/* Subtle wall texture suggestion via darker vertical bands */}
      {[-3.5, 0, 3.5].map((x, i) => (
        <mesh key={i} position={[x, 1.35, -4.15]} rotation={[0.08, 0, 0]}>
          <planeGeometry args={[0.8, 7.2]} />
          <meshBasicMaterial color="#b8a88a" transparent opacity={0.25} side={2} />
        </mesh>
      ))}

      {/* === BAMBOO STALKS (left rear cluster, slight forward lean, varying heights) === */}
      {/* Group container for slight collective lean */}
      <group position={[-3.05, 0, -2.85]} rotation={[THREE.MathUtils.degToRad(3.5), 0, 0]}>
        {/* 5 bamboo canes — thin, pale green-yellow, joint rings */}
        {[3.8, 4.15, 3.55, 4.4, 3.95].map((h, i) => {
          const xOff = (i - 2) * 0.38;
          const zOff = -0.15 + i * 0.07;
          return (
            <group key={i} position={[xOff, 0, zOff]}>
              {/* Main stalk */}
              <mesh position={[0, h / 2 - 0.1, 0]}>
                <cylinderGeometry args={[0.032, 0.038, h, 5]} />
                <meshStandardMaterial color="#9fb37f" roughness={0.88} metalness={0.02} />
              </mesh>
              {/* Bamboo node rings (darker) */}
              {[0.6, 1.4, 2.25, 3.1].map((y, j) => (
                <mesh key={j} position={[0, y + (h - 3.5) * 0.3, 0]}>
                  <cylinderGeometry args={[0.041, 0.041, 0.07, 5]} />
                  <meshStandardMaterial color="#6e7d56" roughness={0.95} />
                </mesh>
              ))}
            </group>
          );
        })}
      </group>

      {/* === MAIN RAKED SAND GARDEN (large contemplative field) === */}
      <SandCanvas
        position={[0.2, -1.68, -1.55]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        scale={1.15}
        sandColor="#d4c39a"
        isUnderwater={false}
        rakePattern="zen-raked"
        onInteract={handleSandRake}
      />

      {/* === GRAVEL PATH leading toward the stone lantern / door === */}
      {/* Supporting flat strip (darker gravel base) */}
      <mesh position={[-1.1, -1.66, -1.35]} rotation={[-Math.PI * 0.5, 0, 0]}>
        <planeGeometry args={[2.8, 1.6]} />
        <meshStandardMaterial color="#b8a98a" roughness={0.96} />
      </mesh>
      {/* Living gravel overlay using SandCanvas (narrow, tide pattern for path feel) */}
      <SandCanvas
        position={[-1.1, -1.64, -1.32]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        scale={[1.0, 0.38, 0.9]}
        sandColor="#c2b49a"
        rakePattern="tide"
        onInteract={handleSandRake}
      />

      {/* === STONE LANTERN (cylinder body + box cap + subtle top glow) === */}
      {/* Base platform */}
      <mesh position={[-2.2, -1.35, -2.05]}>
        <cylinderGeometry args={[0.72, 0.78, 0.22, 6]} />
        <meshStandardMaterial color="#5a554f" roughness={0.99} />
      </mesh>
      {/* Main lantern body (tall cylinder) */}
      <mesh position={[-2.2, -0.82, -2.0]}>
        <cylinderGeometry args={[0.48, 0.52, 1.05, 6]} />
        <meshStandardMaterial color="#6b665f" roughness={0.97} />
      </mesh>
      {/* Cap / roof suggestion (flat box) */}
      <mesh position={[-2.2, -0.18, -2.0]}>
        <boxGeometry args={[1.15, 0.18, 1.15]} />
        <meshStandardMaterial color="#5a554f" roughness={0.98} />
      </mesh>
      {/* Small top lantern "light" housing */}
      <mesh position={[-2.2, 0.02, -2.0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.28, 5]} />
        <meshStandardMaterial color="#4a4640" roughness={0.95} emissive="#d4b88a" emissiveIntensity={0.08} />
      </mesh>

      {/* Soft dawn point light — low angle, warm morning sun */}
      <pointLight
        position={[-3.1, 4.05, -1.05]}
        intensity={0.62}
        color="#ffe8c0"
        distance={18}
        decay={1.8}
      />

      {/* === MORNING MIST / HIGH GLOW (very soft, high in volume) === */}
      <GlowField
        position={[0, 2.55, -3.55]}
        color="#e8eaf0"
        pulseRate={0.07}
        intensity={0.26}
        count={42}
      />
      {/* Lower drifting mist layer near ground for depth */}
      <GlowField
        position={[-0.4, 0.65, -3.1]}
        color="#e4e6f2"
        pulseRate={0.09}
        intensity={0.18}
        count={18}
      />

      {/* === DRIFTING LEAVES (maple / ginkgo in morning wind) === */}
      <LeafField
        position={[0.8, 1.25, -2.55]}
        count={11}
        driftSpeed={0.085}
        color="#c85d1a"
        wind
        onTouch={handleLeafTouch}
      />
      {/* Second cluster — slower, more distant near bamboo */}
      <LeafField
        position={[-2.6, 1.65, -3.0]}
        count={5}
        driftSpeed={0.055}
        color="#a86d3a"
        wind
        onTouch={handleLeafTouch}
      />

      {/* === ADDITIONAL GARDEN STONES (natural placement around lantern) === */}
      {/* Left foreground stone */}
      <mesh position={[-3.4, -1.42, -1.65]}>
        <dodecahedronGeometry args={[0.42]} />
        <meshStandardMaterial color="#5a5650" roughness={0.99} />
      </mesh>
      {/* Mid right stone */}
      <mesh position={[1.85, -1.48, -2.35]}>
        <sphereGeometry args={[0.38]} />
        <meshStandardMaterial color="#4f4a44" roughness={0.98} />
      </mesh>
      {/* Small accent stones near path */}
      <mesh position={[-0.55, -1.52, -0.95]}>
        <dodecahedronGeometry args={[0.22]} />
        <meshStandardMaterial color="#6a655e" roughness={0.97} />
      </mesh>

      {/* === SCENE DOOR set into the stone lantern formation (zen_rock) === */}
      <SceneDoor
        position={[-2.35, -0.25, -2.1]}
        rotation={[0.02, 0.09, -0.01]}
        materialType="zen_rock"
        destinationScene="MountainLakeScene"
        onNavigate={handleNavigate}
        ariaLabel="Continue to the mountain lake through the stone passage"
      />

      {/* Gentle right-side enclosure (soft foliage suggestion via plane) */}
      <mesh position={[5.2, 0.6, -3.1]} rotation={[0, -0.45, 0]}>
        <planeGeometry args={[5.5, 4.8]} />
        <meshStandardMaterial color="#3a3a2f" roughness={0.94} transparent opacity={0.6} side={2} />
      </mesh>

      {/* TODO: very soft wind chimes + distant temple bell + gravel underfoot (audio) */}
    </group>
  );
};

export default ZenGardenScene;
