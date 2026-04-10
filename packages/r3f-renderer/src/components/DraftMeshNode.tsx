/**
 * DraftMeshNode — Instanced draft primitive renderer.
 *
 * Groups same-type geometric primitives into InstancedMesh draw calls
 * for efficient blockout rendering. Each shape type (box, sphere, cylinder,
 * cone, capsule, torus) gets ONE InstancedMesh — batching N objects into
 * a single draw call.
 *
 * Draft shapes double as collision proxies (circular pipeline: W.080).
 *
 * @see P.082 — Shape-as-Pixel Instanced Draft Pattern
 * @see W.080 — Geometric primitives are both draft AND collision proxy
 */

import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { R3FNode } from '@holoscript/core';

// ── Types ────────────────────────────────────────────────────────────────────

export type DraftShape = 'box' | 'sphere' | 'cylinder' | 'cone' | 'capsule' | 'torus' | 'plane';

export interface DraftInstance {
  /** Unique entity ID */
  id: string;
  /** Position [x, y, z] */
  position: [number, number, number];
  /** Rotation [x, y, z] in radians */
  rotation: [number, number, number];
  /** Scale [x, y, z] */
  scale: [number, number, number];
  /** Color override (hex string) */
  color?: string;
}

export interface DraftMeshNodeProps {
  /** R3FNodes to render as draft primitives (all with assetMaturity='draft') */
  nodes: R3FNode[];
  /** Default draft color (default: '#88aaff') */
  draftColor?: string;
  /** Show wireframe overlay (default: false) */
  wireframe?: boolean;
  /** Opacity (default: 1.0) */
  opacity?: number;
  /** Called when a draft shape is clicked — signals promotion intent */
  onPromote?: (id: string) => void;
  /** Called when a draft shape is clicked (selection) */
  onSelect?: (id: string | null) => void;
}

// ── Geometry Cache ───────────────────────────────────────────────────────────

const SHAPE_SEGMENTS = 16;

function createShapeGeometry(shape: DraftShape): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere':
      return new THREE.SphereGeometry(0.5, SHAPE_SEGMENTS, SHAPE_SEGMENTS);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, SHAPE_SEGMENTS);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 4);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.3, 0.5, 4, SHAPE_SEGMENTS / 2);
    case 'torus':
      return new THREE.TorusGeometry(0.5, 0.15, SHAPE_SEGMENTS, SHAPE_SEGMENTS);
    case 'plane':
      return new THREE.PlaneGeometry(1, 1);
    case 'box':
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract draft shape from an R3FNode */
function getNodeShape(node: R3FNode): DraftShape {
  const shape = node.props.draftShape || node.props.hsType || node.props.geometry || 'box';
  const validShapes: DraftShape[] = [
    'box',
    'sphere',
    'cylinder',
    'cone',
    'capsule',
    'torus',
    'plane',
  ];
  if (validShapes.includes(shape)) return shape as DraftShape;
  // Map common aliases
  if (shape === 'cube') return 'box';
  if (shape === 'orb') return 'sphere';
  if (shape === 'pyramid') return 'cone';
  return 'box';
}

/** Group nodes by their draft shape */
function groupByShape(nodes: R3FNode[]): Map<DraftShape, R3FNode[]> {
  const groups = new Map<DraftShape, R3FNode[]>();
  for (const node of nodes) {
    const shape = getNodeShape(node);
    const list = groups.get(shape);
    if (list) {
      list.push(node);
    } else {
      groups.set(shape, [node]);
    }
  }
  return groups;
}

// ── InstancedDraftGroup ──────────────────────────────────────────────────────

const _tempObject = new THREE.Object3D();
const _tempColor = new THREE.Color();

function InstancedDraftGroup({
  shape,
  nodes,
  draftColor,
  wireframe,
  opacity,
  onSelect,
}: {
  shape: DraftShape;
  nodes: R3FNode[];
  draftColor: string;
  wireframe: boolean;
  opacity: number;
  onSelect?: (id: string | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => createShapeGeometry(shape), [shape]);

  // Update instance matrices and colors whenever nodes change
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const pos = node.props.position || [0, 0, 0];
      const rot = node.props.rotation || [0, 0, 0];
      const rawScale = node.props.scale || [1, 1, 1];
      const size = node.props.size || 1;

      _tempObject.position.set(pos[0], pos[1], pos[2]);
      _tempObject.rotation.set(rot[0], rot[1], rot[2]);

      // Apply size as uniform scale multiplier
      if (typeof rawScale === 'number') {
        _tempObject.scale.set(rawScale * size, rawScale * size, rawScale * size);
      } else {
        _tempObject.scale.set(
          (rawScale[0] ?? 1) * size,
          (rawScale[1] ?? 1) * size,
          (rawScale[2] ?? 1) * size
        );
      }

      _tempObject.updateMatrix();
      mesh.setMatrixAt(i, _tempObject.matrix);

      // Per-instance color
      const color = node.props.draftColor || node.props.color || draftColor;
      _tempColor.set(color);
      mesh.setColorAt(i, _tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodes, draftColor]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, nodes.length]}
      onClick={(e: any) => {
        e.stopPropagation();
        const instanceId = e.instanceId;
        if (instanceId !== undefined && nodes[instanceId]) {
          onSelect?.(nodes[instanceId].id || null);
        }
      }}
    >
      <meshBasicMaterial
        vertexColors
        wireframe={wireframe}
        transparent={opacity < 1}
        opacity={opacity}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

// ── DraftMeshNode ────────────────────────────────────────────────────────────

export function DraftMeshNode({
  nodes,
  draftColor = '#88aaff',
  wireframe = false,
  opacity = 1.0,
  onPromote,
  onSelect,
}: DraftMeshNodeProps) {
  // Group nodes by shape type for instanced batching
  const groups = useMemo(() => groupByShape(nodes), [nodes]);

  if (nodes.length === 0) return null;

  return (
    <group>
      {Array.from(groups.entries()).map(([shape, shapeNodes]) => (
        <InstancedDraftGroup
          key={shape}
          shape={shape}
          nodes={shapeNodes}
          draftColor={draftColor}
          wireframe={wireframe}
          opacity={opacity}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
