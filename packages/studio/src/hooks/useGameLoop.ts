'use client';

/**
 * useGameLoop — Custom hook that drives the Play Mode game loop.
 *
 * Uses requestAnimationFrame for smooth 60fps updates.
 * Auto-starts when playState is 'playing', pauses when 'paused', stops on 'editing'.
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePlayMode } from '@/lib/stores/playModeStore';

export interface GameLoopCallbacks {
  /** Called every frame with delta time (seconds). */
  onTick?: (dt: number) => void;
  /** Called when entering play mode. */
  onPlay?: () => void;
  /** Called when play mode stops. */
  onStop?: () => void;
}

export function useGameLoop(callbacks?: GameLoopCallbacks) {
  const playState = usePlayMode((s) => s.playState);
  const tick = usePlayMode((s) => s.tick);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const loop = useCallback(
    (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 1 / 60;
      lastTimeRef.current = time;

      // Clamp dt to avoid huge jumps (e.g., tab unfocus)
      const clampedDt = Math.min(dt, 0.1);

      tick(clampedDt);
      callbacksRef.current?.onTick?.(clampedDt);

      rafRef.current = requestAnimationFrame(loop);
    },
    [tick]
  );

  useEffect(() => {
    if (playState === 'playing') {
      lastTimeRef.current = 0;
      callbacksRef.current?.onPlay?.();
      rafRef.current = requestAnimationFrame(loop);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (playState === 'editing') {
        callbacksRef.current?.onStop?.();
      }
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playState, loop]);

  return { playState };
}
