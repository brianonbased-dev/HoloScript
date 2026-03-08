'use client';

import { Suspense } from 'react';
import { useGLTF } from '@react-three/drei';

interface GLTFModelNodeProps {
  src: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
}

function GLTFModel({ src, position, rotation, scale }: GLTFModelNodeProps) {
  const { scene } = useGLTF(src);

  return (
    <primitive
      object={scene.clone()}
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
    />
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
