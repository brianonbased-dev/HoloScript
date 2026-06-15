import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Environment, Float } from '@react-three/drei';
import * as THREE from 'three';

// Full-viewport ambient version of the pink LiquidBlob, used as the page
// background (the original LiquidBlob is card-sized). Big, slow, glowing —
// pointer-events-none and behind all content, with a scrim for text legibility.
function BackgroundSphere() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.12;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.18;
    }
  });

  return (
    // @ts-ignore
    <Float speed={1.4} rotationIntensity={1} floatIntensity={1.6}>
      {/* @ts-ignore */}
      <mesh ref={meshRef as any} scale={2.7}>
        <sphereGeometry args={[1, 64, 64]} />
        {/* @ts-ignore */}
        <MeshDistortMaterial
          color="#ff00ff"
          emissive="#aa00ff"
          emissiveIntensity={0.6}
          distort={0.45}
          speed={2.2}
          roughness={0.12}
          metalness={0.85}
        />
      </mesh>
    </Float>
  );
}

export default function LiquidBlobBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      {/* @ts-ignore */}
      <Canvas camera={{ position: [0, 0, 6], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 10, 5]} intensity={1.6} />
        <pointLight position={[-10, -10, -5]} intensity={1.2} color="#00ffff" />
        <React.Suspense fallback={null}>
          <Environment preset="city" />
          <BackgroundSphere />
        </React.Suspense>
      </Canvas>
      {/* Readability scrim + vignette so foreground text stays legible over the glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/40 via-[#050505]/55 to-[#050505]/75" />
    </div>
  );
}
