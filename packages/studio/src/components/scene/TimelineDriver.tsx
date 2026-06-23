'use client';

/**
 * TimelineDriver — plays a compiled `.holo` `timeline` block.
 *
 * The R3FCompiler turns
 *   timeline Bloom {
 *     autoplay: true
 *     0.0: animate "developmentalTime" { value: 0.0 }
 *     7.0: animate "developmentalTime" { value: 1.0 }
 *   }
 * into a `Timeline` node whose children are `TimelineEntry` nodes
 * ({ time, actionKind:'animate', target, properties:{ value } }). This component
 * reads those entries, builds a keyframe track per animated target, and writes the
 * interpolated current value into the shared timelineRuntime every frame. It renders
 * nothing — it is the runtime that PLAYS declared animation onto compiled meshes,
 * which is why the growth no longer needs a hand-authored clock in the mesh.
 *
 * Generic by construction: any trait that emits `animate "<uniform>"` keyframes is
 * driven here, not just the lotus.
 */
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { sampleTrack, type R3FNode, type SampledKeyframe } from '@holoscript/core';
import { setTimelineValue, clearTimelineValue } from './timelineRuntime';

/** Core sampler keeps legacy smoothstep defaults while honoring per-keyframe easing. */
export function TimelineDriver({ node }: { node: R3FNode }) {
  const autoplay = node.props.autoplay !== false; // default true
  const loop = node.props.loop === true;

  // Build one sorted keyframe track per animated target from the TimelineEntry children.
  const tracks = useMemo(() => {
    const byTarget = new Map<string, SampledKeyframe[]>();
    for (const child of node.children ?? []) {
      const p = child.props;
      if (p.actionKind !== 'animate' || typeof p.target !== 'string') continue;
      const props = (p.properties ?? {}) as Record<string, unknown>;
      const value = typeof props.value === 'number' ? props.value : Number(props.value);
      if (!Number.isFinite(value)) continue;
      const t = typeof p.time === 'number' ? p.time : Number(p.time);
      if (!Number.isFinite(t)) continue;
      const arr = byTarget.get(p.target) ?? [];
      arr.push({ time: t, value, ...(typeof p.easing === 'string' ? { easing: p.easing } : {}) });
      byTarget.set(p.target, arr);
    }
    for (const arr of byTarget.values()) arr.sort((a, b) => a.time - b.time);
    return byTarget;
  }, [node]);

  const duration = useMemo(() => {
    let d = 0;
    for (const arr of tracks.values()) if (arr.length) d = Math.max(d, arr[arr.length - 1].time);
    return d;
  }, [tracks]);

  const startRef = useRef<number | null>(null);

  // On unmount, drop the targets so a stale held value can't pin a later scene.
  useEffect(() => {
    const targets = Array.from(tracks.keys());
    return () => targets.forEach(clearTimelineValue);
  }, [tracks]);

  useFrame((state) => {
    if (!autoplay) {
      // Paused at t=0: publish the initial keyframe so consumers have a defined value.
      for (const [target, track] of tracks) setTimelineValue(target, sampleTrack(track, 0, 'smoothstep'));
      return;
    }
    const now = state.clock.elapsedTime;
    if (startRef.current === null) startRef.current = now;
    let playhead = now - startRef.current;
    if (loop && duration > 0) playhead %= duration;
    for (const [target, track] of tracks) setTimelineValue(target, sampleTrack(track, playhead, 'smoothstep'));
  });

  return null;
}
