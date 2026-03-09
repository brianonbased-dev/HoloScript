/**
 * Hook for managing SNN simulation data: snapshot buffering,
 * time window tracking, and playback control.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { SNNSnapshot, TimeWindow, PlaybackState, SpikeEvent } from '../types';

export interface UseNeuralDataOptions {
  /** Duration of the visible time window in ms. */
  timeWindowDurationMs?: number;
  /** Initial playback speed multiplier. */
  initialSpeed?: number;
  /** Maximum number of snapshots to buffer. */
  maxBufferSize?: number;
}

export interface UseNeuralDataResult {
  /** Current snapshot for rendering. */
  currentSnapshot: SNNSnapshot | null;
  /** All spike events within the visible time window. */
  visibleSpikes: SpikeEvent[];
  /** Current time window. */
  timeWindow: TimeWindow;
  /** Playback state. */
  playback: PlaybackState;
  /** Push a new snapshot from the SNN engine. */
  pushSnapshot: (snapshot: SNNSnapshot) => void;
  /** Set playback playing state. */
  setPlaying: (playing: boolean) => void;
  /** Set playback speed. */
  setSpeed: (speed: number) => void;
  /** Seek to a specific time. */
  seekTo: (timeMs: number) => void;
  /** Set the time window duration. */
  setTimeWindowDuration: (durationMs: number) => void;
  /** All buffered snapshots. */
  snapshotBuffer: SNNSnapshot[];
}

export function useNeuralData(options: UseNeuralDataOptions = {}): UseNeuralDataResult {
  const { timeWindowDurationMs = 1000, initialSpeed = 1.0, maxBufferSize = 1000 } = options;

  const [snapshotBuffer, setSnapshotBuffer] = useState<SNNSnapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    speed: initialSpeed,
    currentTimeMs: 0,
  });
  const [windowDuration, setWindowDuration] = useState(timeWindowDurationMs);

  const bufferRef = useRef<SNNSnapshot[]>([]);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushSnapshot = useCallback(
    (snapshot: SNNSnapshot) => {
      bufferRef.current = [...bufferRef.current, snapshot].slice(-maxBufferSize);
      setSnapshotBuffer([...bufferRef.current]);

      if (playback.isPlaying || bufferRef.current.length === 1) {
        setCurrentIndex(bufferRef.current.length - 1);
        setPlayback((prev) => ({
          ...prev,
          currentTimeMs: snapshot.timeMs,
        }));
      }
    },
    [maxBufferSize, playback.isPlaying]
  );

  const setPlaying = useCallback((playing: boolean) => {
    setPlayback((prev) => ({ ...prev, isPlaying: playing }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setPlayback((prev) => ({ ...prev, speed: Math.max(0.1, Math.min(10, speed)) }));
  }, []);

  const seekTo = useCallback((timeMs: number) => {
    const buffer = bufferRef.current;
    if (buffer.length === 0) return;

    // Find the closest snapshot to the requested time
    let closestIdx = 0;
    let closestDist = Math.abs(buffer[0].timeMs - timeMs);
    for (let i = 1; i < buffer.length; i++) {
      const dist = Math.abs(buffer[i].timeMs - timeMs);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    setCurrentIndex(closestIdx);
    setPlayback((prev) => ({
      ...prev,
      currentTimeMs: buffer[closestIdx].timeMs,
    }));
  }, []);

  const setTimeWindowDuration = useCallback((durationMs: number) => {
    setWindowDuration(Math.max(100, durationMs));
  }, []);

  // Playback timer: advance through buffered snapshots
  useEffect(() => {
    if (playback.isPlaying && snapshotBuffer.length > 0) {
      const intervalMs = 16 / playback.speed; // ~60fps adjusted by speed
      playbackTimerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= bufferRef.current.length) {
            // Pause at end
            setPlayback((p) => ({ ...p, isPlaying: false }));
            return prev;
          }
          setPlayback((p) => ({
            ...p,
            currentTimeMs: bufferRef.current[next]?.timeMs ?? p.currentTimeMs,
          }));
          return next;
        });
      }, intervalMs);
    }

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [playback.isPlaying, playback.speed, snapshotBuffer.length]);

  const currentSnapshot =
    currentIndex >= 0 && currentIndex < snapshotBuffer.length ? snapshotBuffer[currentIndex] : null;

  const timeWindow: TimeWindow = {
    startMs: playback.currentTimeMs - windowDuration,
    endMs: playback.currentTimeMs,
    durationMs: windowDuration,
  };

  // Gather all spikes in the visible time window from buffered snapshots
  const visibleSpikes: SpikeEvent[] = [];
  for (const snap of snapshotBuffer) {
    if (snap.timeMs >= timeWindow.startMs && snap.timeMs <= timeWindow.endMs) {
      visibleSpikes.push(...snap.spikes);
    }
  }

  return {
    currentSnapshot,
    visibleSpikes,
    timeWindow,
    playback,
    pushSnapshot,
    setPlaying,
    setSpeed,
    seekTo,
    setTimeWindowDuration,
    snapshotBuffer,
  };
}
