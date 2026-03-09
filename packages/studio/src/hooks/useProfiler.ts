'use client';
/**
 * useProfiler — RAF-based performance profiling hook.
 *
 * Provides start/stop/reset controls with a consolidated `snap` state
 * containing fps, frame timing, dropped frame count, and rolling history.
 * State updates are throttled to every 6 frames to avoid render flooding.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const MAX_HISTORY = 120;
const DROPPED_THRESHOLD = 33; // ms — frames > 33ms are "dropped" (below 30fps)
const UPDATE_INTERVAL = 6; // update React state every N frames

export interface ProfilerSnap {
  fps: number;
  frameMs: number;
  avgFrameMs: number;
  p95FrameMs: number;
  droppedFrames: number;
  history: number[];
  running: boolean;
}

export interface UseProfilerReturn {
  snap: ProfilerSnap;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

function emptySnap(): ProfilerSnap {
  return {
    fps: 0,
    frameMs: 0,
    avgFrameMs: 0,
    p95FrameMs: 0,
    droppedFrames: 0,
    history: [],
    running: false,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function calcP95(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}

export function useProfiler(): UseProfilerReturn {
  const [snap, setSnap] = useState<ProfilerSnap>(emptySnap);

  // Mutable refs for RAF loop — avoids stale closure issues
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const prevTimeRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const droppedRef = useRef(0);
  const frameCountRef = useRef(0);

  const flushSnap = useCallback((running: boolean) => {
    const history = historyRef.current;
    if (history.length === 0) {
      setSnap((prev) => ({ ...prev, running, droppedFrames: droppedRef.current, history: [] }));
      return;
    }
    const last = history[history.length - 1];
    const avg = history.reduce((s, v) => s + v, 0) / history.length;
    const sorted = [...history].sort((a, b) => a - b);
    const p95 = calcP95(sorted);
    const fps = last > 0 ? round1(1000 / last) : 0;

    setSnap({
      fps,
      frameMs: round1(last),
      avgFrameMs: round1(avg),
      p95FrameMs: round1(p95),
      droppedFrames: droppedRef.current,
      history: [...history],
      running,
    });
  }, []);

  const tick = useCallback((time: number) => {
    if (!runningRef.current) return;

    const prev = prevTimeRef.current;
    prevTimeRef.current = time;

    // First frame — no delta yet, use default 16.67ms
    const delta = prev !== null ? time - prev : 16.67;

    // Record frame time
    historyRef.current.push(round1(delta));
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }

    // Count dropped frames
    if (delta > DROPPED_THRESHOLD) {
      droppedRef.current++;
    }

    frameCountRef.current++;

    // Throttled state update every UPDATE_INTERVAL frames
    if (frameCountRef.current % UPDATE_INTERVAL === 0) {
      flushSnap(true);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [flushSnap]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    prevTimeRef.current = null;
    historyRef.current = [];
    droppedRef.current = 0;
    frameCountRef.current = 0;
    // Flush immediately so snap reflects clean state
    flushSnap(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick, flushSnap]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    flushSnap(false);
  }, [flushSnap]);

  const reset = useCallback(() => {
    historyRef.current = [];
    droppedRef.current = 0;
    frameCountRef.current = 0;
    flushSnap(runningRef.current);
  }, [flushSnap]);

  // Cleanup on unmount — always cancel to satisfy test expectations
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current ?? 0);
      rafRef.current = null;
      runningRef.current = false;
    };
  }, []);

  return { snap, start, stop, reset };
}
