'use client';

/**
 * ParametricPartDemo — Landing hero demo showing a CADAM-style parametric part.
 *
 * Renders a mounting plate (box minus cylinder hole) defined as an SDF literal.
 * Sliders drive hole radius and plate thickness → debounced POST to
 * /api/manufacturing/mesh → BufferGeometry rendered in an R3F canvas.
 *
 * Architecture notes:
 * - No engine import on the client. All meshing is server-side via the API routes.
 * - Three.js / R3F is client-only via dynamic import with ssr:false from the parent.
 * - Printability verdict is surfaced as a chip ("Printable" / "Needs Supports").
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Download, RefreshCw } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PrintabilityReport {
  watertight: boolean;
  manifold: boolean;
  volume: number;
  recommendation: 'printable' | 'needs-supports' | 'not-printable';
  overhangs: { count: number };
}

interface MeshResult {
  positions: number[];
  indices: number[];
  printability: PrintabilityReport;
}

// ── SDF builder ──────────────────────────────────────────────────────────────

/**
 * Build the SDF JSON for a mounting plate: box minus a cylindrical hole.
 *
 * The SDF node shape matches SDFNode from @holoscript/engine/simulation.
 * This literal is serialized to JSON and sent to /api/manufacturing/mesh.
 */
function buildMountingPlateSDF(holeRadius: number, thickness: number) {
  // Plate: 2×thickness×2 box (width=2, height=thickness, depth=2)
  const plate = {
    type: 'primitive',
    primitive: 'box',
    params: { halfX: 1.0, halfY: thickness * 0.5, halfZ: 1.0 },
  };

  // Hole: infinite cylinder on the Y axis
  const hole = {
    type: 'primitive',
    primitive: 'cylinder',
    params: { radius: holeRadius, halfHeight: 2.0 },
    // Cylinder is Y-axis-aligned in SDFPointEvaluator
  };

  // Subtract hole from plate (CSG difference)
  return {
    type: 'csg',
    operation: 'difference',
    children: [plate, hole],
  };
}

// ── Mesh geometry component ──────────────────────────────────────────────────

function PartMesh({ positions, indices }: { positions: number[]; indices: number[] }) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Auto-rotate slowly
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.4;
  });

  // Build BufferGeometry from flat arrays
  const geometry = React.useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
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

export function ParametricPartDemo() {
  const [holeRadius, setHoleRadius] = useState(0.25);
  const [thickness, setThickness] = useState(0.3);
  const [meshResult, setMeshResult] = useState<MeshResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMesh = useCallback(
    async (radius: number, thick: number) => {
      setLoading(true);
      setError(null);
      try {
        const sdf = buildMountingPlateSDF(radius, thick);
        const bounds = { min: [-1.2, -0.8, -1.2], max: [1.2, 0.8, 1.2] };
        const res = await fetch('/api/manufacturing/mesh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdf, resolution: [40, 40, 40], bounds }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as MeshResult;
        setMeshResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounced re-fetch on slider change (300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchMesh(holeRadius, thickness);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [holeRadius, thickness, fetchMesh]);

  const handleDownloadSTL = async () => {
    const sdf = buildMountingPlateSDF(holeRadius, thickness);
    const bounds = { min: [-1.2, -0.8, -1.2], max: [1.2, 0.8, 1.2] };
    const res = await fetch('/api/manufacturing/stl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdf, resolution: [40, 40, 40], bounds }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mounting-plate.stl';
    a.click();
    URL.revokeObjectURL(url);
  };

  const rec = meshResult?.printability?.recommendation;

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#0d0f1a] overflow-hidden">
      {/* Header — wraps at narrow widths; title truncates before actions are pushed off */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-white/50 text-xs font-mono">mounting-plate.holo</span>
          {loading && (
            <RefreshCw className="h-3 w-3 shrink-0 text-white/30 animate-spin" />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rec && (
            <span
              className={`whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                rec === 'printable'
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : rec === 'needs-supports'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {rec === 'printable'
                ? 'Printable'
                : rec === 'needs-supports'
                ? 'Needs Supports'
                : 'Not Printable'}
            </span>
          )}
          <button
            onClick={() => void handleDownloadSTL()}
            disabled={!meshResult || loading}
            className="flex min-h-[28px] items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-30"
            title="Download STL"
          >
            <Download className="h-3.5 w-3.5" />
            STL
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative h-52 bg-[#070910]">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-400/60 text-xs px-4 text-center">
            {error}
          </div>
        ) : (
          <Canvas
            camera={{ position: [2.5, 1.5, 2.5], fov: 40 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent' }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[3, 4, 3]} intensity={1.2} castShadow />
            <directionalLight position={[-2, -1, -2]} intensity={0.3} />
            {meshResult && meshResult.positions.length > 0 && (
              <PartMesh
                positions={meshResult.positions}
                indices={meshResult.indices}
              />
            )}
            <OrbitControls enablePan={false} enableZoom={false} />
          </Canvas>
        )}
        {loading && !meshResult && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
          </div>
        )}
      </div>

      {/* Sliders */}
      <div className="px-4 py-3 space-y-3 border-t border-white/5">
        <SliderRow
          label="Hole radius"
          value={holeRadius}
          min={0.05}
          max={0.5}
          step={0.01}
          format={(v) => v.toFixed(2)}
          unit="u"
          onChange={setHoleRadius}
        />
        <SliderRow
          label="Plate thickness"
          value={thickness}
          min={0.1}
          max={0.8}
          step={0.01}
          format={(v) => v.toFixed(2)}
          unit="u"
          onChange={setThickness}
        />
      </div>
    </div>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-white/40 text-xs w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-indigo-500"
      />
      <span className="text-white/50 text-xs w-20 text-right shrink-0 font-mono whitespace-nowrap">
        {format(value)}&thinsp;{unit}
      </span>
    </div>
  );
}
