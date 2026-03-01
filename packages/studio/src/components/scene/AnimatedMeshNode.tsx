'use client';

/**
 * AnimatedMeshNode — Renders a mesh with real-time keyframe animation.
 *
 * Uses Three.js useFrame to interpolate position/rotation/scale/color/opacity
 * between keyframe stops at 60fps. Handles multiple named keyframe sequences
 * and supports easing functions.
 *
 * Keyframe data format (from parser → WASM bridge):
 *   {
 *     name: "rotate",
 *     stops: [{ percent: 0, rotation: [0,0,0] }, { percent: 100, rotation: [0,360,0] }],
 *     duration: 2000,
 *     easing: "ease-in-out",
 *     loop: true,
 *   }
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { R3FNode } from '@holoscript/core';
import { MATERIAL_PRESETS } from '@holoscript/core';
import { useEditorStore, useSceneGraphStore } from '@/lib/store';
import { useBuilderStore } from '@/lib/stores/builderStore';
import * as THREE from 'three';

// ── Easing Functions ─────────────────────────────────────────────────────────

function easeLinear(t: number): number { return t; }
function easeInOut(t: number): number { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function easeIn(t: number): number { return t * t; }
function easeOut(t: number): number { return t * (2 - t); }
function easeInCubic(t: number): number { return t * t * t; }
function easeOutCubic(t: number): number { return (--t) * t * t + 1; }
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

function getEasingFn(name: string): (t: number) => number {
  switch (name) {
    case 'ease-in':       return easeIn;
    case 'ease-out':      return easeOut;
    case 'ease-in-out':   return easeInOut;
    case 'ease-in-cubic': return easeInCubic;
    case 'ease-out-cubic': return easeOutCubic;
    case 'ease-in-out-cubic': return easeInOutCubic;
    default:              return easeLinear;
  }
}

// ── Keyframe Types ───────────────────────────────────────────────────────────

interface KeyframeStop {
  percent: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  color?: string;
  opacity?: number;
}

interface KeyframeSequence {
  name: string;
  stops: KeyframeStop[];
  duration: number;
  easing: string;
  loop: boolean;
}

// ── Interpolation ────────────────────────────────────────────────────────────

function lerpVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function interpolateAtPercent(stops: KeyframeStop[], percent: number): KeyframeStop {
  if (stops.length === 0) return { percent: 0 };
  if (stops.length === 1) return stops[0];

  // Sort by percent
  const sorted = [...stops].sort((a, b) => a.percent - b.percent);

  // Clamp
  if (percent <= sorted[0].percent) return sorted[0];
  if (percent >= sorted[sorted.length - 1].percent) return sorted[sorted.length - 1];

  // Find bounding stops
  let lower = sorted[0];
  let upper = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (percent >= sorted[i].percent && percent <= sorted[i + 1].percent) {
      lower = sorted[i];
      upper = sorted[i + 1];
      break;
    }
  }

  const range = upper.percent - lower.percent;
  const localT = range > 0 ? (percent - lower.percent) / range : 0;

  const result: KeyframeStop = { percent };

  if (lower.position && upper.position) {
    result.position = lerpVec3(lower.position, upper.position, localT);
  } else if (lower.position) {
    result.position = lower.position;
  }

  if (lower.rotation && upper.rotation) {
    result.rotation = lerpVec3(lower.rotation, upper.rotation, localT);
  } else if (lower.rotation) {
    result.rotation = lower.rotation;
  }

  if (lower.scale && upper.scale) {
    const ls = typeof lower.scale === 'number' ? [lower.scale, lower.scale, lower.scale] as [number,number,number] : lower.scale;
    const us = typeof upper.scale === 'number' ? [upper.scale, upper.scale, upper.scale] as [number,number,number] : upper.scale;
    result.scale = lerpVec3(ls, us, localT);
  } else if (lower.scale) {
    result.scale = lower.scale;
  }

  if (lower.opacity !== undefined && upper.opacity !== undefined) {
    result.opacity = lower.opacity + (upper.opacity - lower.opacity) * localT;
  }

  return result;
}

// ── Geometry Helper ──────────────────────────────────────────────────────────

function getGeometry(hsType: string, size: number) {
  const s = size || 1;
  switch (hsType) {
    case 'sphere': case 'orb':
      return <sphereGeometry args={[s * 0.5, 32, 32]} />;
    case 'cube': case 'box':
      return <boxGeometry args={[s, s, s]} />;
    case 'cylinder':
      return <cylinderGeometry args={[s * 0.5, s * 0.5, s, 32]} />;
    case 'pyramid': case 'cone':
      return <coneGeometry args={[s * 0.5, s, 4]} />;
    case 'plane':
      return <planeGeometry args={[s, s]} />;
    case 'torus':
      return <torusGeometry args={[s * 0.5, s * 0.15, 16, 32]} />;
    case 'ring':
      return <ringGeometry args={[s * 0.3, s * 0.5, 32]} />;
    case 'capsule':
      return <capsuleGeometry args={[s * 0.3, s * 0.5, 4, 16]} />;
    default:
      return <boxGeometry args={[s, s, s]} />;
  }
}

// ── Material Helper ──────────────────────────────────────────────────────────

function getMaterialProps(node: R3FNode) {
  const props = node.props;
  const materialName = props.material || props.materialPreset;
  const preset = materialName
    ? (MATERIAL_PRESETS as Record<string, Record<string, any>>)[materialName]
    : undefined;

  const matProps: Record<string, any> = { ...(preset || {}) };
  if (props.color) matProps.color = props.color;
  if (props.emissive) matProps.emissive = props.emissive;
  if (props.emissiveIntensity !== undefined) matProps.emissiveIntensity = props.emissiveIntensity;
  if (props.opacity !== undefined) matProps.opacity = props.opacity;
  if (props.transparent !== undefined) matProps.transparent = props.transparent;
  if (props.metalness !== undefined) matProps.metalness = props.metalness;
  if (props.roughness !== undefined) matProps.roughness = props.roughness;
  if (props.materialProps) Object.assign(matProps, props.materialProps);
  if (!matProps.color) matProps.color = '#8888cc';
  return matProps;
}

// ── Main Component ───────────────────────────────────────────────────────────

interface AnimatedMeshNodeProps {
  node: R3FNode;
}

export function AnimatedMeshNode({ node }: AnimatedMeshNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const builderMode = useBuilderStore((s) => s.builderMode);

  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const basePosition = props.position || [0, 0, 0];
  const baseRotation = props.rotation || [0, 0, 0];
  const baseScale = props.scale || [1, 1, 1];
  const isSelected = node.id === selectedId;
  const isBreakMode = builderMode === 'break';

  const matProps = getMaterialProps(node);

  // Parse keyframe sequences
  const sequences: KeyframeSequence[] = useMemo(() => {
    const raw = props.keyframes as any[];
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map((kf: any) => ({
      name: kf.name || 'default',
      stops: (kf.stops || []).map((s: any) => ({
        percent: s.percent ?? 0,
        position: s.position,
        rotation: s.rotation,
        scale: s.scale,
        color: s.color,
        opacity: s.opacity,
      })),
      duration: kf.duration || 1000,
      easing: kf.easing || 'linear',
      loop: kf.loop ?? true,
    }));
  }, [props.keyframes]);

  const startTimeRef = useRef<number | null>(null);

  // ── Animation Loop ──────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    if (!meshRef.current || sequences.length === 0) return;

    if (startTimeRef.current === null) {
      startTimeRef.current = clock.getElapsedTime() * 1000;
    }

    const now = clock.getElapsedTime() * 1000;
    const mesh = meshRef.current;

    for (const seq of sequences) {
      const elapsed = now - startTimeRef.current!;
      let progress: number;

      if (seq.loop) {
        progress = (elapsed % seq.duration) / seq.duration;
      } else {
        progress = Math.min(elapsed / seq.duration, 1);
      }

      const easedProgress = getEasingFn(seq.easing)(progress);
      const percent = easedProgress * 100;
      const interpolated = interpolateAtPercent(seq.stops, percent);

      // Apply interpolated transforms (additive to base)
      if (interpolated.position) {
        mesh.position.set(
          basePosition[0] + (interpolated.position[0] - (seq.stops[0]?.position?.[0] ?? 0)),
          basePosition[1] + (interpolated.position[1] - (seq.stops[0]?.position?.[1] ?? 0)),
          basePosition[2] + (interpolated.position[2] - (seq.stops[0]?.position?.[2] ?? 0))
        );
      }

      if (interpolated.rotation) {
        mesh.rotation.set(
          THREE.MathUtils.degToRad(interpolated.rotation[0]),
          THREE.MathUtils.degToRad(interpolated.rotation[1]),
          THREE.MathUtils.degToRad(interpolated.rotation[2])
        );
      }

      if (interpolated.scale) {
        const s = typeof interpolated.scale === 'number'
          ? [interpolated.scale, interpolated.scale, interpolated.scale]
          : interpolated.scale;
        mesh.scale.set(s[0], s[1], s[2]);
      }

      if (interpolated.opacity !== undefined && matRef.current) {
        matRef.current.opacity = interpolated.opacity;
        matRef.current.transparent = interpolated.opacity < 1;
      }
    }
  });

  // Recursive children
  const childMeshes = node.children
    ?.filter((c: R3FNode) => c.type === 'mesh')
    .map((child: R3FNode, i: number) => {
      const childHasKeyframes = child.props?.keyframes && (child.props.keyframes as any[]).length > 0;
      return childHasKeyframes
        ? <AnimatedMeshNode key={child.id || `child-${i}`} node={child} />
        : <StaticChildMesh key={child.id || `child-${i}`} node={child} />;
    });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={basePosition}
        rotation={baseRotation.map((r: number) => THREE.MathUtils.degToRad(r)) as any}
        scale={typeof baseScale === 'number' ? [baseScale, baseScale, baseScale] : baseScale}
        userData={{ nodeId: node.id }}
        onClick={(e: any) => {
          e.stopPropagation();
          if (isBreakMode && node.id) {
            removeNode(node.id);
          } else {
            setSelectedId(node.id || null);
          }
        }}
      >
        {getGeometry(hsType, size)}
        <meshPhysicalMaterial
          ref={matRef}
          {...matProps}
          emissive={matProps.emissive || undefined}
          color={matProps.color}
        />
        {isSelected && !isBreakMode && (
          <mesh>
            {getGeometry(hsType, size * 1.05)}
            <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
          </mesh>
        )}
      </mesh>
      {childMeshes}
    </group>
  );
}

// ── Static child (no keyframes) — avoids importing MeshNode (circular) ───────

function StaticChildMesh({ node }: { node: R3FNode }) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];
  const isSelected = node.id === selectedId;
  const matProps = getMaterialProps(node);

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
      userData={{ nodeId: node.id }}
      onClick={(e: any) => {
        e.stopPropagation();
        setSelectedId(node.id || null);
      }}
    >
      {getGeometry(hsType, size)}
      <meshPhysicalMaterial {...matProps} emissive={matProps.emissive || undefined} color={matProps.color} />
      {isSelected && (
        <mesh>
          {getGeometry(hsType, size * 1.05)}
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
        </mesh>
      )}
    </mesh>
  );
}
