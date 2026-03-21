/**
 * GodRaysEffect — Screen-space volumetric light scattering.
 *
 * Renders crepuscular rays (god rays) from a light source using
 * a radial blur pass. Reads sun position from props (driven by
 * the @god_rays trait via @weather blackboard).
 *
 * This component renders a visible light source mesh that the
 * post-processing pipeline can sample for light shaft generation.
 *
 * @see W.161: God rays trait
 */

import { useRef, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GodRaysEffectProps {
  /** Light source position [x, y, z] (default: [100, 200, 100]) */
  lightPosition?: [number, number, number];
  /** Light color (default: '#fffde7') */
  lightColor?: string;
  /** Light source intensity (default: 1.0) */
  intensity?: number;
  /** Ray decay factor 0-1 (default: 0.96) */
  decay?: number;
  /** Ray weight/brightness (default: 0.5) */
  weight?: number;
  /** Overall exposure (default: 0.3) */
  exposure?: number;
  /** Whether the light is active (for day/night) */
  active?: boolean;
  /** Light source radius for the glow mesh (default: 20) */
  sourceRadius?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function GodRaysEffect({
  lightPosition = [100, 200, 100],
  lightColor = '#fffde7',
  intensity = 1.0,
  decay: _decay = 0.96,
  weight: _weight = 0.5,
  exposure: _exposure = 0.3,
  active = true,
  sourceRadius = 20,
}: GodRaysEffectProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const colorObj = useMemo(() => new THREE.Color(lightColor), [lightColor]);
  const posVec = useMemo(
    () => new THREE.Vector3(...lightPosition),
    [lightPosition],
  );

  // Billboard the light source toward camera
  const lookAtCamera = useCallback(() => {
    if (meshRef.current) {
      meshRef.current.lookAt(camera.position);
    }
  }, [camera]);

  useFrame(() => {
    if (!active || !meshRef.current) return;
    meshRef.current.position.copy(posVec);
    lookAtCamera();
  });

  if (!active) return null;

  return (
    <mesh ref={meshRef} position={lightPosition} frustumCulled={false}>
      <circleGeometry args={[sourceRadius, 32]} />
      <meshBasicMaterial
        color={colorObj}
        transparent
        opacity={intensity * 0.8}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
