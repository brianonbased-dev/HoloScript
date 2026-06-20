'use client';

import { MeshDistortMaterial } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import React from 'react';
import * as THREE from 'three';

interface R3FLiquidBlobBackgroundProps {
  onReady?: () => void;
}

function CanvasSizeGuard({ onReady }: R3FLiquidBlobBackgroundProps) {
  const gl = useThree((state) => state.gl);
  const setSize = useThree((state) => state.setSize);
  const readyRef = React.useRef(false);

  React.useEffect(() => {
    const syncSize = () => {
      const width = Math.max(window.innerWidth, 1);
      const height = Math.max(window.innerHeight, 1);
      setSize(width, height);
      gl.setSize(width, height, false);
      gl.setClearColor(0x000000, 0);

      if (!readyRef.current) {
        readyRef.current = true;
        onReady?.();
      }
    };

    syncSize();
    const frame = window.requestAnimationFrame(syncSize);
    const timeout = window.setTimeout(syncSize, 150);
    window.addEventListener('resize', syncSize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.removeEventListener('resize', syncSize);
    };
  }, [gl, onReady, setSize]);

  return null;
}

function LiquidBlobScene() {
  const groupRef = React.useRef<THREE.Group>(null);
  const mainBlobRef = React.useRef<THREE.Mesh>(null);
  const cyanBlobRef = React.useRef<THREE.Mesh>(null);
  const violetBlobRef = React.useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(elapsed * 0.18) * 0.08;
      groupRef.current.position.y = Math.sin(elapsed * 0.28) * 0.12;
    }

    if (mainBlobRef.current) {
      mainBlobRef.current.rotation.x = elapsed * 0.11;
      mainBlobRef.current.rotation.y = elapsed * 0.16;
      mainBlobRef.current.scale.setScalar(1 + Math.sin(elapsed * 0.72) * 0.035);
    }

    if (cyanBlobRef.current) {
      cyanBlobRef.current.rotation.y = -elapsed * 0.14;
      cyanBlobRef.current.position.x = 1.12 + Math.sin(elapsed * 0.45) * 0.08;
    }

    if (violetBlobRef.current) {
      violetBlobRef.current.rotation.x = -elapsed * 0.1;
      violetBlobRef.current.position.x = -1.16 + Math.cos(elapsed * 0.36) * 0.09;
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={1.25} />
      <directionalLight color="#ffffff" intensity={1.35} position={[2.5, 3.5, 4]} />
      <pointLight color="#ff4fd8" intensity={9} position={[-2.8, 1.8, 2.4]} />
      <pointLight color="#67e8f9" intensity={6.5} position={[2.7, -1.3, 2.2]} />

      <mesh ref={mainBlobRef} position={[0.08, 0.02, 0]} rotation={[0.22, -0.42, 0.08]} scale={[2.85, 1.82, 1.16]}>
        <sphereGeometry args={[1, 96, 96]} />
        <MeshDistortMaterial
          clearcoat={0.9}
          color="#ff4fd8"
          distort={0.5}
          emissive="#6d0f6f"
          emissiveIntensity={0.48}
          metalness={0.05}
          opacity={0.82}
          roughness={0.18}
          speed={1.25}
          transparent
        />
      </mesh>

      <mesh ref={cyanBlobRef} position={[1.12, -0.12, -0.34]} rotation={[-0.1, 0.55, -0.38]} scale={[1.6, 1.12, 0.86]}>
        <sphereGeometry args={[1, 72, 72]} />
        <MeshDistortMaterial
          clearcoat={0.7}
          color="#38d7ff"
          distort={0.42}
          emissive="#075985"
          emissiveIntensity={0.42}
          metalness={0.05}
          opacity={0.55}
          roughness={0.25}
          speed={0.95}
          transparent
        />
      </mesh>

      <mesh ref={violetBlobRef} position={[-1.16, 0.2, -0.52]} rotation={[0.38, -0.25, 0.42]} scale={[1.42, 1.05, 0.8]}>
        <sphereGeometry args={[1, 72, 72]} />
        <MeshDistortMaterial
          clearcoat={0.75}
          color="#8b5cf6"
          distort={0.38}
          emissive="#312e81"
          emissiveIntensity={0.36}
          metalness={0.04}
          opacity={0.48}
          roughness={0.26}
          speed={0.82}
          transparent
        />
      </mesh>
    </group>
  );
}

export default function R3FLiquidBlobBackground({ onReady }: R3FLiquidBlobBackgroundProps) {
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => setReducedMotion(media.matches);

    syncMotionPreference();
    media.addEventListener('change', syncMotionPreference);

    return () => media.removeEventListener('change', syncMotionPreference);
  }, []);

  if (reducedMotion) {
    return null;
  }

  return (
    <div className="absolute inset-0 h-screen min-h-[100svh] w-screen" data-liquid-blob-canvas>
      <Canvas
        camera={{ fov: 42, position: [0, 0, 6.7] }}
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
        }}
        style={{ display: 'block', height: '100%', width: '100%' }}
      >
        <CanvasSizeGuard onReady={onReady} />
        <LiquidBlobScene />
      </Canvas>
    </div>
  );
}
