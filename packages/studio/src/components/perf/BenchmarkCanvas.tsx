/**
 * BenchmarkCanvas.tsx
 *
 * R3F canvas for the benchmark scene.
 * Renders N instanced meshes with optional animation.
 * Uses InstancedMesh for performance.
 */

'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import * as THREE from 'three';

// ── Instanced Mesh renderer ───────────────────────────────────────────────────

interface InstancedObjectsProps {
  count: number;
  geometry: 'box' | 'sphere' | 'torus';
  animated: boolean;
}

const SPREAD = 40;

function InstancedObjects({ count, geometry, animated }: InstancedObjectsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Initial positions (random scatter)
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3    ] = (Math.random() - 0.5) * SPREAD;
      arr[i * 3 + 1] = (Math.random() - 0.5) * SPREAD;
      arr[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
    }
    return arr;
  }, [count]);

  const rotationSpeeds = useMemo(() => {
    return new Float32Array(count).map(() => (Math.random() - 0.5) * 2);
  }, [count]);

  // Initialize transforms
  useEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.scale.setScalar(0.3 + Math.random() * 0.4);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [count, positions, dummy]);

  // Animation loop
  useFrame((_, delta) => {
    if (!animated || !meshRef.current) return;
    for (let i = 0; i < count; i++) {
      meshRef.current.getMatrixAt(i, dummy.matrix);
      dummy.rotation.y += delta * rotationSpeeds[i];
      dummy.rotation.x += delta * rotationSpeeds[i] * 0.5;
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const geo = useMemo(() => {
    switch (geometry) {
      case 'sphere': return new THREE.SphereGeometry(0.5, 8, 6);
      case 'torus':  return new THREE.TorusGeometry(0.4, 0.15, 8, 16);
      default:       return new THREE.BoxGeometry(0.8, 0.8, 0.8);
    }
  }, [geometry]);

  return (
    <instancedMesh ref={meshRef} args={[geo, undefined, count]}>
      <meshStandardMaterial color="#7c3aed" roughness={0.4} metalness={0.6} />
    </instancedMesh>
  );
}

// ── FPS Sampler (inside Canvas) ───────────────────────────────────────────────

interface FpsSamplerProps {
  onFpsUpdate: (fps: number) => void;
}

function FpsSampler({ onFpsUpdate }: FpsSamplerProps) {
  const frameTimesRef = useRef<number[]>([]);
  const lastRef = useRef(performance.now());

  useFrame(() => {
    const now = performance.now();
    frameTimesRef.current.push(now - lastRef.current);
    lastRef.current = now;

    if (frameTimesRef.current.length > 30) {
      frameTimesRef.current.shift();
    }

    if (frameTimesRef.current.length === 30) {
      const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / 30;
      onFpsUpdate(Math.round(1000 / avg));
    }
  });

  return null;
}

// ── Canvas ────────────────────────────────────────────────────────────────────

interface BenchmarkCanvasProps {
  objectCount: number;
  geometry: 'box' | 'sphere' | 'torus';
  animated: boolean;
  onFpsUpdate: (fps: number) => void;
}

export default function BenchmarkCanvas({ objectCount, geometry, animated, onFpsUpdate }: BenchmarkCanvasProps) {
  return (
    <Canvas
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 30], fov: 60 }}
      className="h-full w-full"
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />

      <InstancedObjects count={objectCount} geometry={geometry} animated={animated} />
      <FpsSampler onFpsUpdate={onFpsUpdate} />
      <OrbitControls makeDefault />

      {/* drei Stats overlay (top-left) */}
      <Stats className="!top-2 !left-2 !bottom-auto" />
    </Canvas>
  );
}
