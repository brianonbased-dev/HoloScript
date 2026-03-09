'use client';

import { useRef, Suspense, useEffect } from 'react';
import type { R3FNode } from '@holoscript/core';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import { useBuilderStore } from '@/lib/stores/builderStore';
import { FireEmbers, useKeyframeAnimation } from './ProceduralMesh';
import { getGeometry, getMaterialProps, isScaledBody, isFireMesh } from './materialUtils';
import { useHoloTextures, hasTextures } from '@/hooks/useHoloTextures';
import { useProceduralTexture } from '@/hooks/useProceduralTexture';

interface MeshNodeProps {
  node: R3FNode;
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

export function MeshNode({ node }: MeshNodeProps) {
  const meshRef = useRef<any>(null);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const setNodeRef = useSceneGraphStore((s) => s.setNodeRef);
  const builderMode = useBuilderStore((s) => s.builderMode);

  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];
  const isSelected = node.id === selectedId;
  const isBreakMode = builderMode === 'break';

  useEffect(() => {
    if (meshRef.current) {
      setNodeRef(node.id, meshRef.current);
    }
  }, [node.id, setNodeRef]);

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

  // Recursively render nested children (native asset primitives)
  const childMeshes = node.children
    ?.filter((c: R3FNode) => c.type === 'mesh')
    .map((child: R3FNode, i: number) => <MeshNode key={child.id || `child-${i}`} node={child} />);

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
            removeNode(node.id);
          } else {
            setSelectedId(node.id || null);
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
        {needsTextures ? (
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
