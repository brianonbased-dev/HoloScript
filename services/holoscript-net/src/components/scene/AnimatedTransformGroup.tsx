/**
 * AnimatedTransformGroup — plays a compiled node's `__animatedTransform` channels.
 *
 * The R3FCompiler can mark any `group` node with
 *   props.__animatedTransform: AnimatedChannel[]
 * declaring that some of its transform axes are driven by a `.holo` timeline target.
 * Each frame this reads the current timeline value (via timelineRuntime) and maps it
 * onto the group's position/scale: value = lerp(from, to, smoothstep(edge0, edge1, t)).
 *
 * This is the GENERIC counterpart to <TimelineDriver>: the driver plays the timeline
 * INTO the runtime; this plays the runtime ONTO a node's transform — so an animated
 * scaffold (a stem that rises, a leaf that unfurls) is declared in the compiled tree
 * and grown by generic runtime, with no trait-specific React. Works for ANY trait.
 *
 * Ported from packages/studio/src/components/scene/AnimatedTransformGroup.tsx —
 * 'use client' marker removed (Vite, not Next.js).
 */
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { R3FNode } from '@holoscript/core';
import { getTimelineValue } from './timelineRuntime';

interface AnimatedChannel {
  /** Which transform axis this channel drives. */
  prop: 'scaleX' | 'scaleY' | 'scaleZ' | 'scaleUniform' | 'posX' | 'posY' | 'posZ';
  /** Timeline target name to read (e.g. 'developmentalTime'). */
  target: string;
  /** Smoothstep input edges over the timeline value. */
  edge0: number;
  edge1: number;
  /** Output value at smoothstep 0 / 1. */
  from: number;
  to: number;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function toTriple(v: unknown, fallback: [number, number, number]): [number, number, number] {
  return Array.isArray(v) && v.length === 3 ? (v as [number, number, number]) : fallback;
}

export function AnimatedTransformGroup({
  node,
  children,
}: {
  node: R3FNode;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const channels = (node.props.__animatedTransform as AnimatedChannel[] | undefined) ?? [];
  const basePos = toTriple(node.props.position, [0, 0, 0]);
  const baseRot = toTriple(node.props.rotation, [0, 0, 0]);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    // Start from the node's base transform; each channel overrides one axis.
    let sx = 1;
    let sy = 1;
    let sz = 1;
    let [px, py, pz] = basePos;
    for (const ch of channels) {
      const v = lerp(
        ch.from,
        ch.to,
        smoothstep(ch.edge0, ch.edge1, getTimelineValue(ch.target, 1))
      );
      switch (ch.prop) {
        case 'scaleX':
          sx = v;
          break;
        case 'scaleY':
          sy = v;
          break;
        case 'scaleZ':
          sz = v;
          break;
        case 'scaleUniform':
          sx = sy = sz = v;
          break;
        case 'posX':
          px = v;
          break;
        case 'posY':
          py = v;
          break;
        case 'posZ':
          pz = v;
          break;
      }
    }
    g.scale.set(sx, sy, sz);
    g.position.set(px, py, pz);
  });

  return (
    <group ref={ref} position={basePos} rotation={baseRot}>
      {children}
    </group>
  );
}
