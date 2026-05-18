/**
 * ZenGardenCloseScene
 *
 * Intimate close-up of sand patterns and a single drifting leaf.
 * Final "resting" scene — extremely calm, high detail on micro-phenomena.
 *
 * @module holoshell/scenes/ZenGardenCloseScene
 */

import React, { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneComponentProps } from '../types';
import { SandCanvas } from '../phenomena/SandCanvas';
import { LeafField } from '../phenomena/LeafField';
import { GlowField } from '../phenomena/GlowField';
import { BubbleField } from '../phenomena/BubbleField';
import { SceneDoor } from '../phenomena/SceneDoor';

export interface ZenGardenCloseSceneProps extends SceneComponentProps {}

/**
 * Extreme macro view of a zen garden corner.
 * Massive raked sand, second stone, living moss glow, layered rake marks,
 * a single shaft of morning light, and three slow dew drops.
 * The quietest, most intimate moment before returning to the underwater world.
 */
const ZenGardenCloseScene: React.FC<ZenGardenCloseSceneProps> = ({
  onNavigateRequest,
  onInteraction,
}) => {
  const { camera } = useThree();
  const lightShaftRef = useRef<THREE.Mesh>(null!);

  // Intimate macro gaze — sand and leaf dominate the lower frame
  React.useEffect(() => {
    camera.lookAt(0.35, -0.45, -1.25);
  }, [camera]);

  // Very subtle breathing of the morning light shaft (always-alive micro animation)
  useFrame((state) => {
    if (lightShaftRef.current) {
      const t = state.clock.elapsedTime;
      const mat = lightShaftRef.current.material as THREE.Material & { opacity?: number };
      if (mat && 'opacity' in mat) {
        (mat as any).opacity = 0.055 + Math.sin(t * 0.18) * 0.012;
      }
    }
  });

  const handleNavigate = (id: string) => {
    onNavigateRequest?.(id as any);
    onInteraction?.('door_opened', { destination: id });
  };

  const handleSandDetail = (uv: [number, number]) => {
    onInteraction?.('sand_detail', { uv });
  };

  const handleFinalLeaf = () => {
    onInteraction?.('final_leaf_touch');
  };

  return (
    <group>
      {/* === MACRO SAND — fills lower 2/3 of the entire frame (primary surface) === */}
      <SandCanvas
        position={[0.05, -1.38, -0.95]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        scale={1.42}
        sandColor="#d8c9a4"
        isUnderwater={false}
        rakePattern="zen-raked"
        onInteract={handleSandDetail}
      />

      {/* === SECONDARY RAKING MARKS (offset layer for rich overlapping patterns) === */}
      <SandCanvas
        position={[0.62, -1.32, -0.72]}
        rotation={[-Math.PI * 0.5, 0.04, 0]}
        scale={0.52}
        sandColor="#c9b89a"
        rakePattern="ripple"
        onInteract={handleSandDetail}
      />

      {/* === PROMINENT SLOW DRIFTING LEAF (focal micro-interaction) === */}
      <LeafField
        position={[0.32, 0.52, -1.38]}
        count={1}
        driftSpeed={0.042}
        color="#9c5a1f"
        wind={false}
        onTouch={handleFinalLeaf}
      />

      {/* === SECOND STONE FORMATION (smaller dodecahedron, right of frame) === */}
      <mesh position={[1.82, -1.12, -1.52]}>
        <dodecahedronGeometry args={[0.48]} />
        <meshStandardMaterial color="#4a4742" roughness={0.99} />
      </mesh>
      {/* Small accent pebble beside it */}
      <mesh position={[2.15, -1.18, -1.35]}>
        <sphereGeometry args={[0.18]} />
        <meshStandardMaterial color="#5a5650" roughness={0.98} />
      </mesh>

      {/* === MOSS DETAIL — very close, subtle living green bioluminescence === */}
      <GlowField
        position={[-1.52, -0.72, -1.22]}
        color="#4a7a3a"
        pulseRate={0.16}
        intensity={0.19}
        count={9}
      />
      {/* Extra low moss patch for ground coverage */}
      <GlowField
        position={[-0.85, -1.05, -0.95]}
        color="#3f6a35"
        pulseRate={0.21}
        intensity={0.12}
        count={5}
      />

      {/* === SINGLE SHAFT OF MORNING LIGHT (god ray across the macro sand) === */}
      <mesh
        ref={lightShaftRef}
        position={[0.82, 0.48, -1.92]}
        rotation={[0, THREE.MathUtils.degToRad(-17), 0]}
      >
        <planeGeometry args={[0.18, 2.8]} />
        <meshBasicMaterial
          color="#fff8e0"
          transparent
          opacity={0.058}
          depthWrite={false}
          side={2}
        />
      </mesh>

      {/* === DEW DROPS — extremely slow rising micro-bubbles as condensation on sand/leaf === */}
      <BubbleField
        position={[0.22, -0.52, -1.02]}
        count={3}
        floatSpeed={0.018}
        respawn
        onPop={(id) => onInteraction?.('dew_pop', { id })}
      />

      {/* === SOFT MORNING DUST / LIGHT MOTES (high micro-detail) === */}
      <GlowField
        position={[0.05, 0.68, -1.62]}
        color="#f5e8b8"
        pulseRate={0.09}
        intensity={0.34}
        count={11}
      />
      {/* Tiny foreground glint near dew */}
      <GlowField
        position={[0.45, -0.35, -0.85]}
        color="#e8d9a8"
        pulseRate={0.24}
        intensity={0.22}
        count={4}
      />

      {/* === ADDITIONAL MICRO STONES & TEXTURE (foreground right + left) === */}
      <mesh position={[-0.95, -1.22, -0.78]}>
        <dodecahedronGeometry args={[0.26]} />
        <meshStandardMaterial color="#5f5a52" roughness={0.99} />
      </mesh>
      <mesh position={[1.35, -1.25, -0.65]}>
        <sphereGeometry args={[0.15]} />
        <meshStandardMaterial color="#48443f" roughness={0.97} />
      </mesh>

      {/* === SCENE DOOR (zen_rock) — returns to the start of the loop === */}
      <SceneDoor
        position={[-1.5, -0.55, -1.35]}
        rotation={[0.025, 0.11, -0.008]}
        materialType="zen_rock"
        destinationScene="UnderwaterScene"
        onNavigate={handleNavigate}
        ariaLabel="Return through the stone to the underwater world"
      />

      {/* Tiny foreground sand ridge for macro depth feel */}
      <mesh position={[0.15, -1.28, -0.55]} rotation={[-Math.PI * 0.48, 0, 0]}>
        <planeGeometry args={[1.8, 0.35]} />
        <meshStandardMaterial color="#c8b89a" roughness={0.94} />
      </mesh>

      {/* TODO: extremely faint single wind chime tone + dew evaporation (audio) */}
    </group>
  );
};

export default ZenGardenCloseScene;
