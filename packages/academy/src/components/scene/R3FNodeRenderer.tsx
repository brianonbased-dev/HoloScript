'use client';

import type { R3FNode } from '@holoscript/core';
import { Text, Sparkles, Environment } from '@react-three/drei';
import {
  MeshNode,
  ShaderMeshNode,
  hasShaderTrait,
  AnimatedMeshNode,
  LODMeshNode,
  hasLOD,
  DraftMeshNode,
} from '@holoscript/r3f-renderer';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import { useBuilderStore } from '@/lib/stores/builderStore';
import { PostProcessingNode } from './PostProcessingNode';
import { GLTFModelNode } from './GLTFModelNode';

/** Thin wrapper: bridges Studio stores → shared MeshNode callback props */
function StudioMeshNode({ node }: { node: R3FNode }) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const setNodeRef = useSceneGraphStore((s) => s.setNodeRef);
  const builderMode = useBuilderStore((s) => s.builderMode);

  return (
    <MeshNode
      node={node}
      onSelect={setSelectedId}
      onRemove={removeNode}
      onRef={setNodeRef}
      isSelected={node.id === selectedId}
      isBreakMode={builderMode === 'break'}
    />
  );
}

/** Thin wrapper: bridges Studio stores → shared ShaderMeshNode callback props */
function StudioShaderMeshNode({ node }: { node: R3FNode }) {
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  return <ShaderMeshNode node={node} onSelect={setSelectedId} />;
}

/** Thin wrapper: bridges Studio stores → shared AnimatedMeshNode callback props */
function StudioAnimatedMeshNode({ node }: { node: R3FNode }) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const builderMode = useBuilderStore((s) => s.builderMode);

  return (
    <AnimatedMeshNode
      node={node}
      onSelect={setSelectedId}
      onRemove={removeNode}
      isSelected={node.id === selectedId}
      isBreakMode={builderMode === 'break'}
    />
  );
}

interface R3FNodeRendererProps {
  node: R3FNode;
}

export function R3FNodeRenderer({ node }: R3FNodeRendererProps) {
  const children = node.children?.map((child: R3FNode, i: number) => (
    <R3FNodeRenderer key={child.id || `child-${i}`} node={child} />
  ));

  const { props } = node;

  switch (node.type) {
    case 'mesh': {
      // Check if this mesh has a custom shader trait
      const isShaderMesh = hasShaderTrait(node);
      // Check if this mesh has LOD configuration
      const isLODMesh = hasLOD(node);
      // Check if this mesh has keyframe animations
      const hasKeyframes =
        props.keyframes && Array.isArray(props.keyframes) && props.keyframes.length > 0;
      // Non-mesh children (lights, effects) still render via R3FNodeRenderer
      const nonMeshChildren = node.children
        ?.filter((c: R3FNode) => c.type !== 'mesh')
        .map((child: R3FNode, i: number) => (
          <R3FNodeRenderer key={child.id || `non-mesh-${i}`} node={child} />
        ));

      let meshComponent;
      // Draft maturity: render as geometric primitive (blockout / collision proxy)
      if (node.assetMaturity === 'draft') {
        meshComponent = (
          <DraftMeshNode
            nodes={[node]}
            wireframe={props.draftWireframe}
            draftColor={props.draftColor}
            onPromote={() => {}}
            onSelect={() => {}}
          />
        );
      } else if (isShaderMesh) {
        meshComponent = <StudioShaderMeshNode node={node} />;
      } else if (isLODMesh) {
        const distances = props.lodDistances || [0, 25, 50];
        meshComponent = <LODMeshNode node={node} distances={distances} lodConfig={{}} onLODChange={() => {}} />;
      } else if (hasKeyframes) {
        meshComponent = <StudioAnimatedMeshNode node={node} />;
      } else {
        meshComponent = <StudioMeshNode node={node} />;
      }

      return (
        <group>
          {meshComponent}
          {nonMeshChildren}
        </group>
      );
    }

    case 'group':
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );

    case 'directionalLight':
      return (
        <directionalLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [5, 10, 5]}
          castShadow={props.shadows ?? false}
        />
      );

    case 'ambientLight':
      return <ambientLight color={props.color} intensity={props.intensity ?? 0.4} />;

    case 'pointLight':
      return (
        <pointLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [0, 5, 0]}
          distance={props.distance}
          decay={props.decay ?? 2}
        />
      );

    case 'spotLight':
      return (
        <spotLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [0, 10, 0]}
          angle={props.angle ?? 0.3}
          penumbra={props.penumbra ?? 0.5}
          castShadow={props.shadows ?? false}
        />
      );

    case 'hemisphereLight':
      return (
        <hemisphereLight
          color={props.color || '#ffffff'}
          groundColor={props.groundColor || '#444444'}
          intensity={props.intensity ?? 0.5}
        />
      );

    case 'Text':
      return (
        <Text
          position={props.position}
          rotation={props.rotation}
          fontSize={props.fontSize ?? 0.5}
          color={props.color || '#ffffff'}
          anchorX="center"
          anchorY="middle"
        >
          {props.text || props.content || ''}
        </Text>
      );

    case 'Sparkles':
      return (
        <Sparkles
          count={props.count ?? 50}
          size={props.size ?? 2}
          scale={props.scale ?? 5}
          color={props.color}
          speed={props.speed ?? 0.5}
        />
      );

    case 'Environment':
      return (
        <Environment preset={props.envPreset || 'studio'} background={props.background ?? false} />
      );

    case 'fog':
      return (
        <fog attach="fog" args={[props.color || '#cccccc', props.near ?? 10, props.far ?? 100]} />
      );

    case 'EffectComposer':
      return <PostProcessingNode node={node} />;

    case 'gltfModel': {
      const animTrait = node.traits?.get('animation' as any);
      const action = animTrait ? (animTrait.properties?.state as string ?? 'idle') : 'idle';
      return (
        <GLTFModelNode
          node={node}
          src={props.src || props.model || ''}
          position={props.position}
          rotation={props.rotation}
          scale={props.scale}
          action={action}
        />
      );
    }

    case 'rectAreaLight':
      return (
        <rectAreaLight
          color={props.color || '#ffffff'}
          intensity={props.intensity ?? 1}
          width={props.width ?? 4}
          height={props.height ?? 4}
          position={props.position || [0, 5, 0]}
          rotation={props.rotation}
        />
      );

    default:
      // Unknown type — wrap in group and render children
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );
  }
}
