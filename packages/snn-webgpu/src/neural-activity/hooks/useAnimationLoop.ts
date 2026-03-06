/**
 * Hook for a requestAnimationFrame-based render loop.
 * Provides frame timing, start/stop control, and automatic cleanup.
 */

import { useEffect, useRef, useCallback } from 'react';

export interface AnimationFrameInfo {
  /** Time elapsed since the loop started, in seconds. */
  elapsed: number;
  /** Delta time since last frame, in seconds. */
  delta: number;
  /** Frame count since start. */
  frameCount: number;
}

export type RenderCallback = (info: AnimationFrameInfo) => void;

export interface UseAnimationLoopOptions {
  /** Whether the loop should be running. */
  enabled: boolean;
  /** Target frames per second (0 = uncapped). */
  targetFps?: number;
}

export function useAnimationLoop(
  callback: RenderCallback,
  options: UseAnimationLoopOptions,
): void {
  const { enabled, targetFps = 0 } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const frameIdRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  const loop = useCallback(
    (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
        lastTimeRef.current = timestamp;
      }

      const elapsed = (timestamp - startTimeRef.current) / 1000;
      const delta = (timestamp - lastTimeRef.current) / 1000;

      const minInterval = targetFps > 0 ? 1 / targetFps : 0;

      if (delta >= minInterval) {
        frameCountRef.current += 1;
        callbackRef.current({
          elapsed,
          delta,
          frameCount: frameCountRef.current,
        });
        lastTimeRef.current = timestamp;
      }

      frameIdRef.current = requestAnimationFrame(loop);
    },
    [targetFps],
  );

  useEffect(() => {
    if (!enabled) return;

    startTimeRef.current = 0;
    lastTimeRef.current = 0;
    frameCountRef.current = 0;
    frameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = 0;
      }
    };
  }, [enabled, loop]);
}
