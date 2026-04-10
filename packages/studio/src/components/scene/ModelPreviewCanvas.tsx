'use client';

/**
 * ModelPreviewCanvas — Live 3D preview for model presets
 *
 * Renders a small R3F <Canvas> with the actual geometry, material, and
 * auto-rotation. Used in template pickers, asset palettes, and model browsers.
 *
 * The key insight: instead of static PNG screenshots, we render the REAL
 * Three.js geometry in a tiny canvas. This gives interactive hover-to-rotate,
 * live lighting, and perfect resolution at any size.
 */

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import type { Mesh, Group } from 'three';
import { ErrorBoundary as StudioErrorBoundary } from '@holoscript/ui';

// ═══════════════════════════════════════════════════════════════════
// Geometry lookup
// ═══════════════════════════════════════════════════════════════════

function PreviewGeometry({ type }: { type: string }) {
  switch (type) {
    case 'cube':
    case 'box':
      return <boxGeometry args={[1, 1, 1]} />;
    case 'sphere':
    case 'ball':
      return <sphereGeometry args={[0.6, 32, 32]} />;
    case 'cylinder':
    case 'tube':
      return <cylinderGeometry args={[0.4, 0.4, 1, 32]} />;
    case 'cone':
    case 'pyramid':
      return <coneGeometry args={[0.5, 1, 32]} />;
    case 'torus':
    case 'donut':
      return <torusGeometry args={[0.45, 0.15, 16, 32]} />;
    case 'plane':
    case 'flat':
      return <planeGeometry args={[1, 1]} />;
    case 'capsule':
      return <capsuleGeometry args={[0.3, 0.5, 4, 16]} />;
    case 'ring':
      return <ringGeometry args={[0.3, 0.5, 32]} />;
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Tree (two meshes: trunk + canopy)
// ═══════════════════════════════════════════════════════════════════

function TreePreview() {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.3;
  });
  return (
    <group ref={groupRef} position={[0, -0.3, 0]}>
      {/* Trunk */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#8B5E3C" roughness={0.9} />
      </mesh>
      {/* Canopy */}
      <mesh position={[0, 0.8, 0]}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshStandardMaterial color="#2D8B4E" roughness={0.7} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Auto-rotating mesh wrapper
// ═══════════════════════════════════════════════════════════════════

function SpinningMesh({
  type,
  color = '#6366f1',
  metalness = 0.3,
  roughness = 0.4,
}: {
  type: string;
  color?: string;
  metalness?: number;
  roughness?: number;
}) {
  const meshRef = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
      meshRef.current.rotation.x += delta * 0.15;
    }
  });

  return (
    <mesh ref={meshRef} castShadow>
      <PreviewGeometry type={type} />
      <meshPhysicalMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        clearcoat={0.3}
        clearcoatRoughness={0.2}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Light presets preview (just shows an icon-like glow)
// ═══════════════════════════════════════════════════════════════════

function LightPreview({ type }: { type: string }) {
  const color = type === 'spot-light' ? '#fbbf24' : type === 'area-light' ? '#818cf8' : '#ffffff';
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Glow ring */}
      <mesh>
        <ringGeometry args={[0.3, 0.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} />
      </mesh>
      <pointLight color={color} intensity={2} distance={3} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════

export interface ModelPreviewCanvasProps {
  /** Model type string (cube, sphere, torus, tree, point-light, etc.) */
  modelType: string;
  /** CSS width (default: '100%') */
  width?: string | number;
  /** CSS height (default: 120) */
  height?: string | number;
  /** Material color (default: '#6366f1') */
  color?: string;
  /** Enable orbit controls for manual rotation (default: false) */
  interactive?: boolean;
  /** CSS class for the outer container */
  className?: string;
}

export function ModelPreviewCanvas({
  modelType,
  width = '100%',
  height = 120,
  color = '#6366f1',
  interactive = false,
  className = '',
}: ModelPreviewCanvasProps) {
  const isLight = modelType.includes('light');
  const isTree = modelType === 'tree';

  return (
    <div
      className={`bg-[#0a0a14] rounded-lg overflow-hidden ${className}`}
      style={{ width, height }}
    >
      <StudioErrorBoundary label="ModelPreview Canvas">
      <Canvas
        camera={{ position: [0, 0.2, 2.2], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {/* Ambient + directional */}
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 4, 5]} intensity={1} color="#ffffff" />
        <directionalLight position={[-2, -1, -3]} intensity={0.3} color="#818cf8" />

        <Suspense fallback={null}>
          {isTree ? (
            <TreePreview />
          ) : isLight ? (
            <LightPreview type={modelType} />
          ) : (
            <SpinningMesh type={modelType} color={color} />
          )}
          <Environment preset="studio" environmentIntensity={0.3} />
        </Suspense>

        {interactive && (
          <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={2} />
        )}
      </Canvas>
      </StudioErrorBoundary>
    </div>
  );
}

/**
 * Tiny inline preview — sized for list items (40x40).
 */
export function ModelPreviewInline({ modelType, color }: { modelType: string; color?: string }) {
  return (
    <ModelPreviewCanvas
      modelType={modelType}
      width={40}
      height={40}
      color={color}
      className="rounded"
    />
  );
}
