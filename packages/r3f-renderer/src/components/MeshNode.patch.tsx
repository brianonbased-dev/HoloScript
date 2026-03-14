/**
 * MeshNode -- Renders a single HoloScript mesh with full PBR material support.
 *
 * Platform-agnostic: accepts callback props instead of depending on any
 * specific store (Studio, Hololand, etc.).
 *
 * Advanced geometry types (hull, metaball, blob, spline, membrane) use the
 * ProceduralGeometryComponent which generates BufferGeometry from marching
 * cubes or spline/membrane algorithms. These require special handling:
 * - Procedural scale textures are applied via useProceduralTexture
 * - DoubleSide rendering for marching cubes winding inconsistencies
 * - Fallback blob synthesis when no blob data is provided
 *
 * TARGET: packages/r3f-renderer/src/components/MeshNode.tsx
 */

import { useRef, Suspense, useEffect, useMemo } from 'react';
import type { R3FNode } from '@holoscript/core';
import { FireEmbers, useKeyframeAnimation } from './ProceduralMesh';
import { getGeometry, getMaterialProps, isScaledBody, isFireMesh, isAdvancedGeometry } from '../utils/materialUtils';
import { useHoloTextures, hasTextures } from '../hooks/useHoloTextures';
import { useProceduralTexture } from '../hooks/useProceduralTexture';

export interface MeshNodeProps {
  node: R3FNode;
  /** Called when the mesh is clicked with the node id */
  onSelect?: (id: string | null) => void;
  /** Called to remove a node (e.g. break mode) */
  onRemove?: (id: string) => void;
  /** Called to register a ref for the node */
  onRef?: (id: string, ref: any) => void;
  /** Whether this node is currently selected */
  isSelected?: boolean;
  /** Whether the editor is in break/delete mode */
  isBreakMode?: boolean;
}

/**
 * Inner material component that loads textures via useLoader (requires Suspense).
 * Only rendered when external textures are detected in material props.
 */
function TexturedMaterial({
  matProps,
  proceduralMaps,
  isBreakMode,
  doubleSided,
}: {
  matProps: Record<string, any>;
  proceduralMaps: Record<string, any>;
  isBreakMode: boolean;
  doubleSided?: boolean;
}) {
  const textureMaps = useHoloTextures(matProps);

  return (
    <meshPhysicalMaterial
      {...matProps}
      {...proceduralMaps}
      {...textureMaps}
      emissive={isBreakMode ? '#ff4444' : matProps.emissive}
      emissiveIntensity={isBreakMode ? 0.3 : matProps.emissiveIntensity}
      color={matProps.color}
      side={doubleSided ? 2 : matProps.side}
    />
  );
}

export function MeshNode({
  node,
  onSelect,
  onRemove,
  onRef,
  isSelected = false,
  isBreakMode = false,
}: MeshNodeProps) {
  const meshRef = useRef<any>(null);

  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];

  useEffect(() => {
    if (meshRef.current && node.id && onRef) {
      onRef(node.id, meshRef.current);
    }
  }, [node.id, onRef]);

  const matProps = getMaterialProps(node);

  // Generate procedural scale texture + normal map for hull/metaball meshes
  const proceduralMaps = useProceduralTexture(isScaledBody(hsType) ? 'scaleFull' : null, {
    size: 512,
    tiling: [3, 3],
  });

  // Keyframe animation
  useKeyframeAnimation(meshRef, props.keyframes);

  // Has fire effects?
  const hasFire = isFireMesh(node) && (props.emissiveIntensity ?? 0) > 1.0;

  // Check if we need external texture loading (triggers Suspense)
  const needsTextures = hasTextures(matProps);

  // Determine if this is an advanced geometry type that needs special rendering
  const isAdvanced = isAdvancedGeometry(hsType);

  // For advanced geometries without blob/point/anchor data, synthesize
  // default geometry data from the object's scale so the procedural
  // generator has valid input. This fixes the dragon demo and other
  // hull/metaball scenes that don't provide explicit blob arrays.
  const effectiveProps = useMemo(() => {
    if (!isAdvanced) return props;

    if (hsType === 'hull' || hsType === 'metaball' || hsType === 'blob') {
      if (!props.blobs || !Array.isArray(props.blobs) || props.blobs.length === 0) {
        const s = props.size || 1;
        const sx = Array.isArray(scale) ? scale[0] : (typeof scale === 'number' ? scale : 1);
        const sy = Array.isArray(scale) ? scale[1] : (typeof scale === 'number' ? scale : 1);
        const sz = Array.isArray(scale) ? scale[2] : (typeof scale === 'number' ? scale : 1);
        return {
          ...props,
          blobs: [
            { center: [0, 0, 0], radius: [s * sx * 0.5, s * sy * 0.5, s * sz * 0.5] },
          ],
        };
      }
    }

    if (hsType === 'spline') {
      if (!props.points || !Array.isArray(props.points) || props.points.length < 2) {
        const s = props.size || 1;
        return {
          ...props,
          points: [
            [0, -s * 0.5, 0],
            [0, s * 0.5, 0],
          ],
          radii: [s * 0.15, s * 0.15],
        };
      }
    }

    if (hsType === 'membrane') {
      if (!props.anchors || !Array.isArray(props.anchors) || props.anchors.length < 3) {
        const s = props.size || 1;
        const r = s * 0.5;
        return {
          ...props,
          anchors: [
            [r, 0, 0],
            [-r * 0.5, 0, r * 0.866],
            [-r * 0.5, 0, -r * 0.866],
          ],
        };
      }
    }

    return props;
  }, [isAdvanced, hsType, props, scale]);

  // Recursively render nested children (native asset primitives)
  const childMeshes = node.children
    ?.filter((c: R3FNode) => c.type === 'mesh')
    .map((child: R3FNode, i: number) => (
      <MeshNode
        key={child.id || `child-${i}`}
        node={child}
        onSelect={onSelect}
        onRemove={onRemove}
        onRef={onRef}
        isBreakMode={isBreakMode}
      />
    ));

  // Default material with procedural textures (no external texture loading).
  // Advanced geometries use DoubleSide rendering since marching cubes can
  // produce triangles with varying winding order at surface boundaries.
  const defaultMaterial = (
    <meshPhysicalMaterial
      {...matProps}
      {...proceduralMaps}
      emissive={isBreakMode ? '#ff4444' : matProps.emissive}
      emissiveIntensity={isBreakMode ? 0.3 : matProps.emissiveIntensity}
      color={matProps.color}
      side={isAdvanced ? 2 : matProps.side}
    />
  );

  return (
    <group ref={meshRef}>
      <mesh
        position={position}
        rotation={rotation}
        scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
        userData={{ nodeId: node.id }}
        onClick={(e: any) => {
          e.stopPropagation();
          if (isBreakMode && node.id) {
            onRemove?.(node.id);
          } else {
            onSelect?.(node.id || null);
          }
        }}
        onPointerOver={(e: any) => {
          if (isBreakMode) {
            e.stopPropagation();
            document.body.style.cursor = 'crosshair';
          }
        }}
        onPointerOut={() => {
          if (isBreakMode) {
            document.body.style.cursor = 'default';
          }
        }}
      >
        {getGeometry(hsType, size, effectiveProps)}
        {needsTextures ? (
          <Suspense fallback={defaultMaterial}>
            <TexturedMaterial
              matProps={matProps}
              proceduralMaps={proceduralMaps}
              isBreakMode={isBreakMode}
              doubleSided={isAdvanced}
            />
          </Suspense>
        ) : (
          defaultMaterial
        )}
        {isSelected && !isBreakMode && (
          <mesh>
            {getGeometry(hsType, size * 1.05, effectiveProps)}
            <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
          </mesh>
        )}
      </mesh>
      {/* Fire ember particles */}
      {hasFire && <FireEmbers position={position} />}
      {childMeshes}
    </group>
  );
}
