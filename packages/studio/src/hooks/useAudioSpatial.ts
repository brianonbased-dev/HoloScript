'use client';
/**
 * useAudioSpatial — Hook for 3D spatial audio management
 */
import { useState, useCallback, useRef } from 'react';
import { AudioEngine } from '@/lib/core-stubs';

type AudioEngineInstance = InstanceType<typeof AudioEngine>;
type AudioSource = ReturnType<AudioEngineInstance['getActiveSources']>[number];
type ListenerState = ReturnType<AudioEngineInstance['getListener']>;

export interface UseAudioSpatialReturn {
  engine: AudioEngineInstance;
  sources: AudioSource[];
  listener: ListenerState;
  masterVolume: number;
  isMuted: boolean;
  activeCount: number;
  play: (
    soundId: string,
    pos: { x: number; y: number; z: number },
    opts?: { volume?: number; loop?: boolean; maxDistance?: number }
  ) => string;
  stop: (sourceId: string) => void;
  moveSource: (sourceId: string, pos: { x: number; y: number; z: number }) => void;
  moveListener: (pos: { x: number; y: number; z: number }) => void;
  setMasterVolume: (vol: number) => void;
  toggleMute: () => void;
  stopAll: () => void;
  step: (dt?: number) => void;
  playDemo: () => void;
}

export function useAudioSpatial(): UseAudioSpatialReturn {
  const engineRef = useRef(new AudioEngine());
  const [sources, setSources] = useState<AudioSource[]>([]);
  const [listener, setListener] = useState<ListenerState>({
    position: { x: 0, y: 0, z: 0 },
    forward: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  });
  const [masterVolume, setMasterVol] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const sync = useCallback(() => {
    const e = engineRef.current;
    setSources(e.getActiveSources());
    setListener(e.getListener());
  }, []);

  const play = useCallback(
    (
      soundId: string,
      pos: { x: number; y: number; z: number },
      opts: { volume?: number; loop?: boolean; maxDistance?: number } = {}
    ) => {
      const id = engineRef.current.play(soundId, {
        position: pos,
        volume: opts.volume ?? 1,
        loop: opts.loop ?? false,
        maxDistance: opts.maxDistance ?? 50,
      });
      sync();
      return id;
    },
    [sync]
  );

  const stop = useCallback(
    (sourceId: string) => {
      engineRef.current.stop(sourceId);
      sync();
    },
    [sync]
  );
  const moveSource = useCallback(
    (sourceId: string, pos: { x: number; y: number; z: number }) => {
      engineRef.current.setSourcePosition(sourceId, pos);
      sync();
    },
    [sync]
  );
  const moveListener = useCallback(
    (pos: { x: number; y: number; z: number }) => {
      engineRef.current.setListenerPosition(pos);
      sync();
    },
    [sync]
  );
  const setMasterVolume = useCallback((vol: number) => {
    engineRef.current.setMasterVolume(vol);
    setMasterVol(vol);
  }, []);
  const toggleMute = useCallback(() => {
    const m = !engineRef.current.isMuted();
    engineRef.current.setMuted(m);
    setIsMuted(m);
  }, []);
  const stopAll = useCallback(() => {
    engineRef.current.stopAll();
    sync();
  }, [sync]);
  const step = useCallback(
    (dt = 1 / 60) => {
      engineRef.current.update(dt);
      sync();
    },
    [sync]
  );

  const playDemo = useCallback(() => {
    play('ambient-forest', { x: -5, y: 0, z: -3 }, { volume: 0.6, loop: true, maxDistance: 30 });
    play('footsteps', { x: 2, y: 0, z: 1 }, { volume: 0.8, maxDistance: 10 });
    play('bird-chirp', { x: 0, y: 5, z: -8 }, { volume: 0.4, loop: true, maxDistance: 40 });
  }, [play]);

  return {
    engine: engineRef.current,
    sources,
    listener,
    masterVolume,
    isMuted,
    activeCount: sources.length,
    play,
    stop,
    moveSource,
    moveListener,
    setMasterVolume,
    toggleMute,
    stopAll,
    step,
    playDemo,
  };
}
