/**
 * useHoloShell
 *
 * React hook + context provider for HoloShell scene state and navigation.
 * Manages current scene, crossfade transitions (1.8s), and phenomena events.
 *
 * Follows the "always alive at rest" + "SceneDoor is only navigation" rules.
 *
 * @module holoshell/useHoloShell
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import type { SceneId, HoloShellContextType } from './types';

const DEFAULT_SCENE: SceneId = 'UnderwaterScene';
const TRANSITION_DURATION_MS = 1800;

interface HoloShellProviderProps {
  children: ReactNode;
  /** Initial scene (defaults to UnderwaterScene) */
  initialScene?: SceneId;
}

const HoloShellContext = createContext<HoloShellContextType | null>(null);

/**
 * Provider that owns the scene router state.
 * Must wrap any usage of useHoloShell and HoloShellRouter.
 */
export const HoloShellProvider: React.FC<HoloShellProviderProps> = ({
  children,
  initialScene = DEFAULT_SCENE,
}) => {
  const [currentScene, setCurrentScene] = useState<SceneId>(initialScene);
  const [previousScene, setPreviousScene] = useState<SceneId | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback((sceneId: SceneId) => {
    if (sceneId === currentScene || isTransitioning) return;

    // Start crossfade
    setIsTransitioning(true);
    setPreviousScene(currentScene);

    // After fade-out, swap scenes, then fade-in completes
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);

    transitionTimeoutRef.current = setTimeout(() => {
      setCurrentScene(sceneId);
      // Allow the new scene to mount, then end transition
      // The actual DOM fade is driven by HoloShellRouter
      setTimeout(() => {
        setIsTransitioning(false);
        setPreviousScene(null);
      }, 50);
    }, TRANSITION_DURATION_MS);
  }, [currentScene, isTransitioning]);

  const triggerPhenomena = useCallback((phenomena: string, data?: unknown) => {
    // This is a hook for external systems (audio, haptics, HoloScript bridge)
    // In a full implementation this would emit to a bus or HoloMesh
    // For now it is a no-op placeholder that consumers can subscribe to via context extension
    console.debug('[HoloShell] phenomena trigger:', phenomena, data);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const value: HoloShellContextType = {
    currentScene,
    navigate,
    isTransitioning,
    previousScene,
    triggerPhenomena,
  };

  return (
    <HoloShellContext.Provider value={value}>
      {children}
    </HoloShellContext.Provider>
  );
};

/**
 * Primary hook for consuming HoloShell navigation and state.
 * Must be called inside a HoloShellProvider.
 */
export function useHoloShell(): HoloShellContextType {
  const ctx = useContext(HoloShellContext);
  if (!ctx) {
    throw new Error(
      'useHoloShell must be used within a HoloShellProvider. ' +
      'Wrap your app with <HoloShellProvider> from @hololand/renderer/holoshell'
    );
  }
  return ctx;
}

/** Convenience hook returning only the navigate function (for phenomena) */
export function useSceneNavigation() {
  const { navigate, currentScene, isTransitioning } = useHoloShell();
  return { navigate, currentScene, isTransitioning };
}

export default useHoloShell;
