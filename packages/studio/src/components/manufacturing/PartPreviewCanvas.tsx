'use client';

/**
 * PartPreviewCanvas
 *
 * Dedicated R3F canvas that renders the current part mesh for /create?mode=part.
 *
 * This is an isolated canvas — it does NOT share the main SceneRenderer context.
 * This is intentional: injecting a raw mesh into the vibe SceneRenderer would
 * require threading the geometry through the R3F/R3FTree pipeline which is more
 * invasive. A dedicated canvas is the lower blast-radius option.
 *
 * Props:
 *   meshResult — the most recent /api/manufacturing/mesh response (or null while loading).
 *
 * Architecture: no @holoscript/engine import — engine is server-only (see next.config.js alias).
 */

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { RefreshCw } from 'lucide-react';
import type { MeshResult } from './ParametricSlidersPanel';

// ── Animated mesh ─────────────────────────────────────────────────────────────

function PartMesh({ positions, indices }: { positions: number[]; indices: number[] }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.3;
  });

  const geometry = React.useMemo(() => {
    const geo = new THREE.BufferGeometry();
    // Engine emits f64; Three.js wants f32. Array.from cast is intentional.
    geo.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(positions), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [positions, indices]);

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color="#6366f1"
        metalness={0.4}
        roughness={0.3}
        clearcoat={0.4}
        clearcoatRoughness={0.2}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface PartPreviewCanvasProps {
  meshResult: MeshResult | null;
}

export function PartPreviewCanvas({ meshResult }: PartPreviewCanvasProps) {
  const loading = !meshResult;

  return (
    <div className="relative w-full h-full bg-[#07090f]">
      {/* Loading spinner — shown until first mesh arrives */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
          <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-indigo-400 animate-spin" />
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            Computing mesh…
          </div>
        </div>
      )}

      {/* Label */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur text-[10px] text-white/40 font-mono">
        Part Preview
      </div>

      <Canvas
        camera={{ position: [2.5, 1.8, 2.5], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
        shadows
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 4, 3]} intensity={1.2} castShadow />
        <directionalLight position={[-2, -1, -2]} intensity={0.3} />

        {meshResult && meshResult.positions.length > 0 && (
          <PartMesh positions={meshResult.positions} indices={meshResult.indices} />
        )}

        <Grid
          args={[10, 10]}
          cellSize={0.5}
          cellThickness={0.3}
          cellColor="#1e1e3a"
          sectionSize={2}
          sectionThickness={0.6}
          sectionColor="#2e2e5a"
          fadeDistance={12}
          position={[0, -0.85, 0]}
          rotation={[0, 0, 0]}
        />

        <OrbitControls enablePan makeDefault />
      </Canvas>
    </div>
  );
}
