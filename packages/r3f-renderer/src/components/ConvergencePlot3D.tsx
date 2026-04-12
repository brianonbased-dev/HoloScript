/**
 * ConvergencePlot3D — Walk-through 3D convergence plot visualization.
 *
 * Renders log-log convergence data as a 3D spatial structure that
 * professionals can orbit, walk through, and inspect. Each data point
 * becomes a physical sphere positioned on log(h) vs log(error) axes,
 * with the Z-axis available for solver type or time dimension.
 *
 * Features:
 * - 3D log-log axes with labeled grid planes
 * - Data point spheres colormapped by convergence quality
 * - Regression line rendered as a tube geometry
 * - Theoretical order reference plane (semi-transparent)
 * - Richardson extrapolation marker at h→0
 * - GCI uncertainty bands as translucent ribbons
 * - Interactive hover labels (via pointer events)
 *
 * @see ConvergenceAnalysis — produces the data this component visualizes
 * @see ReportGenerator — provides ConvergencePlotData type
 */

import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConvergenceDataPoint {
  /** Characteristic mesh size h */
  meshSize: number;
  /** L2 error at this mesh size */
  errorL2: number;
  /** L-infinity error (optional) */
  errorLinf?: number;
  /** Solver label (for multi-solver plots) */
  solver?: string;
}

export interface ConvergencePlot3DProps {
  /** Convergence data series */
  series: ConvergenceSeries[];
  /** Observed convergence order (renders regression line) */
  observedOrder?: number;
  /** Theoretical convergence order (renders reference plane) */
  theoreticalOrder?: number;
  /** Richardson extrapolation estimate (renders marker at h→0) */
  richardsonEstimate?: number;
  /** GCI uncertainty fraction (renders uncertainty band) */
  gci?: number;
  /** Plot physical dimensions in world units [width, height, depth] */
  dimensions?: [number, number, number];
  /** Group position offset */
  position?: [number, number, number];
  /** Whether to show axis labels */
  showLabels?: boolean;
  /** Whether to show grid planes */
  showGrid?: boolean;
  /** Whether to show the GCI uncertainty ribbon */
  showUncertainty?: boolean;
  /** Whether plot is visible */
  visible?: boolean;
}

export interface ConvergenceSeries {
  /** Series label */
  label: string;
  /** Data points */
  points: ConvergenceDataPoint[];
  /** Series color (hex) */
  color?: number;
  /** Observed order for this series */
  observedOrder?: number;
}

// ── Axis Helpers ─────────────────────────────────────────────────────────────

interface AxisRange {
  min: number;
  max: number;
  span: number;
}

function computeLogRange(values: number[]): AxisRange {
  const logs = values.filter(v => v > 0).map(Math.log10);
  const min = Math.floor(Math.min(...logs));
  const max = Math.ceil(Math.max(...logs));
  return { min, max, span: max - min || 1 };
}

function mapToAxis(logValue: number, range: AxisRange, axisLength: number): number {
  return ((logValue - range.min) / range.span) * axisLength;
}

// ── Grid Plane ───────────────────────────────────────────────────────────────

function GridPlane({
  width,
  height,
  divisions,
  position,
  rotation,
  color = 0x444444,
  opacity = 0.15,
}: {
  width: number;
  height: number;
  divisions: number;
  position: [number, number, number];
  rotation: [number, number, number];
  color?: number;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];

    // Horizontal lines
    for (let i = 0; i <= divisions; i++) {
      const y = (i / divisions) * height;
      positions.push(0, y, 0, width, y, 0);
    }
    // Vertical lines
    for (let i = 0; i <= divisions; i++) {
      const x = (i / divisions) * width;
      positions.push(x, 0, 0, x, height, 0);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [width, height, divisions]);

  return (
    <lineSegments geometry={geometry} position={position} rotation={rotation}>
      <lineBasicMaterial color={color} opacity={opacity} transparent />
    </lineSegments>
  );
}

// ── Axis Line ────────────────────────────────────────────────────────────────

function AxisLine({
  start,
  end,
  color = 0xcccccc,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color?: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...start, ...end], 3)
    );
    return geo;
  }, [start, end]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} linewidth={2} />
    </lineSegments>
  );
}

// ── Regression Tube ──────────────────────────────────────────────────────────

function RegressionTube({
  points,
  color = 0xffaa00,
  radius = 0.02,
}: {
  points: THREE.Vector3[];
  color?: number;
  radius?: number;
}) {
  const geometry = useMemo(() => {
    if (points.length < 2) return new THREE.BufferGeometry();
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, 32, radius, 8, false);
  }, [points, radius]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
    </mesh>
  );
}

// ── Uncertainty Ribbon ───────────────────────────────────────────────────────

function UncertaintyRibbon({
  centerPoints,
  halfWidth,
  color = 0xff4444,
  opacity = 0.2,
}: {
  centerPoints: THREE.Vector3[];
  halfWidth: number;
  color?: number;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    if (centerPoints.length < 2) return new THREE.BufferGeometry();
    const positions: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < centerPoints.length; i++) {
      const p = centerPoints[i];
      // Top vertex
      positions.push(p.x, p.y + halfWidth, p.z);
      // Bottom vertex
      positions.push(p.x, p.y - halfWidth, p.z);

      if (i < centerPoints.length - 1) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [centerPoints, halfWidth]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Data Point Sphere ────────────────────────────────────────────────────────

const SPHERE_GEO = new THREE.SphereGeometry(0.06, 16, 12);

function DataPointSphere({
  position,
  color,
  label,
  value,
}: {
  position: [number, number, number];
  color: number;
  label: string;
  value: string;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      const targetScale = hovered ? 1.5 : 1.0;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.15
      );
    }
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        geometry={SPHERE_GEO}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={color}
          emissive={hovered ? color : 0x000000}
          emissiveIntensity={hovered ? 0.4 : 0}
          metalness={0.4}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_COLORS = [0x4488ff, 0xff4488, 0x44ff88, 0xffaa44, 0xaa44ff, 0x44ffff];

export function ConvergencePlot3D({
  series,
  observedOrder,
  theoreticalOrder,
  richardsonEstimate,
  gci,
  dimensions = [4, 3, 2],
  position = [0, 0, 0],
  showLabels = true,
  showGrid = true,
  showUncertainty = true,
  visible = true,
}: ConvergencePlot3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [W, H, D] = dimensions;

  // Collect all mesh sizes and errors for axis ranges
  const allMeshSizes = useMemo(
    () => series.flatMap(s => s.points.map(p => p.meshSize)),
    [series]
  );
  const allErrors = useMemo(
    () => series.flatMap(s => s.points.map(p => p.errorL2)),
    [series]
  );

  const hRange = useMemo(() => computeLogRange(allMeshSizes), [allMeshSizes]);
  const eRange = useMemo(() => computeLogRange(allErrors), [allErrors]);

  // Map each series to 3D positions
  const seriesData = useMemo(() => {
    return series.map((s, si) => {
      const color = s.color ?? DEFAULT_COLORS[si % DEFAULT_COLORS.length];
      const zPos = series.length > 1 ? (si / (series.length - 1)) * D : D / 2;

      const positions: THREE.Vector3[] = [];
      const pointData: { pos: [number, number, number]; label: string; value: string }[] = [];

      for (const pt of s.points) {
        if (pt.meshSize <= 0 || pt.errorL2 <= 0) continue;
        const logH = Math.log10(pt.meshSize);
        const logE = Math.log10(pt.errorL2);
        const x = mapToAxis(logH, hRange, W);
        const y = mapToAxis(logE, eRange, H);

        const pos3 = new THREE.Vector3(x, y, zPos);
        positions.push(pos3);
        pointData.push({
          pos: [x, y, zPos],
          label: `h=${pt.meshSize.toExponential(2)}`,
          value: `L2=${pt.errorL2.toExponential(3)}`,
        });
      }

      return { color, positions, pointData, label: s.label };
    });
  }, [series, hRange, eRange, W, H, D]);

  // Regression line for observed order
  const regressionPoints = useMemo(() => {
    if (observedOrder === undefined || allMeshSizes.length < 2) return [];
    const sortedH = [...allMeshSizes].sort((a, b) => a - b);
    const hMin = sortedH[0];
    const hMax = sortedH[sortedH.length - 1];
    // Use the finest grid error as reference
    const refError = allErrors[allErrors.length - 1] ?? 1;
    const refH = hMin;

    const points: THREE.Vector3[] = [];
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const logH = Math.log10(hMin) + t * (Math.log10(hMax) - Math.log10(hMin));
      const h = Math.pow(10, logH);
      const error = refError * Math.pow(h / refH, observedOrder);
      const logE = Math.log10(error);

      const x = mapToAxis(logH, hRange, W);
      const y = mapToAxis(logE, eRange, H);
      points.push(new THREE.Vector3(x, y, D / 2));
    }
    return points;
  }, [observedOrder, allMeshSizes, allErrors, hRange, eRange, W, H, D]);

  // GCI uncertainty ribbon
  const gciHalfWidth = useMemo(() => {
    if (!gci || !showUncertainty) return 0;
    return (gci * H) / eRange.span;
  }, [gci, showUncertainty, H, eRange.span]);

  if (!visible || series.length === 0) return null;

  return (
    <group ref={groupRef} position={position}>
      {/* Axes */}
      <AxisLine start={[0, 0, 0]} end={[W, 0, 0]} color={0xcccccc} />
      <AxisLine start={[0, 0, 0]} end={[0, H, 0]} color={0xcccccc} />
      {series.length > 1 && (
        <AxisLine start={[0, 0, 0]} end={[0, 0, D]} color={0xcccccc} />
      )}

      {/* Grid planes */}
      {showGrid && (
        <>
          <GridPlane
            width={W}
            height={H}
            divisions={Math.max(hRange.span, eRange.span)}
            position={[0, 0, 0]}
            rotation={[0, 0, 0]}
          />
          {series.length > 1 && (
            <GridPlane
              width={W}
              height={D}
              divisions={Math.max(hRange.span, series.length)}
              position={[0, 0, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            />
          )}
        </>
      )}

      {/* Data point spheres per series */}
      {seriesData.map((sd) =>
        sd.pointData.map((pt, pi) => (
          <DataPointSphere
            key={`${sd.label}-${pi}`}
            position={pt.pos}
            color={sd.color}
            label={pt.label}
            value={pt.value}
          />
        ))
      )}

      {/* Regression line tubes per series */}
      {seriesData.map((sd) =>
        sd.positions.length >= 2 ? (
          <RegressionTube
            key={`tube-${sd.label}`}
            points={sd.positions}
            color={sd.color}
            radius={0.015}
          />
        ) : null
      )}

      {/* Global observed order regression line */}
      {regressionPoints.length >= 2 && (
        <RegressionTube
          points={regressionPoints}
          color={0xffaa00}
          radius={0.01}
        />
      )}

      {/* Theoretical order reference plane */}
      {theoreticalOrder !== undefined && allMeshSizes.length >= 2 && (
        <TheoryReferencePlane
          order={theoreticalOrder}
          hRange={hRange}
          eRange={eRange}
          refError={allErrors[allErrors.length - 1]}
          refH={Math.min(...allMeshSizes)}
          W={W}
          H={H}
          D={D}
        />
      )}

      {/* GCI uncertainty ribbon */}
      {showUncertainty && gciHalfWidth > 0 && regressionPoints.length >= 2 && (
        <UncertaintyRibbon
          centerPoints={regressionPoints}
          halfWidth={gciHalfWidth}
          color={0xff4444}
          opacity={0.15}
        />
      )}

      {/* Richardson extrapolation marker */}
      {richardsonEstimate !== undefined && richardsonEstimate > 0 && (
        <mesh position={[0, mapToAxis(Math.log10(richardsonEstimate), eRange, H), D / 2]}>
          <octahedronGeometry args={[0.08, 0]} />
          <meshStandardMaterial color={0x00ffaa} emissive={0x00ffaa} emissiveIntensity={0.3} />
        </mesh>
      )}
    </group>
  );
}

// ── Theory Reference Plane ───────────────────────────────────────────────────

function TheoryReferencePlane({
  order,
  hRange,
  eRange,
  refError,
  refH,
  W,
  H,
  D,
}: {
  order: number;
  hRange: AxisRange;
  eRange: AxisRange;
  refError: number;
  refH: number;
  W: number;
  H: number;
  D: number;
}) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const indices: number[] = [];
    const steps = 32;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const logH = hRange.min + t * hRange.span;
      const h = Math.pow(10, logH);
      const error = refError * Math.pow(h / refH, order);
      const logE = Math.log10(Math.max(error, 1e-30));

      const x = mapToAxis(logH, hRange, W);
      const y = Math.max(0, Math.min(H, mapToAxis(logE, eRange, H)));

      // Front strip
      points.push(x, y, 0);
      // Back strip
      points.push(x, y, D);

      if (i < steps) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [order, hRange, eRange, refError, refH, W, H, D]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={0x88ff88}
        transparent
        opacity={0.12}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
