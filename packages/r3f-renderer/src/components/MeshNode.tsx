/**
 * MeshNode — Renders a single HoloScript mesh with full PBR material support.
 *
 * Platform-agnostic: accepts callback props instead of depending on any
 * specific store (Studio, Hololand, etc.).
 */

import { useRef, Suspense, useEffect } from 'react';
import type { R3FNode } from '@holoscript/core';
import { FireEmbers, useKeyframeAnimation } from './ProceduralMesh';
import { getGeometry, getMaterialProps, isScaledBody, isFireMesh } from '../utils/materialUtils';
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
  /**
   * Draft mode: render as blockout primitive with draft color.
   * Skips textures, procedural maps, and effects for cheapest rendering.
   * Also triggered when node.assetMaturity === 'draft'.
   */
  draftMode?: boolean;
  /** Override draft color (default: '#88aaff') */
  draftColor?: string;
}

/**
 * Inner material component that loads textures via useLoader (requires Suspense).
 * Only rendered when external textures are detected in material props.
 */
function TexturedMaterial({
  matProps,
  proceduralMaps,
  isBreakMode,
}: {
  matProps: Record<string, any>;
  proceduralMaps: Record<string, any>;
  isBreakMode: boolean;
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
  draftMode = false,
  draftColor = '#88aaff',
}: MeshNodeProps) {
  const meshRef = useRef<any>(null);

  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];

  // Draft mode: either explicit prop or assetMaturity === 'draft'
  const isDraft = draftMode || node.assetMaturity === 'draft';

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

  // Has fire effects? (skip in draft mode)
  const hasFire = !isDraft && isFireMesh(node) && (props.emissiveIntensity ?? 0) > 1.0;

  // Check if we need external texture loading (skip in draft mode)
  const needsTextures = !isDraft && hasTextures(matProps);

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

  // Draft material: flat color, no textures, cheapest rendering path
  const draftMaterial = isDraft ? (
    <meshBasicMaterial
      color={draftColor}
      wireframe={props.draftWireframe || false}
      transparent={props.draftOpacity !== undefined && props.draftOpacity < 1}
      opacity={props.draftOpacity ?? 1.0}
    />
  ) : null;

  // Default material with procedural textures (no external texture loading)
  const defaultMaterial = (
    <meshPhysicalMaterial
      {...matProps}
      {...proceduralMaps}
      emissive={isBreakMode ? '#ff4444' : matProps.emissive}
      emissiveIntensity={isBreakMode ? 0.3 : matProps.emissiveIntensity}
      color={matProps.color}
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
        {getGeometry(hsType, size, props)}
        {isDraft ? (
          draftMaterial
        ) : needsTextures ? (
          <Suspense fallback={defaultMaterial}>
            <TexturedMaterial
              matProps={matProps}
              proceduralMaps={proceduralMaps}
              isBreakMode={isBreakMode}
            />
          </Suspense>
        ) : (
          defaultMaterial
        )}
        {isSelected && !isBreakMode && (
          <mesh>
            {getGeometry(hsType, size * 1.05, props)}
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
