'use client';
/**
 * useCinematic — Hook for cinematic scene direction
 */
import { useState, useCallback, useRef } from 'react';
import {
  CinematicDirector,
  type CinematicScene, type CuePoint,
} from '@holoscript/core';

export interface UseCinematicReturn {
  director: CinematicDirector;
  activeScene: CinematicScene | null;
  isPlaying: boolean;
  elapsed: number;
  firedCues: CuePoint[];
  createDemoScene: () => void;
  play: (sceneId: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  step: (dt?: number) => void;
  reset: () => void;
}

export function useCinematic(): UseCinematicReturn {
  const dirRef = useRef(new CinematicDirector());
  const [activeScene, setActiveScene] = useState<CinematicScene | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [firedCues, setFiredCues] = useState<CuePoint[]>([]);

  const sync = useCallback(() => {
    setActiveScene(dirRef.current.getActiveScene());
    setIsPlaying(dirRef.current.isPlaying());
    setElapsed(dirRef.current.getElapsed());
    setFiredCues(dirRef.current.getFiredCues());
  }, []);

  const createDemoScene = useCallback(() => {
    dirRef.current = new CinematicDirector();
    const scene = dirRef.current.createScene('intro', 'Intro Cutscene', 5);
    dirRef.current.addActorMark('intro', { actorId: 'hero', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, animation: 'idle' });
    dirRef.current.addActorMark('intro', { actorId: 'villain', position: { x: 10, y: 0, z: -5 }, rotation: { x: 0, y: 180, z: 0 }, animation: 'menace' });
    dirRef.current.addCue('intro', { id: 'c1', time: 0, type: 'camera_cut', data: { target: 'hero' } });
    dirRef.current.addCue('intro', { id: 'c2', time: 1.5, type: 'dialogue', data: { speaker: 'hero', text: 'The time has come.' } });
    dirRef.current.addCue('intro', { id: 'c3', time: 3, type: 'camera_cut', data: { target: 'villain' } });
    dirRef.current.addCue('intro', { id: 'c4', time: 3.5, type: 'dialogue', data: { speaker: 'villain', text: 'Indeed it has.' } });
    dirRef.current.addCue('intro', { id: 'c5', time: 4.5, type: 'effect', data: { type: 'fade_to_black' } });
    sync();
  }, [sync]);

  const play = useCallback((sceneId: string) => { dirRef.current.playScene(sceneId); sync(); }, [sync]);
  const pause = useCallback(() => { dirRef.current.pause(); sync(); }, [sync]);
  const resume = useCallback(() => { dirRef.current.resume(); sync(); }, [sync]);
  const stop = useCallback(() => { dirRef.current.stop(); sync(); }, [sync]);
  const step = useCallback((dt = 0.5) => { dirRef.current.update(dt); sync(); }, [sync]);
  const reset = useCallback(() => { dirRef.current = new CinematicDirector(); sync(); }, [sync]);

  return { director: dirRef.current, activeScene, isPlaying, elapsed, firedCues, createDemoScene, play, pause, resume, stop, step, reset };
}
