/**
 * usePerformanceRegression — React/R3F hook for VR frame time monitoring.
 *
 * Wraps the core PerformanceRegressionMonitor in a useFrame loop.
 * When frame times exceed the threshold for consecutive frames,
 * `isRegressed` flips to true — signaling the scene to switch
 * entities to draft mode for cheaper rendering.
 *
 * For VR at 90Hz, the frame budget is 11.1ms. Default threshold
 * is 9ms, leaving 2ms for compositor and OS overhead.
 *
 * Usage:
 * ```tsx
 * function Scene({ nodes }: { nodes: R3FNode[] }) {
 *   const { isRegressed, avgFrameTimeMs } = usePerformanceRegression();
 *   return nodes.map(n =>
 *     isRegressed ? <DraftMeshNode ... /> : <MeshNode node={n} />
 *   );
 * }
 * ```
 *
 * @see W.080 — Draft primitives are cheapest rendering AND collision
 * @see P.084 — VR Performance Regression Pattern
 */

import { useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  PerformanceRegressionMonitor,
  type PerformanceRegressionConfig,
  type PerformanceRegressionState,
} from '@holoscript/core';

export interface UsePerformanceRegressionOptions {
  /** Frame time threshold in ms (default: 9.0 for 90Hz VR) */
  thresholdMs?: number;
  /** Consecutive bad frames before regression (default: 5) */
  consecutiveFrames?: number;
  /** Consecutive good frames before recovery (default: 30) */
  recoveryFrames?: number;
  /** Recovery threshold in ms (default: 7.0) */
  recoveryThresholdMs?: number;
  /** Enable/disable monitoring (default: true) */
  enabled?: boolean;
  /** Called when regression state changes */
  onRegression?: (regressed: boolean) => void;
}

export interface UsePerformanceRegressionResult {
  /** Whether the scene is currently in regression mode */
  isRegressed: boolean;
  /** Current rolling average frame time in ms */
  avgFrameTimeMs: number;
  /** Total regression events since mount */
  regressionCount: number;
  /** Total recovery events since mount */
  recoveryCount: number;
  /** Force regression (e.g., user-triggered draft mode) */
  forceRegress: () => void;
  /** Force recovery */
  forceRecover: () => void;
  /** Reset all monitoring state */
  reset: () => void;
}

/**
 * Hook that monitors frame performance via R3F's useFrame and triggers
 * regression/recovery based on frame time thresholds.
 */
export function usePerformanceRegression(
  options: UsePerformanceRegressionOptions = {}
): UsePerformanceRegressionResult {
  const monitorRef = useRef<PerformanceRegressionMonitor | null>(null);
  const stateRef = useRef<PerformanceRegressionState>({
    avgFrameTimeMs: 0,
    isRegressed: false,
    aboveCount: 0,
    belowCount: 0,
    regressionCount: 0,
    recoveryCount: 0,
  });
  const prevRegressedRef = useRef(false);
  const onRegressionRef = useRef(options.onRegression);
  onRegressionRef.current = options.onRegression;

  // Lazy-init monitor (avoids re-creating on every render)
  if (!monitorRef.current) {
    const config: Partial<PerformanceRegressionConfig> = {};
    if (options.thresholdMs !== undefined) config.thresholdMs = options.thresholdMs;
    if (options.consecutiveFrames !== undefined)
      config.consecutiveFrames = options.consecutiveFrames;
    if (options.recoveryFrames !== undefined) config.recoveryFrames = options.recoveryFrames;
    if (options.recoveryThresholdMs !== undefined)
      config.recoveryThresholdMs = options.recoveryThresholdMs;
    if (options.enabled !== undefined) config.enabled = options.enabled;
    monitorRef.current = new PerformanceRegressionMonitor(config);
  }

  // Tick monitor in R3F's render loop
  useFrame((_state, delta) => {
    const monitor = monitorRef.current;
    if (!monitor) return;

    // delta is in seconds, monitor expects milliseconds
    const deltaMs = delta * 1000;
    const newState = monitor.tick(deltaMs);
    stateRef.current = newState;

    // Fire callback on state transitions
    if (newState.isRegressed !== prevRegressedRef.current) {
      prevRegressedRef.current = newState.isRegressed;
      onRegressionRef.current?.(newState.isRegressed);
    }
  });

  const forceRegress = useCallback(() => {
    monitorRef.current?.forceRegress();
  }, []);

  const forceRecover = useCallback(() => {
    monitorRef.current?.forceRecover();
  }, []);

  const reset = useCallback(() => {
    monitorRef.current?.reset();
    prevRegressedRef.current = false;
  }, []);

  // Return latest state (stateRef is mutated each frame for zero-alloc reads)
  const s = stateRef.current;
  return {
    isRegressed: s.isRegressed,
    avgFrameTimeMs: s.avgFrameTimeMs,
    regressionCount: s.regressionCount,
    recoveryCount: s.recoveryCount,
    forceRegress,
    forceRecover,
    reset,
  };
}
