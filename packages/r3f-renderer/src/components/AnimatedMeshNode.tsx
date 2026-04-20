/**
 * AnimatedMeshNode — Renders a mesh with real-time keyframe animation.
 *
 * Uses Three.js useFrame to interpolate position/rotation/scale/color/opacity
 * between keyframe stops at 60fps. Handles multiple named keyframe sequences
 * and supports easing functions.
 *
 * Platform-agnostic: accepts callback props instead of depending on any
 * specific store (Studio, Hololand, etc.).
 */

import { useRef, useMemo, Suspense } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { R3FNode } from '@holoscript/core';
import * as THREE from 'three';
import { getGeometry, getMaterialProps, isScaledBody } from '../utils/materialUtils';
import { useHoloTextures, hasTextures } from '../hooks/useHoloTextures';
import { useProceduralTexture } from '../hooks/useProceduralTexture';

// ── Easing Functions ─────────────────────────────────────────────────────────

function easeLinear(t: number): number {
  return t;
}
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
function easeIn(t: number): number {
  return t * t;
}
function easeOut(t: number): number {
  return t * (2 - t);
}
function easeInCubic(t: number): number {
  return t * t * t;
}
function easeOutCubic(t: number): number {
  return --t * t * t + 1;
}
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

function getEasingFn(name: string): (t: number) => number {
  switch (name) {
    case 'ease-in':
      return easeIn;
    case 'ease-out':
      return easeOut;
    case 'ease-in-out':
      return easeInOut;
    case 'ease-in-cubic':
      return easeInCubic;
    case 'ease-out-cubic':
      return easeOutCubic;
    case 'ease-in-out-cubic':
      return easeInOutCubic;
    default:
      return easeLinear;
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
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function interpolateAtPercent(stops: KeyframeStop[], percent: number): KeyframeStop {
  if (stops.length === 0) return { percent: 0 };
  if (stops.length === 1) return stops[0];

  const sorted = [...stops].sort((a, b) => a.percent - b.percent);

  if (percent <= sorted[0].percent) return sorted[0];
  if (percent >= sorted[sorted.length - 1].percent) return sorted[sorted.length - 1];

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
    const ls =
      typeof lower.scale === 'number'
        ? ([lower.scale, lower.scale, lower.scale] as [number, number, number])
        : lower.scale;
    const us =
      typeof upper.scale === 'number'
        ? ([upper.scale, upper.scale, upper.scale] as [number, number, number])
        : upper.scale;
    result.scale = lerpVec3(ls, us, localT);
  } else if (lower.scale) {
    result.scale = lower.scale;
  }

  if (lower.opacity !== undefined && upper.opacity !== undefined) {
    result.opacity = lower.opacity + (upper.opacity - lower.opacity) * localT;
  }

  return result;
}

// ── Textured Material (Suspense-wrapped for async texture loading) ───────────

function TexturedAnimatedMaterial({
  matProps,
  proceduralMaps,
  matRef,
}: {
  matProps: Record<string, any>;
  proceduralMaps: Record<string, any>;
  matRef: React.RefObject<THREE.MeshPhysicalMaterial | null>;
}) {
  const textureMaps = useHoloTextures(matProps);

  return (
    <meshPhysicalMaterial
      ref={matRef}
      {...matProps}
      {...proceduralMaps}
      {...textureMaps}
      emissive={matProps.emissive}
      color={matProps.color}
    />
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export interface AnimatedMeshNodeProps {
  node: R3FNode;
  /** Called when the mesh is clicked with the node id */
  onSelect?: (id: string | null) => void;
  /** Called to remove a node (e.g. break mode) */
  onRemove?: (id: string) => void;
  /** Whether this node is currently selected */
  isSelected?: boolean;
  /** Whether the editor is in break/delete mode */
  isBreakMode?: boolean;
}

export function AnimatedMeshNode({
  node,
  onSelect,
  onRemove,
  isSelected = false,
  isBreakMode = false,
}: AnimatedMeshNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);

  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const basePosition = props.position || [0, 0, 0];
  const baseRotation = props.rotation || [0, 0, 0];
  const baseScale = props.scale || [1, 1, 1];

  const matProps = getMaterialProps(node);

  // Generate procedural textures for hull/metaball meshes
  const proceduralMaps = useProceduralTexture(isScaledBody(hsType) ? 'scaleFull' : null, {
    size: 512,
    tiling: [3, 3],
  });

  // Check if we need external texture loading
  const needsTextures = hasTextures(matProps);

  // Parse keyframe sequences
  const sequences: KeyframeSequence[] = useMemo(() => {
    const raw: unknown[] = Array.isArray(props.keyframes) ? props.keyframes : [];
    return raw.map((kf) => {
      const k = kf as Record<string, unknown>;
      const stops = Array.isArray(k.stops) ? k.stops : [];
      return {
        name: (k.name as string) || 'default',
        stops: stops.map((s) => {
          const st = s as Record<string, unknown>;
          return {
            percent: (st.percent as number) ?? 0,
            position: st.position as [number, number, number] | undefined,
            rotation: st.rotation as [number, number, number] | undefined,
            scale: st.scale as [number, number, number] | number | undefined,
            color: st.color as string | undefined,
            opacity: st.opacity as number | undefined,
          };
        }),
        duration: (k.duration as number) || 1000,
        easing: (k.easing as string) || 'linear',
        loop: (k.loop as boolean) ?? true,
      };
    });
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
        const s =
          typeof interpolated.scale === 'number'
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
      const childHasKeyframes =
        child.props?.keyframes &&
        Array.isArray(child.props.keyframes) &&
        child.props.keyframes.length > 0;
      return childHasKeyframes ? (
        <AnimatedMeshNode
          key={child.id || `child-${i}`}
          node={child}
          onSelect={onSelect}
          onRemove={onRemove}
          isBreakMode={isBreakMode}
        />
      ) : (
        <StaticChildMesh
          key={child.id || `child-${i}`}
          node={child}
          onSelect={onSelect}
          isSelected={false}
        />
      );
    });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={basePosition}
        rotation={
          baseRotation.map((r: number) => THREE.MathUtils.degToRad(r)) as [number, number, number]
        }
        scale={typeof baseScale === 'number' ? [baseScale, baseScale, baseScale] : baseScale}
        userData={{ nodeId: node.id }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (isBreakMode && node.id) {
            onRemove?.(node.id);
          } else {
            onSelect?.(node.id || null);
          }
        }}
      >
        {getGeometry(hsType, size, props, 'high', node)}
        {needsTextures ? (
          <Suspense
            fallback={
              <meshPhysicalMaterial
                ref={matRef}
                {...matProps}
                {...proceduralMaps}
                emissive={matProps.emissive}
                color={matProps.color}
              />
            }
          >
            <TexturedAnimatedMaterial
              matProps={matProps}
              proceduralMaps={proceduralMaps}
              matRef={matRef}
            />
          </Suspense>
        ) : (
          <meshPhysicalMaterial
            ref={matRef}
            {...matProps}
            {...proceduralMaps}
            emissive={matProps.emissive}
            color={matProps.color}
          />
        )}
        {isSelected && !isBreakMode && (
          <mesh>
            {getGeometry(hsType, size * 1.05, props, 'high', node)}
            <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
          </mesh>
        )}
      </mesh>
      {childMeshes}
    </group>
  );
}

// ── Static child (no keyframes) ───────────────────────────────────────────

function StaticChildMesh({
  node,
  onSelect,
  isSelected = false,
}: {
  node: R3FNode;
  onSelect?: (id: string | null) => void;
  isSelected?: boolean;
}) {
  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];
  const matProps = getMaterialProps(node);
  const proceduralMaps = useProceduralTexture(isScaledBody(hsType) ? 'scaleFull' : null, {
    size: 512,
    tiling: [3, 3],
  });
  const needsTextures = hasTextures(matProps);

  const defaultMaterial = (
    <meshPhysicalMaterial
      {...matProps}
      {...proceduralMaps}
      emissive={matProps.emissive}
      color={matProps.color}
    />
  );

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
      userData={{ nodeId: node.id }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect?.(node.id || null);
      }}
    >
      {getGeometry(hsType, size, props, 'high', node)}
      {needsTextures ? (
        <Suspense fallback={defaultMaterial}>
          <TexturedAnimatedMaterial
            matProps={matProps}
            proceduralMaps={proceduralMaps}
            matRef={{ current: null }}
          />
        </Suspense>
      ) : (
        defaultMaterial
      )}
      {isSelected && (
        <mesh>
          {getGeometry(hsType, size * 1.05, props, 'high', node)}
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
        </mesh>
      )}
    </mesh>
  );
}
