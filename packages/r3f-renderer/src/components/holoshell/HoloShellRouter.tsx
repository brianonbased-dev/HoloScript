/**
 * HoloShellRouter
 *
 * Manages scene transitions with a smooth 1.8s crossfade overlay.
 * Wraps HoloShellScene and provides the HoloShellProvider context.
 *
 * The fade is a full-screen DOM layer (R3F Canvas cannot easily do cross-scene fades alone).
 * Scene components themselves are lazy-loaded for bundle size.
 *
 * @module holoshell/HoloShellRouter
 */

import React, { Suspense, useEffect, useState, lazy } from 'react';
import type { SceneId } from './types';
import { HoloShellProvider, useHoloShell } from './useHoloShell';
import { HoloShellScene } from './HoloShellScene';

// Lazy load individual scenes (code-split)
const UnderwaterScene = lazy(() => import('./scenes/UnderwaterScene'));
const WarmLibraryScene = lazy(() => import('./scenes/WarmLibraryScene'));
const ZenGardenScene = lazy(() => import('./scenes/ZenGardenScene'));
const MountainLakeScene = lazy(() => import('./scenes/MountainLakeScene'));
const NightCampfireScene = lazy(() => import('./scenes/NightCampfireScene'));
const ZenGardenCloseScene = lazy(() => import('./scenes/ZenGardenCloseScene'));

const SCENE_MAP: Record<SceneId, React.LazyExoticComponent<React.ComponentType<any>>> = {
  UnderwaterScene,
  WarmLibraryScene,
  ZenGardenScene,
  MountainLakeScene,
  NightCampfireScene,
  ZenGardenCloseScene,
};

export interface HoloShellRouterProps {
  /** Initial scene id (default UnderwaterScene) */
  initialScene?: SceneId;
  /** Optional canvas wrapper class */
  className?: string;
  /** Camera overrides passed down to scenes */
  cameraPosition?: [number, number, number];
  fov?: number;
}

/**
 * Inner component that actually renders the current scene + fade overlay.
 * Must live inside the HoloShellProvider.
 */
const RouterInner: React.FC<Omit<HoloShellRouterProps, 'initialScene'>> = ({
  className,
  cameraPosition,
  fov,
}) => {
  const { currentScene, isTransitioning } = useHoloShell();
  const [fadeOpacity, setFadeOpacity] = useState(0);

  // Drive the DOM crossfade overlay
  useEffect(() => {
    if (isTransitioning) {
      setFadeOpacity(0.92);
      const t = setTimeout(() => {
        setFadeOpacity(0.0);
      }, 1850);
      return () => clearTimeout(t);
    }
    setFadeOpacity(0);
    return undefined; // explicit consistent return for TS
  }, [isTransitioning]);

  const SceneComponent = SCENE_MAP[currentScene];

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#05070f', // deep default (matches underwater night)
      }}
      role="application"
      aria-label={`HoloShell — ${currentScene}`}
    >
      {/* The live 3D canvas */}
      <HoloShellScene
        sceneId={currentScene}
        cameraPosition={cameraPosition}
        fov={fov}
      />

      {/* Crossfade overlay (pure DOM, above Canvas) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: '#05070f',
          opacity: fadeOpacity,
          transition: 'opacity 920ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: fadeOpacity > 0.1 ? 'auto' : 'none',
          zIndex: 20,
        }}
      />

      {/* Subtle vignette frame (reinforces "looking into" each scene) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 48%, rgba(0,0,0,0) 58%, rgba(3,4,12,0.45) 82%)',
          pointerEvents: 'none',
          zIndex: 15,
        }}
      />
    </div>
  );
};

/**
 * Public HoloShellRouter — drop-in root component.
 * Provides context + renders the live scene with crossfade navigation.
 */
export const HoloShellRouter: React.FC<HoloShellRouterProps> = ({
  initialScene = 'UnderwaterScene',
  className,
  cameraPosition = [0, 0, 3],
  fov = 75,
}) => {
  return (
    <HoloShellProvider initialScene={initialScene}>
      <Suspense
        fallback={
          <div
            style={{
              width: '100%',
              height: '100%',
              background: '#0a1422',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#88aacc',
              fontSize: 13,
              letterSpacing: '0.5px',
            }}
          >
            Entering the world…
          </div>
        }
      >
        <RouterInner
          className={className}
          cameraPosition={cameraPosition}
          fov={fov}
        />
      </Suspense>
    </HoloShellProvider>
  );
};

export default HoloShellRouter;
