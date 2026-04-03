'use client';

import { Suspense, useRef, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useSkeletalAnimation } from '@/hooks/useSkeletalAnimation';

import { useSceneGraphStore, useEditorStore } from '@/lib/stores';
import type { R3FNode } from '@holoscript/core';

interface GLTFModelNodeProps {
  node: R3FNode;
  src: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  action?: string;
  animations?: THREE.AnimationClip[];
}

function GLTFModel({
  node,
  src,
  position,
  rotation,
  scale,
  action,
  animations: propAnimations,
}: GLTFModelNodeProps) {
  const { scene, animations: gltfAnimations } = useGLTF(src);
  const ref = useRef<THREE.Group>(null);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const setNodeRef = useSceneGraphStore((s) => s.setNodeRef);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);

  // Use either the provided animations (e.g., from userData) or the ones embedded in the GLTF
  const activeAnimations = propAnimations || gltfAnimations;

  useSkeletalAnimation(ref, activeAnimations, action);

  useEffect(() => {
    if (ref.current && node.id) {
      ref.current.userData.availableAnimations = activeAnimations?.map((a) => a.name) || [];
      ref.current.userData.nodeId = node.id;
      setNodeRef(node.id, ref.current);
    }
  }, [node.id, setNodeRef, activeAnimations]);

  const isSelected = selectedId === node.id;

  return (
    <group>
      <primitive
        ref={ref}
        object={clonedScene}
        position={position}
        rotation={rotation?.map((r) => THREE.MathUtils.degToRad(r)) as [number, number, number]}
        scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
        userData={{ nodeId: node.id }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(node.id || null);
        }}
      />
      {isSelected && (
        <mesh
          position={position}
          rotation={rotation?.map((r) => THREE.MathUtils.degToRad(r)) as [number, number, number]}
          scale={
            typeof scale === 'number'
              ? [scale * 1.05, scale * 1.05, scale * 1.05]
              : [(scale?.[0] || 1) * 1.05, (scale?.[1] || 1) * 1.05, (scale?.[2] || 1) * 1.05]
          }
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
        </mesh>
      )}
    </group>
  );
}

export function GLTFModelNode(props: GLTFModelNodeProps) {
  if (!props.src) {
    return (
      <mesh position={props.position} rotation={props.rotation}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ff6b6b" wireframe />
      </mesh>
    );
  }

  return (
    <Suspense
      fallback={
        <mesh position={props.position} rotation={props.rotation}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#666666" wireframe />
        </mesh>
      }
    >
      <GLTFModel {...props} />
    </Suspense>
  );
}
