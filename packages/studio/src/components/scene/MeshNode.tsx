'use client';

import type { R3FNode } from '@holoscript/core';
import { MATERIAL_PRESETS } from '@holoscript/core';
import { useEditorStore, useSceneGraphStore } from '@/lib/store';
import { useBuilderStore } from '@/lib/stores/builderStore';

interface MeshNodeProps {
  node: R3FNode;
}

function getGeometry(hsType: string, size: number) {
  const s = size || 1;
  switch (hsType) {
    case 'sphere':
    case 'orb':
      return <sphereGeometry args={[s * 0.5, 32, 32]} />;
    case 'cube':
    case 'box':
      return <boxGeometry args={[s, s, s]} />;
    case 'cylinder':
      return <cylinderGeometry args={[s * 0.5, s * 0.5, s, 32]} />;
    case 'pyramid':
    case 'cone':
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

function getMaterialProps(node: R3FNode) {
  const props = node.props;
  const materialName = props.material || props.materialPreset;
  const preset = materialName
    ? (MATERIAL_PRESETS as Record<string, Record<string, any>>)[materialName]
    : undefined;

  const matProps: Record<string, any> = {
    ...(preset || {}),
  };

  // Override with explicit props
  if (props.color) matProps.color = props.color;
  if (props.emissive) matProps.emissive = props.emissive;
  if (props.emissiveIntensity !== undefined) matProps.emissiveIntensity = props.emissiveIntensity;
  if (props.opacity !== undefined) matProps.opacity = props.opacity;
  if (props.transparent !== undefined) matProps.transparent = props.transparent;
  if (props.metalness !== undefined) matProps.metalness = props.metalness;
  if (props.roughness !== undefined) matProps.roughness = props.roughness;
  if (props.wireframe !== undefined) matProps.wireframe = props.wireframe;

  // Copy any materialProps from compilation
  if (props.materialProps) {
    Object.assign(matProps, props.materialProps);
  }

  // Default color if none set
  if (!matProps.color) matProps.color = '#8888cc';

  return matProps;
}

export function MeshNode({ node }: MeshNodeProps) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const builderMode = useBuilderStore((s) => s.builderMode);

  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];
  const isSelected = node.id === selectedId;
  const isBreakMode = builderMode === 'break';

  const matProps = getMaterialProps(node);

  // Recursively render nested children (native asset primitives)
  const childMeshes = node.children
    ?.filter((c: R3FNode) => c.type === 'mesh')
    .map((child: R3FNode, i: number) => (
      <MeshNode key={child.id || `child-${i}`} node={child} />
    ));

  return (
    <group>
      <mesh
        position={position}
        rotation={rotation}
        scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
        userData={{ nodeId: node.id }}
        onClick={(e: any) => {
          e.stopPropagation();
          if (isBreakMode && node.id) {
            // Break mode: delete on click
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
        {getGeometry(hsType, size)}
        <meshPhysicalMaterial
          {...matProps}
          emissive={isBreakMode ? '#ff4444' : (matProps.emissive || undefined)}
          emissiveIntensity={isBreakMode ? 0.3 : (matProps.emissiveIntensity || 0)}
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
