/**
 * SpatialMeasurement — Click two points on a simulation mesh to measure
 * distance, angle, and probe scalar values at those locations.
 *
 * This is what makes HoloScript scientifically verifiable: measurements
 * are taken IN the 3D space where the data lives, not on a 2D screenshot.
 *
 * Renders dimension lines, value labels, and delta readouts in 3D.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MeasurementPoint {
  /** World position [x, y, z] */
  position: [number, number, number];
  /** Scalar value at this point (from simulation field) */
  value?: number;
  /** Field name */
  fieldName?: string;
}

export interface Measurement {
  id: string;
  pointA: MeasurementPoint;
  pointB: MeasurementPoint;
  distance: number;
  deltaValue?: number;
  unit?: string;
}

export interface SpatialMeasurementProps {
  /** Whether measurement mode is active */
  active?: boolean;
  /** Current scalar field for value probing */
  scalarField?: Float32Array;
  /** Grid dimensions for field lookup [nx, ny, nz] */
  gridDims?: [number, number, number];
  /** Domain size for coordinate mapping [lx, ly, lz] */
  domainSize?: [number, number, number];
  /** Unit label (default: 'm') */
  unit?: string;
  /** Scalar field unit (default: 'Pa') */
  fieldUnit?: string;
  /** Field name for display */
  fieldName?: string;
  /** Callback when measurement completes */
  onMeasure?: (measurement: Measurement) => void;
  /** Existing measurements to display */
  measurements?: Measurement[];
  /** Color for dimension lines */
  color?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SpatialMeasurement({
  active = false,
  scalarField,
  gridDims,
  domainSize,
  unit = 'm',
  fieldUnit = 'Pa',
  fieldName = 'value',
  onMeasure,
  measurements = [],
  color = '#00ff88',
}: SpatialMeasurementProps) {
  const [pointA, setPointA] = useState<MeasurementPoint | null>(null);
  const [hoverPos, setHoverPos] = useState<[number, number, number] | null>(null);
  const measureIdRef = useRef(0);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!active) return;
    e.stopPropagation();

    const pos: [number, number, number] = [e.point.x, e.point.y, e.point.z];
    const value = probeField(pos, scalarField, gridDims, domainSize);

    const point: MeasurementPoint = { position: pos, value, fieldName };

    if (!pointA) {
      setPointA(point);
    } else {
      const dist = Math.sqrt(
        (pos[0] - pointA.position[0]) ** 2 +
        (pos[1] - pointA.position[1]) ** 2 +
        (pos[2] - pointA.position[2]) ** 2,
      );

      const measurement: Measurement = {
        id: `m-${measureIdRef.current++}`,
        pointA: pointA,
        pointB: point,
        distance: dist,
        deltaValue: value !== undefined && pointA.value !== undefined ? value - pointA.value : undefined,
        unit,
      };

      onMeasure?.(measurement);
      setPointA(null);
    }
  }, [active, pointA, scalarField, gridDims, domainSize, fieldName, unit, onMeasure]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!active) return;
    setHoverPos([e.point.x, e.point.y, e.point.z]);
  }, [active]);

  if (!active && measurements.length === 0) return null;

  return (
    <group>
      {/* Click target — invisible plane covering the scene */}
      {active && (
        <mesh
          visible={false}
          onClick={handleClick}
          onPointerMove={handlePointerMove}
        >
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      {/* First point marker (waiting for second click) */}
      {pointA && (
        <group position={pointA.position}>
          <mesh>
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>
          {pointA.value !== undefined && (
            <Text
              position={[0, 0.06, 0]}
              fontSize={0.03}
              color={color}
              anchorX="center"
              anchorY="bottom"
            >
              {formatValue(pointA.value, fieldUnit)}
            </Text>
          )}
        </group>
      )}

      {/* Preview line to cursor */}
      {pointA && hoverPos && active && (
        <DimensionLine
          from={pointA.position}
          to={hoverPos}
          color={color}
          opacity={0.4}
        />
      )}

      {/* Completed measurements */}
      {measurements.map((m) => (
        <CompletedMeasurement key={m.id} measurement={m} color={color} fieldUnit={fieldUnit} />
      ))}
    </group>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DimensionLine({ from, to, color, opacity = 1 }: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  opacity?: number;
}) {
  const points = useMemo(() => [
    new THREE.Vector3(...from),
    new THREE.Vector3(...to),
  ], [from, to]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [points]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </line>
  );
}

function CompletedMeasurement({ measurement: m, color, fieldUnit }: {
  measurement: Measurement;
  color: string;
  fieldUnit: string;
}) {
  const midpoint: [number, number, number] = [
    (m.pointA.position[0] + m.pointB.position[0]) / 2,
    (m.pointA.position[1] + m.pointB.position[1]) / 2 + 0.05,
    (m.pointA.position[2] + m.pointB.position[2]) / 2,
  ];

  const distLabel = m.distance < 0.01
    ? `${(m.distance * 1000).toFixed(2)} mm`
    : m.distance < 1
      ? `${(m.distance * 100).toFixed(1)} cm`
      : `${m.distance.toFixed(3)} ${m.unit ?? 'm'}`;

  return (
    <group>
      {/* Endpoint markers */}
      <mesh position={m.pointA.position}>
        <sphereGeometry args={[0.015, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={m.pointB.position}>
        <sphereGeometry args={[0.015, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Dimension line */}
      <DimensionLine from={m.pointA.position} to={m.pointB.position} color={color} />

      {/* Distance label at midpoint */}
      <Text position={midpoint} fontSize={0.025} color={color} anchorX="center" anchorY="bottom">
        {distLabel}
      </Text>

      {/* Value labels at endpoints */}
      {m.pointA.value !== undefined && (
        <Text
          position={[m.pointA.position[0], m.pointA.position[1] + 0.04, m.pointA.position[2]]}
          fontSize={0.02}
          color="#ffffff"
          anchorX="center"
        >
          {formatValue(m.pointA.value, fieldUnit)}
        </Text>
      )}
      {m.pointB.value !== undefined && (
        <Text
          position={[m.pointB.position[0], m.pointB.position[1] + 0.04, m.pointB.position[2]]}
          fontSize={0.02}
          color="#ffffff"
          anchorX="center"
        >
          {formatValue(m.pointB.value, fieldUnit)}
        </Text>
      )}

      {/* Delta value */}
      {m.deltaValue !== undefined && (
        <Text
          position={[midpoint[0], midpoint[1] + 0.035, midpoint[2]]}
          fontSize={0.018}
          color={m.deltaValue >= 0 ? '#ff6666' : '#66aaff'}
          anchorX="center"
        >
          {`Δ = ${m.deltaValue >= 0 ? '+' : ''}${formatValue(m.deltaValue, fieldUnit)}`}
        </Text>
      )}
    </group>
  );
}

// ── Annotation Component ─────────────────────────────────────────────────────

export interface SpatialAnnotation {
  id: string;
  position: [number, number, number];
  text: string;
  color?: string;
  value?: number;
  fieldUnit?: string;
}

export interface SpatialAnnotationsProps {
  annotations: SpatialAnnotation[];
  onRemove?: (id: string) => void;
}

export function SpatialAnnotations({ annotations, onRemove }: SpatialAnnotationsProps) {
  return (
    <group>
      {annotations.map((a) => (
        <group key={a.id} position={a.position}>
          {/* Pin marker */}
          <mesh>
            <sphereGeometry args={[0.012, 12, 12]} />
            <meshBasicMaterial color={a.color ?? '#ffaa00'} />
          </mesh>
          {/* Pin line down to surface */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([0, 0, 0, 0, -0.05, 0])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={a.color ?? '#ffaa00'} />
          </line>
          {/* Text label */}
          <Text
            position={[0, 0.03, 0]}
            fontSize={0.02}
            color={a.color ?? '#ffaa00'}
            anchorX="center"
            anchorY="bottom"
            maxWidth={0.3}
          >
            {a.text}
          </Text>
          {/* Value readout */}
          {a.value !== undefined && (
            <Text
              position={[0, 0.015, 0]}
              fontSize={0.015}
              color="#ffffff"
              anchorX="center"
            >
              {formatValue(a.value, a.fieldUnit ?? '')}
            </Text>
          )}
        </group>
      ))}
    </group>
  );
}

// ── Coordinate Overlay ───────────────────────────────────────────────────────

export interface CoordinateOverlayProps {
  /** Current cursor world position */
  cursorPosition?: [number, number, number] | null;
  /** Coordinate system label */
  coordinateSystem?: string;
  /** Transform from scene coords to display coords */
  transform?: (pos: [number, number, number]) => { label: string; coords: string };
}

export function CoordinateOverlay({
  cursorPosition,
  coordinateSystem = 'Scene',
  transform,
}: CoordinateOverlayProps) {
  if (!cursorPosition) return null;

  const display = transform
    ? transform(cursorPosition)
    : {
        label: coordinateSystem,
        coords: `(${cursorPosition[0].toFixed(3)}, ${cursorPosition[1].toFixed(3)}, ${cursorPosition[2].toFixed(3)})`,
      };

  return (
    <Text
      position={[cursorPosition[0], cursorPosition[1] + 0.08, cursorPosition[2]]}
      fontSize={0.015}
      color="#88aacc"
      anchorX="center"
      anchorY="bottom"
    >
      {`${display.label}: ${display.coords}`}
    </Text>
  );
}

// ── Coordinate Transforms ────────────────────────────────────────────────────

/** Engineering coordinates (meters with mm/cm display) */
export function engineeringTransform(pos: [number, number, number]): { label: string; coords: string } {
  return {
    label: 'World',
    coords: `(${(pos[0] * 1000).toFixed(1)}mm, ${(pos[1] * 1000).toFixed(1)}mm, ${(pos[2] * 1000).toFixed(1)}mm)`,
  };
}

/** Astronomical WCS transform (RA/Dec/Freq from FITS header) */
export function astronomicalTransform(
  crpix: number[], crval: number[], cdelt: number[],
): (pos: [number, number, number]) => { label: string; coords: string } {
  return (pos) => {
    const ra = crval[0] + (pos[0] - crpix[0]) * cdelt[0];
    const dec = crval[1] + (pos[1] - crpix[1]) * cdelt[1];
    const freq = crval[2] ? crval[2] + (pos[2] - crpix[2]) * cdelt[2] : undefined;

    let coords = `RA: ${(ra / 15).toFixed(4)}h, Dec: ${dec.toFixed(4)}°`;
    if (freq) coords += `, ${(freq / 1e9).toFixed(6)} GHz`;

    return { label: 'WCS', coords };
  };
}

/** Geophysical transform (depth + distance) */
export function geophysicalTransform(
  pos: [number, number, number],
): { label: string; coords: string } {
  return {
    label: 'Geo',
    coords: `Offset: ${pos[0].toFixed(1)}m, Depth: ${pos[2].toFixed(1)}m`,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function probeField(
  pos: [number, number, number],
  field?: Float32Array,
  dims?: [number, number, number],
  domain?: [number, number, number],
): number | undefined {
  if (!field || !dims || !domain) return undefined;

  const [nx, ny, nz] = dims;
  const [lx, ly, lz] = domain;

  // Map world position to grid indices
  const i = Math.round((pos[0] / lx) * (nx - 1));
  const j = Math.round((pos[1] / ly) * (ny - 1));
  const k = Math.round((pos[2] / lz) * (nz - 1));

  if (i < 0 || i >= nx || j < 0 || j >= ny || k < 0 || k >= nz) return undefined;

  return field[(k * ny + j) * nx + i];
}

function formatValue(v: number, unit: string): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)} G${unit}`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)} M${unit}`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)} k${unit}`;
  if (Math.abs(v) < 0.01 && v !== 0) return `${v.toExponential(2)} ${unit}`;
  return `${v.toFixed(2)} ${unit}`;
}
