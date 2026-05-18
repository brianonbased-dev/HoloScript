/**
 * UnderwaterScene
 *
 * Default HoloShell starter scene.
 * Glass panel frame + BubbleField + SandCanvas (underwater) + WaterSurface + GlowField (kelp) + SceneDoor.
 *
 * This is the canonical "first experience". Must feel beautiful, alive, and inviting.
 * Follows every design rule: always animating, natural interactions only, SceneDoor as sole nav.
 *
 * @module holoshell/scenes/UnderwaterScene
 */

import React from 'react';
import { useThree } from '@react-three/fiber';
import type { SceneComponentProps } from '../types';
import { BubbleField } from '../phenomena/BubbleField';
import { WaterSurface } from '../phenomena/WaterSurface';
import { SandCanvas } from '../phenomena/SandCanvas';
import { GlowField } from '../phenomena/GlowField';
import { SceneDoor } from '../phenomena/SceneDoor';

export interface UnderwaterSceneProps extends SceneComponentProps {}

/**
 * The default scene every new user sees.
 * Camera looks into the glass-panel "porthole" of an underwater world.
 */
const UnderwaterScene: React.FC<UnderwaterSceneProps> = ({
  onNavigateRequest,
  onInteraction,
}) => {
  const { camera } = useThree();

  // Slight downward look into the scene (matches .holo spirit)
  React.useEffect(() => {
    camera.lookAt(0.1, -0.6, -1.8);
  }, [camera]);

  const handleDoorNavigate = (sceneId: string) => {
    onNavigateRequest?.(sceneId as any);
    onInteraction?.('door_opened', { destination: sceneId });
  };

  const handleBubblePop = (id: number) => {
    onInteraction?.('bubble_pop', { id });
    // Placeholder for haptic/audio bridge
    // navigator.vibrate?.(8);
  };

  const handleSandInteract = (uv: [number, number]) => {
    onInteraction?.('sand_ripple', { uv });
  };

  return (
    <group>
      {/* === GLASS PANEL FRAME (subtle porthole / fishtank) === */}
      {/* Slightly tinted glass rectangle at screen plane */}
      <mesh position={[0, 0, 2.35]} renderOrder={10}>
        <planeGeometry args={[13, 9]} />
        <meshPhysicalMaterial
          color="#aaccff"
          metalness={0.0}
          roughness={0.05}
          transmission={0.92}
          thickness={0.4}
          transparent
          opacity={0.15}
          envMapIntensity={0.2}
          side={1}
        />
      </mesh>

      {/* Soft vignette ring to reinforce frame edges */}
      <mesh position={[0, 0, 2.33]} renderOrder={11}>
        <ringGeometry args={[5.8, 7.2, 64]} />
        <meshBasicMaterial
          color="#334466"
          transparent
          opacity={0.18}
          side={2}
        />
      </mesh>

      {/* === SAND FLOOR (with rake ripples, underwater wetness) === */}
      <SandCanvas
        position={[0, -1.82, -1.5]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        sandColor="#c8b57a"
        isUnderwater
        rakePattern="ripple"
        onInteract={handleSandInteract}
      />

      {/* === WATER SURFACE (with light rays) === */}
      <WaterSurface
        position={[0, 1.55, -1.55]}
        rotation={[-Math.PI * 0.48, 0.04, 0]}
        color="#1a6fa8"
        lightRays
        rayCount={6}
        rayOpacity={0.38}
        caustics
      />

      {/* === RISING BUBBLES (primary interaction) === */}
      <BubbleField
        position={[0, -1.48, -2.05]}
        count={20}
        floatSpeed={0.25}
        onPop={handleBubblePop}
        respawn
      />

      {/* === KELP BIOLUMINESCENCE GLOW === */}
      <GlowField
        position={[1.0, 0.05, -2.55]}
        color="#20ff8a"
        pulseRate={0.3}
        intensity={0.58}
        count={14}
      />

      {/* Additional subtle left kelp glow for depth */}
      <GlowField
        position={[-1.8, -0.6, -2.8]}
        color="#33ddaa"
        pulseRate={0.22}
        intensity={0.4}
        count={8}
      />

      {/* === SCENE DOOR (only navigation element) === */}
      <SceneDoor
        position={[-1.2, -0.82, -2.05]}
        rotation={[0.03, 0.12, -0.01]}
        materialType="underwater_rock"
        destinationScene="WarmLibraryScene"
        onNavigate={handleDoorNavigate}
        ariaLabel="Enter the warm library through the rock door"
      />

      {/* TODO: ambient audio — "underwater_ambience", "soft_current_flow" (connect to HoloShell audio bridge) */}
      {/* <UnderwaterAmbience /> */}
    </group>
  );
};

export default UnderwaterScene;
