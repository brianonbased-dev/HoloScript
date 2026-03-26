import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Environment, Float } from '@react-three/drei';
import * as THREE from 'three';

function LiquidSphere() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.2;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    // @ts-ignore
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      {/* @ts-ignore */}
      <mesh ref={meshRef as any} scale={1.2}>
        <sphereGeometry args={[1, 64, 64]} />
        {/* @ts-ignore */}
        <MeshDistortMaterial
          color="#ff00ff"
          emissive="#aa00ff"
          emissiveIntensity={0.5}
          distort={0.4}
          speed={3}
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>
    </Float>
  );
}

export default function LiquidBlob() {
  return (
    <div className="w-full h-96 relative flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 z-0">
        {/* @ts-ignore */}
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={1} />
          <directionalLight position={[10, 10, 5]} intensity={2} />
          <pointLight position={[-10, -10, -5]} intensity={1} color="#00ffff" />
          <React.Suspense fallback={null}>
            <Environment preset="city" />
            <LiquidSphere />
          </React.Suspense>
        </Canvas>
      </div>
    </div>
  );
}
