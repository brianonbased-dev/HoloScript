/**
 * WaterSurface
 *
 * Shimmering animated water plane with optional volumetric light rays.
 * Uses a simple vertex displacement shader for surface ripples.
 * Light rays are transparent cone/cylinder meshes at random angles.
 *
 * Represents the "surface" of the underwater world — always alive.
 *
 * @module holoshell/phenomena/WaterSurface
 */

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { WaterSurfaceProps } from '../types';

const vertexShader = `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uFrequency;

  varying vec2 vUv;
  varying float vElevation;

  void main() {
    vUv = uv;

    // Gentle multi-octave ripple displacement
    float wave1 = sin(position.x * uFrequency + uTime * 1.3) * cos(position.z * uFrequency * 0.7 + uTime * 0.9);
    float wave2 = sin(position.z * uFrequency * 1.4 + uTime * 1.8) * 0.6;
    float wave3 = sin((position.x + position.z) * uFrequency * 0.5 + uTime * 2.1) * 0.35;

    float elevation = (wave1 + wave2 + wave3) * uAmplitude;
    vElevation = elevation;

    vec3 pos = position;
    pos.y += elevation;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vElevation;

  void main() {
    // Subtle caustic shimmer based on elevation + time
    float shimmer = sin(vUv.x * 18.0 + uTime * 3.5) * cos(vUv.y * 14.0 + uTime * 2.8) * 0.5 + 0.5;
    shimmer = mix(0.6, 1.0, shimmer * (0.5 + vElevation * 2.0));

    vec3 col = uColor * shimmer;
    float alpha = uOpacity * (0.85 + vElevation * 1.8);

    gl_FragColor = vec4(col, clamp(alpha, 0.4, 0.96));
  }
`;

export const WaterSurface: React.FC<WaterSurfaceProps> = ({
  position = [0, 1.5, -1.5],
  rotation = [-Math.PI * 0.5, 0, 0],
  scale = 1,
  color = '#1a6fa8',
  lightRays = true,
  rayCount = 6,
  rayOpacity = 0.4,
  caustics = true,
}) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0.035 },
      uFrequency: { value: 2.8 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.82 },
    }),
    [color]
  );

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [uniforms]);

  // Light ray cylinders (volumetric god rays)
  const lightRaysGroup = useMemo(() => {
    if (!lightRays) return null;

    const rays: React.ReactNode[] = [];
    for (let i = 0; i < rayCount; i++) {
      const seed = i * 17.3;
      const angleX = ((seed % 7) - 3.5) * 0.08;
      const angleZ = ((seed % 5) - 2.5) * 0.06;
      const x = (seed % 9 - 4) * 0.55;
      const z = -0.8 + ((seed * 3) % 7) * 0.18;
      const height = 3.2 + (seed % 4) * 0.4;
      const radius = 0.18 + (seed % 6) * 0.04;

      rays.push(
        <mesh
          key={i}
          position={[x, height * 0.5 - 0.4, z]}
          rotation={[angleX, 0, angleZ]}
        >
          <cylinderGeometry args={[radius * 0.6, radius, height, 5, 1, true]} />
          <meshBasicMaterial
            color="#c8e8ff"
            transparent
            opacity={rayOpacity * (0.6 + ((i % 3) / 5) * 0.5)}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      );
    }
    return <group>{rays}</group>;
  }, [lightRays, rayCount, rayOpacity]);

  // Animate shader time + gentle plane motion
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * 0.8;
    }
    if (meshRef.current) {
      // Very subtle surface breathing
      const t = state.clock.elapsedTime;
      meshRef.current.rotation.z = Math.sin(t * 0.12) * 0.003;
    }
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Main water plane */}
      <mesh ref={meshRef} renderOrder={1}>
        <planeGeometry args={[9, 7, 48, 48]} />
        <primitive ref={materialRef} object={shaderMaterial} attach="material" />
      </mesh>

      {/* Light rays (god rays) */}
      {lightRaysGroup}

      {/* Subtle surface highlight line (specular) */}
      <mesh position={[0, 0.01, 0]} rotation={[Math.PI * -0.5, 0, 0]}>
        <planeGeometry args={[8.5, 6.5]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};

export default WaterSurface;
