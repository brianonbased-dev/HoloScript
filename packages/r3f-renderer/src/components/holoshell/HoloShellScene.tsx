/**
 * HoloShellScene
 *
 * The actual React Three Fiber Canvas wrapper.
 * Receives a sceneId, renders the correct lazy scene component inside a properly
 * configured Canvas (fixed camera, no orbit controls, subtle frame).
 *
 * Suspense boundary with a soft underwater-style blur fallback.
 *
 * @module holoshell/HoloShellScene
 */

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { HoloShellSceneProps, SceneId } from './types';
import { useSceneNavigation } from './useHoloShell';

// Import scene components directly (router handles lazy at a higher level)
import UnderwaterScene from './scenes/UnderwaterScene';
import WarmLibraryScene from './scenes/WarmLibraryScene';
import ZenGardenScene from './scenes/ZenGardenScene';
import MountainLakeScene from './scenes/MountainLakeScene';
import NightCampfireScene from './scenes/NightCampfireScene';
import ZenGardenCloseScene from './scenes/ZenGardenCloseScene';

const SCENE_COMPONENTS: Record<SceneId, React.ComponentType<any>> = {
  UnderwaterScene,
  WarmLibraryScene,
  ZenGardenScene,
  MountainLakeScene,
  NightCampfireScene,
  ZenGardenCloseScene,
};

interface InnerSceneProps {
  sceneId: SceneId;
  onNavigateRequest: (id: SceneId) => void;
  onInteraction: (type: string, detail?: unknown) => void;
}

const SceneRenderer: React.FC<InnerSceneProps> = ({
  sceneId,
  onNavigateRequest,
  onInteraction,
}) => {
  const Comp = SCENE_COMPONENTS[sceneId];
  if (!Comp) {
    console.warn(`[HoloShellScene] Unknown sceneId: ${sceneId}, falling back to UnderwaterScene`);
    return (
      <UnderwaterScene
        onNavigateRequest={onNavigateRequest}
        onInteraction={onInteraction}
      />
    );
  }
  return (
    <Comp
      onNavigateRequest={onNavigateRequest}
      onInteraction={onInteraction}
    />
  );
};

/**
 * Root Canvas + scene selector.
 * This component expects to live inside a HoloShellProvider (usually via HoloShellRouter).
 */
export const HoloShellScene: React.FC<HoloShellSceneProps> = ({
  sceneId,
  className,
  cameraPosition = [0, 0, 3],
  fov = 75,
  onSceneLoaded,
  onPhenomenaInteraction,
}) => {
  const { navigate } = useSceneNavigation();

  const handleNavigateRequest = (target: SceneId) => {
    navigate(target);
  };

  const handleInteraction = (type: string, detail?: unknown) => {
    onPhenomenaInteraction?.(type, detail);
  };

  // Notify parent once the Canvas has mounted the first frame
  React.useEffect(() => {
    const t = setTimeout(() => onSceneLoaded?.(sceneId), 120);
    return () => clearTimeout(t);
  }, [sceneId, onSceneLoaded]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#05070f',
      }}
    >
      <Canvas
        camera={{
          position: cameraPosition as [number, number, number],
          fov,
          near: 0.1,
          far: 80,
        }}
        style={{ background: '#05070f' }}
        gl={{
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance',
        }}
        shadows={false} // phenomena-driven, not heavy shadow maps
      >
        {/* Very soft ambient so nothing is pure black */}
        <ambientLight intensity={0.18} color="#aaccff" />

        {/* Gentle key light from top-front (matches most scene designs) */}
        <directionalLight
          position={[2, 6, 4]}
          intensity={0.55}
          color="#e8f0ff"
        />

        <Suspense
          fallback={
            // Underwater-style soft blur fallback while lazy scenes load
            <mesh position={[0, 0, -1]}>
              <planeGeometry args={[4, 3]} />
              <meshBasicMaterial color="#112233" transparent opacity={0.6} />
            </mesh>
          }
        >
          <SceneRenderer
            sceneId={sceneId}
            onNavigateRequest={handleNavigateRequest}
            onInteraction={handleInteraction}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default HoloShellScene;
