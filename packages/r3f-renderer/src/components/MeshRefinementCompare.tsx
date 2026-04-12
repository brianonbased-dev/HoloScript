/**
 * MeshRefinementCompare — Side-by-side 3D mesh refinement level comparison.
 *
 * Renders multiple mesh refinement levels (coarse → fine) as a spatial array
 * that professionals can walk between. Each level shows the mesh wireframe,
 * colormapped solution field, and element count label. A connecting ribbon
 * shows how the solution evolves with refinement.
 *
 * Layout modes:
 * - 'linear': Meshes arranged in a row (left=coarse, right=fine)
 * - 'radial': Meshes arranged in a semicircle (walk around the arc)
 * - 'stacked': Meshes stacked vertically with transparency (exploded view)
 *
 * @see AutoMesher — generates the tetrahedral meshes at different resolutions
 * @see SimResultsMesh — renders each individual mesh level
 * @see ConvergenceAnalysis — provides the error data shown per level
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { ColormapName } from './ScalarFieldOverlay';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MeshLevel {
  /** Level label (e.g., '4x4x4', '8x8x8') */
  label: string;
  /** Characteristic mesh size h */
  meshSize: number;
  /** Vertex positions: flat [x0,y0,z0, ...] */
  vertices: Float64Array | Float32Array;
  /** Tetrahedral connectivity: flat [n0,n1,n2,n3, ...] */
  tetrahedra: Uint32Array;
  /** Nodes per element (4 for TET4, 10 for TET10) */
  nodesPerElement?: number;
  /** Per-element scalar field (e.g., Von Mises stress) */
  elementScalars?: Float64Array | Float32Array;
  /** Per-node displacement field */
  displacements?: Float64Array | Float32Array;
  /** Error metric value at this level */
  errorL2?: number;
  /** Element count */
  elementCount: number;
  /** Node count */
  nodeCount: number;
}

export type CompareLayout = 'linear' | 'radial' | 'stacked';

export interface MeshRefinementCompareProps {
  /** Mesh levels ordered coarse → fine */
  levels: MeshLevel[];
  /** Layout mode (default: 'linear') */
  layout?: CompareLayout;
  /** Spacing between mesh visualizations (default: 3.0) */
  spacing?: number;
  /** Colormap for all levels (default: 'turbo') */
  colormap?: ColormapName;
  /** Scalar range [min, max] — shared across all levels for fair comparison */
  range?: [number, number];
  /** Whether to show wireframe overlay on each level */
  wireframe?: boolean;
  /** Displacement magnification (default: 1.0) */
  displacementScale?: number;
  /** Whether to show connecting evolution ribbon */
  showEvolutionRibbon?: boolean;
  /** Whether to show error annotations per level */
  showErrors?: boolean;
  /** Group position offset */
  position?: [number, number, number];
  /** Whether component is visible */
  visible?: boolean;
}

// ── Surface Extraction (reused from SimResultsMesh pattern) ──────────────────

function extractBoundaryFaces(
  vertices: Float64Array | Float32Array,
  tetrahedra: Uint32Array,
  nodesPerElement: number,
  elementScalars?: Float64Array | Float32Array,
  displacements?: Float64Array | Float32Array,
  displacementScale = 1.0,
): { positions: Float32Array; scalars: Float32Array; normals: Float32Array; triCount: number } {
  const elementCount = tetrahedra.length / nodesPerElement;
  const FACE_DEFS = [
    [0, 2, 1],
    [0, 1, 3],
    [0, 3, 2],
    [1, 2, 3],
  ];

  const faceMap = new Map<string, { elem: number; nodes: [number, number, number]; count: number }>();

  for (let e = 0; e < elementCount; e++) {
    const base = e * nodesPerElement;
    for (const def of FACE_DEFS) {
      const n0 = tetrahedra[base + def[0]];
      const n1 = tetrahedra[base + def[1]];
      const n2 = tetrahedra[base + def[2]];
      const sorted = [n0, n1, n2].sort((a, b) => a - b);
      const key = `${sorted[0]}_${sorted[1]}_${sorted[2]}`;
      const existing = faceMap.get(key);
      if (existing) existing.count++;
      else faceMap.set(key, { elem: e, nodes: [n0, n1, n2], count: 1 });
    }
  }

  const boundaryFaces: { elem: number; nodes: [number, number, number] }[] = [];
  for (const face of faceMap.values()) {
    if (face.count === 1) boundaryFaces.push({ elem: face.elem, nodes: face.nodes });
  }

  const triCount = boundaryFaces.length;
  const positions = new Float32Array(triCount * 9);
  const scalars = new Float32Array(triCount * 3);
  const normals = new Float32Array(triCount * 9);

  for (let i = 0; i < triCount; i++) {
    const { elem, nodes } = boundaryFaces[i];
    for (let v = 0; v < 3; v++) {
      const node = nodes[v];
      let px = Number(vertices[node * 3]);
      let py = Number(vertices[node * 3 + 1]);
      let pz = Number(vertices[node * 3 + 2]);
      if (displacements) {
        px += Number(displacements[node * 3]) * displacementScale;
        py += Number(displacements[node * 3 + 1]) * displacementScale;
        pz += Number(displacements[node * 3 + 2]) * displacementScale;
      }
      positions[i * 9 + v * 3] = px;
      positions[i * 9 + v * 3 + 1] = py;
      positions[i * 9 + v * 3 + 2] = pz;
    }

    const scalarVal = elementScalars ? Number(elementScalars[elem]) : 0;
    scalars[i * 3] = scalars[i * 3 + 1] = scalars[i * 3 + 2] = scalarVal;

    // Face normal
    const ax = positions[i * 9 + 3] - positions[i * 9];
    const ay = positions[i * 9 + 4] - positions[i * 9 + 1];
    const az = positions[i * 9 + 5] - positions[i * 9 + 2];
    const bx = positions[i * 9 + 6] - positions[i * 9];
    const by = positions[i * 9 + 7] - positions[i * 9 + 1];
    const bz = positions[i * 9 + 8] - positions[i * 9 + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-12) { nx /= len; ny /= len; nz /= len; }
    for (let v = 0; v < 3; v++) {
      normals[i * 9 + v * 3] = nx;
      normals[i * 9 + v * 3 + 1] = ny;
      normals[i * 9 + v * 3 + 2] = nz;
    }
  }

  return { positions, scalars, normals, triCount };
}

// ── Colormap Shader (matches ScalarFieldOverlay) ────────────────────────────

const COLORMAP_GLSL: Record<ColormapName, string> = {
  jet: `vec3 colormap(float t){float r=clamp(1.5-abs(t-0.75)*4.0,0.0,1.0);float g=clamp(1.5-abs(t-0.5)*4.0,0.0,1.0);float b=clamp(1.5-abs(t-0.25)*4.0,0.0,1.0);return vec3(r,g,b);}`,
  viridis: `vec3 colormap(float t){vec3 c0=vec3(0.267,0.004,0.329);vec3 c4=vec3(0.127,0.566,0.551);vec3 c8=vec3(0.993,0.906,0.144);if(t<0.5)return mix(c0,c4,t*2.0);return mix(c4,c8,(t-0.5)*2.0);}`,
  turbo: `vec3 colormap(float t){float r=0.136+t*(4.615+t*(-42.66+t*(132.13+t*(-152.55+t*56.31))));float g=0.091+t*(2.264+t*(-14.02+t*(32.21+t*(-29.27+t*10.16))));float b=0.107+t*(12.75+t*(-60.58+t*(132.75+t*(-134.01+t*50.26))));return clamp(vec3(r,g,b),0.0,1.0);}`,
  inferno: `vec3 colormap(float t){vec3 c0=vec3(0.001,0.0,0.014);vec3 c3=vec3(0.735,0.216,0.329);vec3 c6=vec3(0.988,0.999,0.644);if(t<0.5)return mix(c0,c3,t*2.0);return mix(c3,c6,(t-0.5)*2.0);}`,
  coolwarm: `vec3 colormap(float t){vec3 cool=vec3(0.230,0.299,0.754);vec3 neutral=vec3(0.865,0.865,0.865);vec3 warm=vec3(0.706,0.016,0.150);if(t<0.5)return mix(cool,neutral,t*2.0);return mix(neutral,warm,(t-0.5)*2.0);}`,
};

const COMPARE_VERT = /* glsl */ `
attribute float aScalar;
uniform float uRangeMin;
uniform float uRangeMax;
varying float vNormalizedScalar;
varying vec3 vNormal;

void main() {
  float range = uRangeMax - uRangeMin;
  vNormalizedScalar = range > 0.0 ? clamp((aScalar - uRangeMin) / range, 0.0, 1.0) : 0.5;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function makeCompareFrag(colormapName: ColormapName): string {
  return /* glsl */ `
    uniform float uOpacity;
    varying float vNormalizedScalar;
    varying vec3 vNormal;
    ${COLORMAP_GLSL[colormapName]}
    void main() {
      vec3 color = colormap(vNormalizedScalar);
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
      float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.4 + 0.6;
      gl_FragColor = vec4(color * diffuse, uOpacity);
    }
  `;
}

// ── Layout Calculators ───────────────────────────────────────────────────────

function linearPosition(index: number, total: number, spacing: number): [number, number, number] {
  const offset = ((total - 1) * spacing) / 2;
  return [index * spacing - offset, 0, 0];
}

function radialPosition(index: number, total: number, spacing: number): [number, number, number] {
  const radius = (total * spacing) / Math.PI;
  const angle = (index / Math.max(total - 1, 1)) * Math.PI;
  return [
    Math.cos(angle) * radius,
    0,
    -Math.sin(angle) * radius,
  ];
}

function stackedPosition(index: number, _total: number, spacing: number): [number, number, number] {
  return [0, index * spacing * 0.6, 0];
}

// ── Single Level Renderer ────────────────────────────────────────────────────

function MeshLevelVisualization({
  level,
  position,
  colormap,
  range,
  wireframe,
  displacementScale,
  opacity,
  showError,
}: {
  level: MeshLevel;
  position: [number, number, number];
  colormap: ColormapName;
  range: [number, number];
  wireframe: boolean;
  displacementScale: number;
  opacity: number;
  showError: boolean;
}) {
  const { geometry, wireGeometry } = useMemo(() => {
    if (!level.vertices || level.vertices.length === 0) {
      return { geometry: new THREE.BufferGeometry(), wireGeometry: new THREE.BufferGeometry() };
    }

    const surface = extractBoundaryFaces(
      level.vertices,
      level.tetrahedra,
      level.nodesPerElement ?? 4,
      level.elementScalars,
      level.displacements,
      displacementScale,
    );

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(surface.normals, 3));
    geo.setAttribute('aScalar', new THREE.BufferAttribute(surface.scalars, 1));

    // Wireframe geometry
    const wirePositions = new Float32Array(surface.triCount * 18);
    for (let i = 0; i < surface.triCount; i++) {
      const p = surface.positions;
      const base = i * 9;
      wirePositions[i * 18] = p[base]; wirePositions[i * 18 + 1] = p[base + 1]; wirePositions[i * 18 + 2] = p[base + 2];
      wirePositions[i * 18 + 3] = p[base + 3]; wirePositions[i * 18 + 4] = p[base + 4]; wirePositions[i * 18 + 5] = p[base + 5];
      wirePositions[i * 18 + 6] = p[base + 3]; wirePositions[i * 18 + 7] = p[base + 4]; wirePositions[i * 18 + 8] = p[base + 5];
      wirePositions[i * 18 + 9] = p[base + 6]; wirePositions[i * 18 + 10] = p[base + 7]; wirePositions[i * 18 + 11] = p[base + 8];
      wirePositions[i * 18 + 12] = p[base + 6]; wirePositions[i * 18 + 13] = p[base + 7]; wirePositions[i * 18 + 14] = p[base + 8];
      wirePositions[i * 18 + 15] = p[base]; wirePositions[i * 18 + 16] = p[base + 1]; wirePositions[i * 18 + 17] = p[base + 2];
    }
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(wirePositions, 3));

    return { geometry: geo, wireGeometry: wGeo };
  }, [level, displacementScale]);

  const fragmentShader = useMemo(() => makeCompareFrag(colormap), [colormap]);

  const uniforms = useMemo(
    () => ({
      uRangeMin: { value: range[0] },
      uRangeMax: { value: range[1] },
      uOpacity: { value: opacity },
    }),
    [range, opacity]
  );

  return (
    <group position={position}>
      {/* Colormapped mesh */}
      <mesh geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          vertexShader={COMPARE_VERT}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Wireframe overlay */}
      {wireframe && (
        <lineSegments geometry={wireGeometry} frustumCulled={false}>
          <lineBasicMaterial color={0x000000} opacity={0.25} transparent />
        </lineSegments>
      )}

      {/* Ground plane indicator */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshStandardMaterial color={0x333333} transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

// ── Evolution Ribbon ─────────────────────────────────────────────────────────

function EvolutionRibbon({
  positions,
  color = 0x4488ff,
  opacity = 0.3,
}: {
  positions: [number, number, number][];
  color?: number;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    if (positions.length < 2) return new THREE.BufferGeometry();
    const points = positions.map(p => new THREE.Vector3(...p));
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, 32, 0.03, 8, false);
  }, [positions]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        metalness={0.5}
        roughness={0.3}
      />
    </mesh>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MeshRefinementCompare({
  levels,
  layout = 'linear',
  spacing = 3.0,
  colormap = 'turbo',
  range,
  wireframe = true,
  displacementScale = 1.0,
  showEvolutionRibbon = true,
  showErrors = true,
  position = [0, 0, 0],
  visible = true,
}: MeshRefinementCompareProps) {
  // Compute shared scalar range across all levels
  const sharedRange = useMemo<[number, number]>(() => {
    if (range) return range;
    let min = Infinity, max = -Infinity;
    for (const level of levels) {
      if (level.elementScalars) {
        for (let i = 0; i < level.elementScalars.length; i++) {
          const v = Number(level.elementScalars[i]);
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (min === Infinity) return [0, 1];
    if (min === max) return [min - 1, max + 1];
    return [min, max];
  }, [range, levels]);

  const layoutFn = layout === 'radial' ? radialPosition
    : layout === 'stacked' ? stackedPosition
    : linearPosition;

  const levelPositions = useMemo(
    () => levels.map((_, i) => layoutFn(i, levels.length, spacing)),
    [levels.length, spacing, layout]
  );

  const levelOpacity = layout === 'stacked'
    ? 0.5 + 0.5 * (1 / levels.length)
    : 0.9;

  if (!visible || levels.length === 0) return null;

  return (
    <group position={position}>
      {/* Individual mesh levels */}
      {levels.map((level, i) => (
        <MeshLevelVisualization
          key={`level-${i}-${level.label}`}
          level={level}
          position={levelPositions[i]}
          colormap={colormap}
          range={sharedRange}
          wireframe={wireframe}
          displacementScale={displacementScale}
          opacity={layout === 'stacked' ? levelOpacity * ((i + 1) / levels.length) : levelOpacity}
          showError={showErrors}
        />
      ))}

      {/* Evolution ribbon connecting levels */}
      {showEvolutionRibbon && levelPositions.length >= 2 && (
        <EvolutionRibbon
          positions={levelPositions}
          color={0x4488ff}
          opacity={0.4}
        />
      )}
    </group>
  );
}
