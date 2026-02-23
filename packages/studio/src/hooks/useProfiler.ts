'use client';

/**
 * useProfiler — measures per-frame timing via requestAnimationFrame.
 *
 * Collects a rolling window of frame times and derives:
 *   - fps (current)
 *   - frameMs (last frame duration)
 *   - avgFrameMs (N-frame average)
 *   - p95FrameMs (95th percentile of recent frames)
 *   - droppedFrames (frames that exceeded 33ms / below 30fps)
 *   - history: last 120 frame-ms values (2s at 60fps)
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const WINDOW = 120; // frames to keep in history

export interface ProfilerSnapshot {
  fps: number;
  frameMs: number;
  avgFrameMs: number;
  p95FrameMs: number;
  droppedFrames: number;
  history: number[];
  running: boolean;
}

const INITIAL: ProfilerSnapshot = {
  fps: 0,
  frameMs: 0,
  avgFrameMs: 0,
  p95FrameMs: 0,
  droppedFrames: 0,
  history: [],
  running: false,
};

export function useProfiler() {
  const [snap, setSnap] = useState<ProfilerSnapshot>(INITIAL);
  const rafRef = useRef<number>(0);
  const prevT = useRef<number>(0);
  const historyRef = useRef<number[]>([]);
  const droppedRef = useRef<number>(0);
  const runningRef = useRef<boolean>(false);

  const tick = useCallback((t: number) => {
    if (!runningRef.current) return;
    const delta = prevT.current ? t - prevT.current : 16.67;
    prevT.current = t;

    historyRef.current.push(delta);
    if (historyRef.current.length > WINDOW) historyRef.current.shift();
    if (delta > 33.33) droppedRef.current++;

    // Update state at ~10fps to avoid re-render flood
    if (historyRef.current.length % 6 === 0) {
      const h = [...historyRef.current];
      const avg = h.reduce((a, b) => a + b, 0) / h.length;
      const sorted = [...h].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? avg;
      setSnap({
        fps: Math.round(1000 / delta),
        frameMs: Math.round(delta * 10) / 10,
        avgFrameMs: Math.round(avg * 10) / 10,
        p95FrameMs: Math.round(p95 * 10) / 10,
        droppedFrames: droppedRef.current,
        history: h,
        running: true,
      });
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    historyRef.current = [];
    droppedRef.current = 0;
    prevT.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const stop = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setSnap((s) => ({ ...s, running: false }));
  }, []);

  const reset = useCallback(() => {
    historyRef.current = [];
    droppedRef.current = 0;
    setSnap((s) => ({ ...s, droppedFrames: 0, history: [] }));
  }, []);

  useEffect(() => () => { runningRef.current = false; cancelAnimationFrame(rafRef.current); }, []);

  return { snap, start, stop, reset };
}
