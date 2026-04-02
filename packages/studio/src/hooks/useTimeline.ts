// @ts-nocheck
'use client';
/**
 * useTimeline — Hook for animation timeline orchestration
 */
import { useState, useCallback, useRef } from 'react';
import { Timeline, AnimationEngine, Easing } from '@holoscript/core';

export interface UseTimelineReturn {
  progress: number;
  elapsed: number;
  duration: number;
  isPlaying: boolean;
  entries: number;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  tick: (dt?: number) => void;
  buildDemo: () => void;
  reset: () => void;
}

export function useTimeline(): UseTimelineReturn {
  const tl = useRef(new Timeline({ mode: 'sequential' }));
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [entries, setEntries] = useState(0);

  const sync = useCallback(() => {
    setProgress(tl.current.getProgress());
    setElapsed(tl.current.getElapsed());
    setDuration(tl.current.getDuration());
  }, []);

  const play = useCallback(() => {
    tl.current.play();
    setIsPlaying(true);
    sync();
  }, [sync]);
  const pause = useCallback(() => {
    tl.current.pause();
    setIsPlaying(false);
  }, []);
  const resume = useCallback(() => {
    tl.current.resume();
    setIsPlaying(true);
  }, []);
  const stop = useCallback(() => {
    tl.current.stop();
    setIsPlaying(false);
    sync();
  }, [sync]);
  const tick = useCallback(
    (dt = 0.1) => {
      tl.current.update(dt);
      sync();
    },
    [sync]
  );

  const buildDemo = useCallback(() => {
    tl.current = new Timeline({ mode: 'sequential', loop: true, loopCount: -1 });
    const clips = [
      {
        id: 'fade-in',
        property: 'opacity',
        from: 0,
        to: 1,
        duration: 500,
        easing: Easing.easeInOutQuad,
      },
      { id: 'slide-x', property: 'x', from: 0, to: 100, duration: 800, easing: Easing.easeOutQuad },
      {
        id: 'scale-up',
        property: 'scale',
        from: 0.5,
        to: 1.5,
        duration: 600,
        easing: Easing.easeInOutQuad,
      },
      {
        id: 'color-shift',
        property: 'hue',
        from: 0,
        to: 360,
        duration: 1000,
        easing: Easing.linear,
      },
    ];
    for (const clip of clips) {
      tl.current.add(clip, () => {});
    }
    setEntries(clips.length);
    sync();
  }, [sync]);

  const reset = useCallback(() => {
    tl.current = new Timeline({ mode: 'sequential' });
    setEntries(0);
    setIsPlaying(false);
    sync();
  }, [sync]);

  return {
    progress,
    elapsed,
    duration,
    isPlaying,
    entries,
    play,
    pause,
    resume,
    stop,
    tick,
    buildDemo,
    reset,
  };
}
