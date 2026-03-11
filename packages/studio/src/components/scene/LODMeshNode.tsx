'use client';

/**
 * LODMeshNode — Level-of-detail mesh rendering using drei's Detailed component.
 * Renders 3 detail levels (high/medium/low) and switches based on camera distance.
 */

import { Suspense } from 'react';
import type { R3FNode } from '@holoscript/core';
import { Detailed } from '@react-three/drei';
import { getGeometry, getMaterialProps, isScaledBody, type LODDetail, useHoloTextures, hasTextures, useProceduralTexture } from '@holoscript/r3f-renderer';

interface LODMeshNodeProps {
  node: R3FNode;
  /** LOD distance thresholds in world units [medium, low] */
  distances?: [number, number, number];
}

/**
 * Inner material component for Suspense-wrapped texture loading.
 */
function TexturedLODMaterial({
  matProps,
  proceduralMaps,
}: {
  matProps: Record<string, any>;
  proceduralMaps: Record<string, any>;
}) {
  const textureMaps = useHoloTextures(matProps);
  return (
    <meshPhysicalMaterial
      {...matProps}
      {...proceduralMaps}
      {...textureMaps}
      emissive={matProps.emissive}
      emissiveIntensity={matProps.emissiveIntensity}
      color={matProps.color}
    />
  );
}

/**
 * Single LOD level mesh with geometry at the given detail.
 */
function LODLevel({
  hsType,
  size,
  props,
  detail,
  matProps,
  proceduralMaps,
  needsTextures,
}: {
  hsType: string;
  size: number;
  props: Record<string, any>;
  detail: LODDetail;
  matProps: Record<string, any>;
  proceduralMaps: Record<string, any>;
  needsTextures: boolean;
}) {
  const defaultMaterial = (
    <meshPhysicalMaterial
      {...matProps}
      {...proceduralMaps}
      emissive={matProps.emissive}
      emissiveIntensity={matProps.emissiveIntensity}
      color={matProps.color}
    />
  );

  return (
    <mesh>
      {getGeometry(hsType, size, props, detail)}
      {needsTextures ? (
        <Suspense fallback={defaultMaterial}>
          <TexturedLODMaterial matProps={matProps} proceduralMaps={proceduralMaps} />
        </Suspense>
      ) : (
        defaultMaterial
      )}
    </mesh>
  );
}

export function LODMeshNode({ node, distances = [0, 25, 50] }: LODMeshNodeProps) {
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

  return (
    <group
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
    >
      <Detailed distances={distances}>
        {/* LOD 0: Full detail (closest) */}
        <LODLevel
          hsType={hsType}
          size={size}
          props={props}
          detail="high"
          matProps={matProps}
          proceduralMaps={proceduralMaps}
          needsTextures={needsTextures}
        />
        {/* LOD 1: Medium detail */}
        <LODLevel
          hsType={hsType}
          size={size}
          props={props}
          detail="medium"
          matProps={matProps}
          proceduralMaps={proceduralMaps}
          needsTextures={needsTextures}
        />
        {/* LOD 2: Low detail (farthest) */}
        <LODLevel
          hsType={hsType}
          size={size}
          props={props}
          detail="low"
          matProps={matProps}
          proceduralMaps={proceduralMaps}
          needsTextures={needsTextures}
        />
      </Detailed>
    </group>
  );
}

/** Check if a node has LOD configuration */
export function hasLOD(node: R3FNode): boolean {
  return !!(node.props.lod || node.props.lodDistances || node.props.lodEnabled);
}
