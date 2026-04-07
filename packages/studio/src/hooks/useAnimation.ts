'use client';
/**
 * useAnimation — Hook for animation timeline editing and playback
 */
import { useState, useCallback, useRef } from 'react';
import { AnimationEngine, Easing } from '@/lib/core-stubs';

type AnimationEngineInstance = InstanceType<typeof AnimationEngine>;
type AnimationClip = Parameters<AnimationEngineInstance['play']>[0];
type EasingFn = typeof Easing.linear;

export interface AnimationInfo {
  id: string;
  elapsed: number;
  isPlaying: boolean;
  isPaused: boolean;
  loop: boolean;
  duration: number;
}

const EASING_NAMES: [string, EasingFn][] = [
  ['linear', Easing.linear],
  ['easeInQuad', Easing.easeInQuad],
  ['easeOutQuad', Easing.easeOutQuad],
  ['easeInOutQuad', Easing.easeInOutQuad],
  ['easeInCubic', Easing.easeInCubic],
  ['easeOutCubic', Easing.easeOutCubic],
  ['easeOutBack', Easing.easeOutBack],
  ['easeOutElastic', Easing.easeOutElastic],
  ['easeOutBounce', Easing.easeOutBounce],
];

export interface UseAnimationReturn {
  engine: AnimationEngineInstance;
  animations: AnimationInfo[];
  easingFunctions: string[];
  isRunning: boolean;
  play: (clip: AnimationClip) => void;
  stop: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  clear: () => void;
  playDemo: (easing?: string) => void;
  startLoop: () => void;
  stopLoop: () => void;
  step: (dt?: number) => void;
}

export function useAnimation(): UseAnimationReturn {
  const engineRef = useRef(new AnimationEngine());
  const [animations, setAnimations] = useState<AnimationInfo[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const rafRef = useRef<number>(0);
  const lastRef = useRef(0);
  const valuesRef = useRef<Record<string, number>>({});

  const sync = useCallback(() => {
    const ids = engineRef.current.getActiveIds();
    // access internal state through active IDs
    setAnimations(
      ids.map((id: string) => ({
        id,
        elapsed: 0,
        isPlaying: true,
        isPaused: false,
        loop: false,
        duration: 0,
      }))
    );
  }, []);

  const play = useCallback(
    (clip: AnimationClip) => {
      engineRef.current.play(clip, (v: number) => {
        valuesRef.current[clip.id] = v;
      });
      sync();
    },
    [sync]
  );

  const stop = useCallback(
    (id: string) => {
      engineRef.current.stop(id);
      sync();
    },
    [sync]
  );
  const pause = useCallback(
    (id: string) => {
      engineRef.current.pause(id);
      sync();
    },
    [sync]
  );
  const resume = useCallback(
    (id: string) => {
      engineRef.current.resume(id);
      sync();
    },
    [sync]
  );
  const clear = useCallback(() => {
    engineRef.current.clear();
    sync();
  }, [sync]);

  const step = useCallback(
    (dt = 1 / 60) => {
      engineRef.current.update(dt);
      sync();
    },
    [sync]
  );

  const playDemo = useCallback(
    (easingName = 'easeOutBounce') => {
      const fn = EASING_NAMES.find(([n]) => n === easingName)?.[1] || Easing['easeOutBounce'];
      const clip: AnimationClip = {
        id: `demo-${Date.now()}`,
        property: 'position.y',
        duration: 2,
        loop: false,
        pingPong: false,
        delay: 0,
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 5, easing: fn },
          { time: 2, value: 0, easing: fn },
        ],
      };
      play(clip);
    },
    [play]
  );

  const loop = useCallback(
    (t: number) => {
      const dt = lastRef.current ? (t - lastRef.current) / 1000 : 1 / 60;
      lastRef.current = t;
      step(Math.min(dt, 0.05));
      rafRef.current = requestAnimationFrame(loop);
    },
    [step]
  );

  const startLoop = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    lastRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [isRunning, loop]);
  const stopLoop = useCallback(() => {
    setIsRunning(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  return {
    engine: engineRef.current,
    animations,
    easingFunctions: EASING_NAMES.map(([n]) => n),
    isRunning,
    play,
    stop,
    pause,
    resume,
    clear,
    playDemo,
    startLoop,
    stopLoop,
    step,
  };
}
