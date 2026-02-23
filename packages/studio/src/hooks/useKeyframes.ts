'use client';

/**
 * useKeyframes — keyframe playback and editing for the animation timeline.
 * Syncs with /api/keyframes via fetch.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface Keyframe {
  id: string;
  track: string;
  time: number;
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface AnimTrack {
  id: string;
  sceneId: string;
  name: string;
  property: string;
  objectName: string;
  keyframes: Keyframe[];
}

export type PlayState = 'stopped' | 'playing' | 'paused';

export function useKeyframes(sceneId = 'default') {
  const [tracks, setTracks] = useState<AnimTrack[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playState, setPlayState] = useState<PlayState>('stopped');
  const [duration, setDuration] = useState(10);   // seconds total timeline
  const [loading, setLoading] = useState(false);
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/keyframes?sceneId=${sceneId}`);
      const d = (await res.json()) as { tracks: AnimTrack[] };
      setTracks(d.tracks);
      // Compute duration from max keyframe time
      const max = d.tracks.flatMap((t) => t.keyframes.map((k) => k.time)).reduce((m, v) => Math.max(m, v), 5);
      setDuration(Math.max(10, max + 2));
    } catch { /**/ }
    finally { setLoading(false); }
  }, [sceneId]);

  useEffect(() => { load(); }, [load]);

  // RAF playback loop
  const tick = useCallback((ts: number) => {
    const delta = lastTRef.current ? (ts - lastTRef.current) / 1000 : 0;
    lastTRef.current = ts;
    setCurrentTime((t) => {
      const next = t + delta;
      if (next >= duration) { setPlayState('stopped'); return 0; }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  }, [duration]);

  const play = useCallback(() => {
    setPlayState('playing');
    lastTRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPlayState('paused');
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPlayState('stopped');
    setCurrentTime(0);
  }, []);

  const scrub = useCallback((t: number) => {
    if (playState === 'playing') { cancelAnimationFrame(rafRef.current); setPlayState('paused'); }
    setCurrentTime(Math.max(0, Math.min(t, duration)));
  }, [playState, duration]);

  const addKeyframe = useCallback(async (objectName: string, property: string, time: number, value: number) => {
    const res = await fetch('/api/keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneId, objectName, property, time, value }),
    });
    const d = (await res.json()) as { track: AnimTrack };
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === d.track.id);
      return idx >= 0 ? prev.map((t, i) => i === idx ? d.track : t) : [...prev, d.track];
    });
  }, [sceneId]);

  const deleteKeyframe = useCallback(async (kfId: string) => {
    await fetch(`/api/keyframes?id=${kfId}&sceneId=${sceneId}`, { method: 'DELETE' });
    setTracks((prev) => prev.map((t) => ({ ...t, keyframes: t.keyframes.filter((k) => k.id !== kfId) })));
  }, [sceneId]);

  // Evaluate value of a track at current time (linear interp)
  const evaluate = useCallback((trackId: string): number | null => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track || track.keyframes.length === 0) return null;
    const kfs = track.keyframes;
    if (currentTime <= kfs[0]!.time) return kfs[0]!.value;
    if (currentTime >= kfs[kfs.length - 1]!.time) return kfs[kfs.length - 1]!.value;
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i]!; const b = kfs[i + 1]!;
      if (currentTime >= a.time && currentTime <= b.time) {
        const t = (currentTime - a.time) / (b.time - a.time);
        return a.value + (b.value - a.value) * t;
      }
    }
    return null;
  }, [tracks, currentTime]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  return { tracks, currentTime, playState, duration, loading, setDuration, play, pause, stop, scrub, addKeyframe, deleteKeyframe, evaluate, reload: load };
}
