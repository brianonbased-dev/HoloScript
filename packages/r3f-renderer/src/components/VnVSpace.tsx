/**
 * VnVSpace — Immersive 3D Verification & Validation results space.
 *
 * A walkable 3D environment where professionals can explore simulation
 * V&V results spatially. Composes three visualization layers:
 *
 * **Zone 1 — Convergence Gallery** (left wing)
 *   Walk through 3D log-log convergence plots. Each solver's convergence
 *   data is a physical structure with data point spheres, regression tubes,
 *   and GCI uncertainty ribbons.
 *
 * **Zone 2 — Mesh Refinement Hall** (center)
 *   Side-by-side mesh refinement levels arranged as a spatial sequence.
 *   Walk between coarse and fine meshes, comparing wireframe density,
 *   colormapped solution fields, and element counts.
 *
 * **Zone 3 — Uncertainty Theater** (right wing)
 *   The simulation result mesh wrapped in volumetric uncertainty clouds.
 *   Dense fog = high uncertainty. Clear regions = converged solution.
 *   Walk through to find hotspots.
 *
 * **Shared Infrastructure:**
 * - Ambient environment with floor grid and soft lighting
 * - Benchmark status indicators (pass/fail pillars)
 * - Software version and timestamp anchored to the scene
 *
 * @see ConvergencePlot3D — Zone 1 component
 * @see MeshRefinementCompare — Zone 2 component
 * @see UncertaintyCloud — Zone 3 component
 * @see useVnVData — data transformation hook
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { ConvergencePlot3D } from './ConvergencePlot3D';
import { MeshRefinementCompare } from './MeshRefinementCompare';
import type { MeshLevel, CompareLayout } from './MeshRefinementCompare';
import { UncertaintyCloud } from './UncertaintyCloud';
import type { ColormapName } from './ScalarFieldOverlay';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VnVSpaceProps {
  /** V&V convergence series for the convergence gallery */
  convergenceSeries?: import('./ConvergencePlot3D').ConvergenceSeries[];
  /** Observed convergence order */
  observedOrder?: number;
  /** Theoretical convergence order */
  theoreticalOrder?: number;
  /** Richardson extrapolation estimate */
  richardsonEstimate?: number;
  /** Grid Convergence Index */
  gci?: number;

  /** Mesh refinement levels for the comparison hall */
  meshLevels?: MeshLevel[];
  /** Mesh comparison layout */
  meshLayout?: CompareLayout;

  /** Node positions for uncertainty visualization */
  uncertaintyNodePositions?: Float64Array | Float32Array;
  /** Per-node uncertainty values */
  uncertaintyValues?: Float32Array | Float64Array;

  /** Per-benchmark pass/fail status */
  benchmarkStatus?: BenchmarkStatusItem[];

  /** Colormap used across all zones (default: 'turbo') */
  colormap?: ColormapName;
  /** Scalar range for mesh levels */
  scalarRange?: [number, number];
  /** Zone spacing in world units (default: 12) */
  zoneSpacing?: number;
  /** Whether to show floor grid */
  showFloor?: boolean;
  /** Whether to show ambient lighting */
  showLighting?: boolean;
  /** Whether the space is visible */
  visible?: boolean;
}

export interface BenchmarkStatusItem {
  name: string;
  solver: string;
  passed: boolean;
  errorValue: number;
  tolerance: number;
}

// ── Floor Grid ──────────────────────────────────────────────────────────��────

function FloorGrid({ size = 40, divisions = 40 }: { size?: number; divisions?: number }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const half = size / 2;
    const step = size / divisions;

    for (let i = 0; i <= divisions; i++) {
      const pos = -half + i * step;
      // X lines
      positions.push(-half, 0, pos, half, 0, pos);
      // Z lines
      positions.push(pos, 0, -half, pos, 0, half);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [size, divisions]);

  return (
    <lineSegments geometry={geometry} position={[0, -0.01, 0]}>
      <lineBasicMaterial color={0x222233} opacity={0.3} transparent />
    </lineSegments>
  );
}

// ── Status Pillar ────────────────────────────────────────────────────────────

const PILLAR_GEO = new THREE.CylinderGeometry(0.08, 0.12, 1.5, 8);

function StatusPillar({
  position,
  passed,
  height = 1.5,
}: {
  position: [number, number, number];
  passed: boolean;
  height?: number;
}) {
  const color = passed ? 0x44ff88 : 0xff4444;
  const emissive = passed ? 0x22aa44 : 0xaa2222;

  return (
    <group position={position}>
      {/* Pillar body */}
      <mesh geometry={PILLAR_GEO} position={[0, height / 2, 0]}>
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.3}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>
      {/* Status light on top */}
      <mesh position={[0, height + 0.15, 0]}>
        <sphereGeometry args={[0.1, 12, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
        />
      </mesh>
    </group>
  );
}

// ── Zone Label ───────────────────────────────────────────────────────��───────
// Note: Full text rendering requires troika-three-text or similar.
// For now, zone labels are geometric markers.

function ZoneMarker({
  position,
  color = 0x4488ff,
}: {
  position: [number, number, number];
  color?: number;
}) {
  return (
    <group position={position}>
      {/* Floating diamond marker */}
      <mesh position={[0, 3.5, 0]}>
        <octahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
          transparent
          opacity={0.8}
        />
      </mesh>
      {/* Vertical guide line */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, 0, 0, 3.3, 0]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} opacity={0.3} transparent />
      </lineSegments>
    </group>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function VnVSpace({
  convergenceSeries,
  observedOrder,
  theoreticalOrder,
  richardsonEstimate,
  gci,
  meshLevels,
  meshLayout = 'linear',
  uncertaintyNodePositions,
  uncertaintyValues,
  benchmarkStatus,
  colormap = 'turbo',
  scalarRange,
  zoneSpacing = 12,
  showFloor = true,
  showLighting = true,
  visible = true,
}: VnVSpaceProps) {
  const hasConvergence = convergenceSeries && convergenceSeries.length > 0;
  const hasMeshLevels = meshLevels && meshLevels.length > 0;
  const hasUncertainty = uncertaintyNodePositions && uncertaintyValues
    && uncertaintyNodePositions.length > 0;

  if (!visible) return null;

  return (
    <group>
      {/* ── Environment ─────────────────���───────────────────── */}
      {showFloor && <FloorGrid size={zoneSpacing * 4} divisions={40} />}
      {showLighting && (
        <>
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 15, 8]} intensity={0.6} />
          <directionalLight position={[-5, 10, -5]} intensity={0.3} />
        </>
      )}

      {/* ── Zone 1: Convergence Gallery (left) ──────────────── */}
      {hasConvergence && (
        <group position={[-zoneSpacing, 0, 0]}>
          <ZoneMarker position={[0, 0, -3]} color={0x4488ff} />
          <ConvergencePlot3D
            series={convergenceSeries}
            observedOrder={observedOrder}
            theoreticalOrder={theoreticalOrder}
            richardsonEstimate={richardsonEstimate}
            gci={gci}
            dimensions={[5, 4, 3]}
            position={[0, 0.5, 0]}
            showLabels
            showGrid
            showUncertainty
          />
        </group>
      )}

      {/* ── Zone 2: Mesh Refinement Hall (center) ───────────── */}
      {hasMeshLevels && (
        <group position={[0, 0, 0]}>
          <ZoneMarker position={[0, 0, -3]} color={0x44ff88} />
          <MeshRefinementCompare
            levels={meshLevels}
            layout={meshLayout}
            spacing={3.0}
            colormap={colormap}
            range={scalarRange}
            wireframe
            displacementScale={1.0}
            showEvolutionRibbon
            showErrors
            position={[0, 0.5, 0]}
          />
        </group>
      )}

      {/* ── Zone 3: Uncertainty Theater (right) ─────────────── */}
      {hasUncertainty && (
        <group position={[zoneSpacing, 0, 0]}>
          <ZoneMarker position={[0, 0, -3]} color={0xff4488} />
          <UncertaintyCloud
            nodePositions={uncertaintyNodePositions}
            uncertainties={uncertaintyValues}
            maxSize={0.35}
            opacity={0.45}
            animated
            position={[0, 0.5, 0]}
          />
        </group>
      )}

      {/* ── Benchmark Status Pillars (front row) ────────────── */}
      {benchmarkStatus && benchmarkStatus.length > 0 && (
        <group position={[0, 0, 5]}>
          {benchmarkStatus.map((b, i) => {
            const total = benchmarkStatus.length;
            const offset = ((total - 1) * 1.2) / 2;
            return (
              <StatusPillar
                key={`status-${i}-${b.name}`}
                position={[i * 1.2 - offset, 0, 0]}
                passed={b.passed}
              />
            );
          })}
        </group>
      )}
    </group>
  );
}
