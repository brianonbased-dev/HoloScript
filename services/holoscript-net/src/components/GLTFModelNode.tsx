'use client';

import { Suspense, useRef, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useSkeletalAnimation } from '../hooks/useSkeletalAnimation';
import type { R3FNode } from '@holoscript/core';
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

function GLTFModel({ node, src, position, rotation, scale, action, animations: propAnimations }: GLTFModelNodeProps) {
  const { scene, animations: gltfAnimations } = useGLTF(src);
  const ref = useRef<THREE.Group>(null);
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  // Use either the provided animations (e.g., from userData) or the ones embedded in the GLTF
  const activeAnimations = propAnimations || gltfAnimations;

  useSkeletalAnimation(ref, activeAnimations, action);

  useEffect(() => {
    if (ref.current && node.id) {
      ref.current.userData.availableAnimations = activeAnimations?.map(a => a.name) || [];
      ref.current.userData.nodeId = node.id;
    }
  }, [node.id, activeAnimations]);

  return (
    <group>
      <primitive
        ref={ref}
        object={clonedScene}
        position={position}
        rotation={rotation?.map((r) => THREE.MathUtils.degToRad(r)) as [number, number, number]}
        scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
        userData={{ nodeId: node.id }}
      />
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
