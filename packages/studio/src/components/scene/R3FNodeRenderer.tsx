'use client';

import { Suspense } from 'react';
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
  BiologicalMeshNode,
  GaussianSplatViewer,
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

/** Resolve splat URL from @gaussian_splat trait or node props (Studio drag-drop / compiler). */
function resolveGaussianSplatSrc(node: R3FNode): string | null {
  const trait = node.traits?.get('gaussian_splat') as Record<string, unknown> | undefined;
  if (trait) {
    const s = trait.source ?? trait.src ?? trait.url;
    if (typeof s === 'string' && s.length > 0) return s;
  }
  const p = node.props;
  if (typeof p.src === 'string' && p.src) return p.src;
  if (typeof p.source === 'string' && p.source) return p.source;
  return null;
}

/** Draft meshes that can share an InstancedMesh (exclude Gaussian splat drafts). */
function isBatchableDraftMesh(node: R3FNode): boolean {
  return (
    node.type === 'mesh' &&
    node.assetMaturity === 'draft' &&
    resolveGaussianSplatSrc(node) === null
  );
}

/** Split group children: batchable draft meshes vs everything else (preserve order in `rest`). */
function partitionStudioChildren(children: R3FNode[] | undefined): {
  batchableDraftMeshes: R3FNode[];
  rest: R3FNode[];
} {
  const list = children ?? [];
  const batchableDraftMeshes: R3FNode[] = [];
  const rest: R3FNode[] = [];
  for (const c of list) {
    if (isBatchableDraftMesh(c)) {
      batchableDraftMeshes.push(c);
    } else {
      rest.push(c);
    }
  }
  return { batchableDraftMeshes, rest };
}

function renderStudioChildList(rest: R3FNode[]) {
  return rest.map((child: R3FNode, i: number) => (
    <R3FNodeRenderer key={child.id || `child-${i}`} node={child} />
  ));
}

/** Batched draft blockout meshes with Studio selection + one InstancedMesh per shape. */
function StudioDraftMeshBatch({ nodes }: { nodes: R3FNode[] }) {
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const wireframe = nodes.some((n) => n.props.draftWireframe);
  if (nodes.length === 0) return null;
  return (
    <DraftMeshNode
      nodes={nodes}
      onSelect={setSelectedId}
      wireframe={wireframe}
    />
  );
}

export function R3FNodeRenderer({ node }: R3FNodeRendererProps) {
  const { props } = node;

  switch (node.type) {
    case 'splat': {
      const src = resolveGaussianSplatSrc(node);
      if (!src) {
        const { batchableDraftMeshes, rest } = partitionStudioChildren(node.children);
        return (
          <group position={props.position} rotation={props.rotation} scale={props.scale}>
            {batchableDraftMeshes.length > 0 && (
              <StudioDraftMeshBatch key="studio-draft-batch" nodes={batchableDraftMeshes} />
            )}
            {renderStudioChildList(rest)}
          </group>
        );
      }
      const maxSplats =
        typeof props.maxSplats === 'number'
          ? props.maxSplats
          : typeof props.max_splats === 'number'
            ? props.max_splats
            : undefined;
      return (
        <Suspense fallback={null}>
          <GaussianSplatViewer
            src={src}
            position={props.position}
            rotation={props.rotation}
            scale={props.scale}
            maxSplats={maxSplats}
          />
        </Suspense>
      );
    }

    case 'mesh': {
      const splatSrc = resolveGaussianSplatSrc(node);
      const nonMeshChildrenEarly = node.children
        ?.filter((c: R3FNode) => c.type !== 'mesh')
        .map((child: R3FNode, i: number) => (
          <R3FNodeRenderer key={child.id || `non-mesh-${i}`} node={child} />
        ));

      if (splatSrc) {
        const trait = node.traits?.get('gaussian_splat') as Record<string, unknown> | undefined;
        const maxFromTrait =
          typeof trait?.max_splats === 'number' ? (trait.max_splats as number) : undefined;
        const maxSplats =
          typeof props.maxSplats === 'number'
            ? props.maxSplats
            : typeof props.max_splats === 'number'
              ? props.max_splats
              : maxFromTrait;
        return (
          <group>
            <Suspense fallback={null}>
              <GaussianSplatViewer
                src={splatSrc}
                position={props.position}
                rotation={props.rotation}
                scale={props.scale}
                maxSplats={maxSplats}
              />
            </Suspense>
            {nonMeshChildrenEarly}
          </group>
        );
      }

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
            node={node}
            shape={(props.draftShape || props.hsType || 'box') as string}
            showWireframe={props.draftWireframe}
            color={props.draftColor}
          />
        );
      } else if (props.hsType === 'protein_structure' || props.hsType === 'molecule') {
        meshComponent = <BiologicalMeshNode node={node} />;
      } else if (isShaderMesh) {
        meshComponent = <StudioShaderMeshNode node={node} />;
      } else if (isLODMesh) {
        const distances = props.lodDistances || [0, 25, 50];
        meshComponent = <LODMeshNode node={node} distances={distances} />;
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

    case 'group': {
      const { batchableDraftMeshes, rest } = partitionStudioChildren(node.children);
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {batchableDraftMeshes.length > 0 && (
            <StudioDraftMeshBatch key="studio-draft-batch" nodes={batchableDraftMeshes} />
          )}
          {renderStudioChildList(rest)}
        </group>
      );
    }

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
      const animTrait = node.traits?.get('animation');
      const action = animTrait ? ((animTrait.properties?.state as string) ?? 'idle') : 'idle';
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

    default: {
      // Unknown type — wrap in group and render children
      const { batchableDraftMeshes, rest } = partitionStudioChildren(node.children);
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {batchableDraftMeshes.length > 0 && (
            <StudioDraftMeshBatch key="studio-draft-batch" nodes={batchableDraftMeshes} />
          )}
          {renderStudioChildList(rest)}
        </group>
      );
    }
  }
}
