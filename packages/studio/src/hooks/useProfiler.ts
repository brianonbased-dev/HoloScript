'use client';
/**
 * useProfiler — Hook for runtime performance profiling
 */
import { useState, useCallback, useRef } from 'react';
import { Profiler, type ProfileSummary, type MemorySnapshot } from '@holoscript/core';

export interface UseProfilerReturn {
  profiler: Profiler;
  fps: number;
  frameCount: number;
  summaries: ProfileSummary[];
  slowest: ProfileSummary[];
  memory: MemorySnapshot[];
  enabled: boolean;
  simulateFrames: (count?: number) => void;
  takeSnapshot: (label?: string) => void;
  toggleEnabled: () => void;
  reset: () => void;
}

export function useProfiler(): UseProfilerReturn {
  const profRef = useRef(new Profiler());
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [summaries, setSummaries] = useState<ProfileSummary[]>([]);
  const [slowest, setSlowest] = useState<ProfileSummary[]>([]);
  const [memory, setMemory] = useState<MemorySnapshot[]>([]);
  const [enabled, setEnabled] = useState(true);

  const sync = useCallback(() => {
    setFps(profRef.current.getAverageFPS());
    setFrameCount(profRef.current.getFrameHistory().length);
    setSummaries(profRef.current.getAllSummaries());
    setSlowest(profRef.current.getSlowestScopes(5));
    setMemory(profRef.current.getMemorySnapshots());
  }, []);

  const simulateFrames = useCallback(
    (count = 10) => {
      const systems = ['Physics', 'Rendering', 'AI', 'Audio', 'Particles', 'Network'];
      for (let i = 0; i < count; i++) {
        profRef.current.beginFrame();
        for (const sys of systems) {
          profRef.current.beginScope(sys);
          // Simulate work
          const start = performance.now();
          while (performance.now() - start < Math.random() * 2) {
            /* spin */
          }
          profRef.current.endScope();
        }
        profRef.current.endFrame();
      }
      sync();
    },
    [sync]
  );

  const takeSnapshot = useCallback(
    (label = 'Manual') => {
      profRef.current.takeMemorySnapshot(label);
      sync();
    },
    [sync]
  );
  const toggleEnabled = useCallback(() => {
    const next = !profRef.current.isEnabled();
    profRef.current.setEnabled(next);
    setEnabled(next);
  }, []);
  const reset = useCallback(() => {
    profRef.current.reset();
    sync();
  }, [sync]);

  return {
    profiler: profRef.current,
    fps,
    frameCount,
    summaries,
    slowest,
    memory,
    enabled,
    simulateFrames,
    takeSnapshot,
    toggleEnabled,
    reset,
  };
}
