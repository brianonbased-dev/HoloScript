'use client';

/**
 * SimPreviewCanvas
 *
 * Dedicated R3F canvas for /create?mode=sim.
 * Mirrors PartPreviewCanvas: isolated canvas, no main SceneRenderer context.
 *
 * Render paths:
 *   kind 'particles'   → InstancedMesh spheres from flat xyz positions array
 *   kind 'scalarField' → colored plane heatmap of the mid-Z slice
 *                        (blue→red gradient via DataTexture)
 *
 * No @holoscript/engine import — engine is server-only.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { RefreshCw } from 'lucide-react';
import type { SimRunResult } from './useSimState';

// ── Particle visualization ────────────────────────────────────────────────────

function ParticlesView({ positions }: { positions: number[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const particleCount = Math.floor(positions.length / 3);

  // Build instanced mesh matrices once per positions change
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (!meshRef.current || particleCount === 0) return;
    for (let i = 0; i < particleCount; i++) {
      const x = positions[i * 3] ?? 0;
      const y = positions[i * 3 + 1] ?? 0;
      const z = positions[i * 3 + 2] ?? 0;
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, particleCount, dummy]);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.15;
  });

  if (particleCount === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
      <sphereGeometry args={[0.03, 6, 6]} />
      <meshPhysicalMaterial
        color="#6366f1"
        metalness={0.2}
        roughness={0.5}
        emissive="#3730a3"
        emissiveIntensity={0.2}
      />
    </instancedMesh>
  );
}

// ── Scalar field heatmap visualization ───────────────────────────────────────

/**
 * Maps a normalised value [0,1] to a blue→cyan→green→yellow→red gradient.
 * Writes into `out` at byte offset `offset` (RGBA).
 */
function heatmapColor(t: number, out: Uint8Array, offset: number): void {
  // 4-stop gradient: blue(0) → cyan(0.25) → green(0.5) → yellow(0.75) → red(1)
  const r0 = [0, 0, 255];
  const r1 = [0, 255, 255];
  const r2 = [0, 255, 0];
  const r3 = [255, 255, 0];
  const r4 = [255, 0, 0];
  const stops = [r0, r1, r2, r3, r4];

  const seg = t * 4;
  const i = Math.min(Math.floor(seg), 3);
  const f = seg - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;

  out[offset] = Math.round(a[0]! + (b[0]! - a[0]!) * f);
  out[offset + 1] = Math.round(a[1]! + (b[1]! - a[1]!) * f);
  out[offset + 2] = Math.round(a[2]! + (b[2]! - a[2]!) * f);
  out[offset + 3] = 255;
}

function ScalarFieldView({
  field,
}: {
  field: { resolution: [number, number, number]; values: number[] };
}) {
  const { resolution, values } = field;
  const [rx, ry, rz] = resolution;

  // Pick mid-Z slice
  const midZ = Math.floor((rz ?? 1) / 2);
  const sliceSize = (rx ?? 1) * (ry ?? 1);
  const offset = midZ * sliceSize;

  const texture = useMemo(() => {
    const width = rx ?? 1;
    const height = ry ?? 1;
    const data = new Uint8Array(width * height * 4);

    // Compute min/max for normalisation
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let j = 0; j < sliceSize; j++) {
      const v = values[offset + j] ?? 0;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
    const range = maxVal - minVal || 1;

    for (let j = 0; j < sliceSize; j++) {
      const v = values[offset + j] ?? 0;
      const t = Math.max(0, Math.min(1, (v - minVal) / range));
      heatmapColor(t, data, j * 4);
    }

    const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, [values, rx, ry, offset, sliceSize]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SimPreviewCanvasProps {
  result: SimRunResult | null;
}

export function SimPreviewCanvas({ result }: SimPreviewCanvasProps) {
  const loading = !result;

  return (
    <div className="relative w-full h-full bg-[#07090f]">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
          <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-indigo-400 animate-spin" />
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            Run a simulation to see results…
          </div>
        </div>
      )}

      {/* Label */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur text-[10px] text-white/40 font-mono">
        Sim Preview
        {result && (
          <span className="text-indigo-400/70">{result.kind === 'particles' ? 'particles' : 'scalar field'}</span>
        )}
      </div>

      <Canvas
        camera={{ position: [3, 2, 3], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
        shadows
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 3]} intensity={1.0} castShadow />
        <directionalLight position={[-2, -1, -2]} intensity={0.2} />

        {result?.kind === 'particles' && result.positions && result.positions.length > 0 && (
          <ParticlesView positions={result.positions} />
        )}

        {result?.kind === 'scalarField' && result.field && (
          <ScalarFieldView field={result.field} />
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
          position={[0, -1, 0]}
        />

        <OrbitControls enablePan makeDefault />
      </Canvas>
    </div>
  );
}
