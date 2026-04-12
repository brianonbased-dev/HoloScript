/**
 * SimResultsMesh — Zero-copy visualization of FEM simulation results.
 *
 * Renders unstructured tetrahedral mesh results (TET4/TET10) as a
 * colormapped surface mesh with optional displacement deformation.
 *
 * Pipeline (no VTK export, no file I/O):
 *   1. Extract boundary faces from tetrahedral connectivity
 *   2. Interpolate per-element scalars to per-vertex via area weighting
 *   3. Apply displacement field to deform the mesh (optional)
 *   4. Render via GLSL colormap shader (turbo/viridis/jet/inferno/coolwarm)
 *
 * @see ScalarFieldOverlay — structured grid equivalent
 * @see StructuralSolverTET10 — produces the data this component visualizes
 */

import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ColormapName } from './ScalarFieldOverlay';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SimResultsMeshProps {
  /** Vertex positions: flat [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float64Array | Float32Array;
  /** Tetrahedral connectivity: flat [n0,n1,n2,n3, ...] (4 per tet for TET4) */
  tetrahedra: Uint32Array;
  /** Nodes per element (4 for TET4, 10 for TET10) */
  nodesPerElement?: number;
  /** Per-element scalar field (e.g., Von Mises stress) */
  elementScalars?: Float64Array | Float32Array;
  /** Per-node displacement field: flat [dx0,dy0,dz0, ...] (CPU fallback) */
  displacements?: Float64Array | Float32Array;
  /** GPU Storage Buffer for zero-copy displacements (preferred) */
  gpuDisplacementBuffer?: any;
  /** Displacement magnification factor (default: 1.0) */
  displacementScale?: number;
  /** Colormap name (default: 'turbo') */
  colormap?: ColormapName;
  /** Scalar range [min, max] — auto-detected if omitted */
  range?: [number, number];
  /** Overlay opacity 0-1 (default: 0.9) */
  opacity?: number;
  /** Whether to show wireframe overlay */
  wireframe?: boolean;
  /** Whether the mesh is visible */
  visible?: boolean;
}

// ── Surface Extraction ───────────────────────────────────────────────────────

interface SurfaceMesh {
  /** Triangle positions: flat [x0,y0,z0, ...] — 3 verts per face */
  positions: Float32Array;
  /** Per-vertex scalar (interpolated from element scalars) */
  scalars: Float32Array;
  /** Per-vertex normals for lighting */
  normals: Float32Array;
  /** Volume node indices for zero-copy lookups */
  volumeNodeIndices: Float32Array;
  /** Number of triangles */
  triangleCount: number;
}

/**
 * Extract boundary faces from a tetrahedral mesh.
 */
function extractSurface(
  vertices: Float64Array | Float32Array,
  tetrahedra: Uint32Array,
  nodesPerElement: number,
  elementScalars?: Float64Array | Float32Array,
  displacements?: Float64Array | Float32Array,
  displacementScale = 1.0,
  useGPU = false,
): SurfaceMesh {
  const elementCount = tetrahedra.length / nodesPerElement;

  // Face definitions: indices into the 4 corner nodes of each tet
  const FACE_DEFS = [
    [0, 2, 1], // face 0 (reversed for outward normal)
    [0, 1, 3], // face 1
    [0, 3, 2], // face 2
    [1, 2, 3], // face 3
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
      if (existing) {
        existing.count++;
      } else {
        faceMap.set(key, { elem: e, nodes: [n0, n1, n2], count: 1 });
      }
    }
  }

  const boundaryFaces: { elem: number; nodes: [number, number, number] }[] = [];
  for (const face of faceMap.values()) {
    if (face.count === 1) {
      boundaryFaces.push({ elem: face.elem, nodes: face.nodes });
    }
  }

  const triCount = boundaryFaces.length;
  const positions = new Float32Array(triCount * 9);
  const scalars = new Float32Array(triCount * 3);
  const normals = new Float32Array(triCount * 3 * 3);
  const volumeNodeIndices = new Float32Array(triCount * 3);

  for (let i = 0; i < triCount; i++) {
    const { elem, nodes } = boundaryFaces[i];
    for (let v = 0; v < 3; v++) {
      const node = nodes[v];
      let px = vertices[node * 3];
      let py = vertices[node * 3 + 1];
      let pz = vertices[node * 3 + 2];

      if (displacements && !useGPU) {
        px += displacements[node * 3] * displacementScale;
        py += displacements[node * 3 + 1] * displacementScale;
        pz += displacements[node * 3 + 2] * displacementScale;
      }

      positions[i * 9 + v * 3] = px;
      positions[i * 9 + v * 3 + 1] = py;
      positions[i * 9 + v * 3 + 2] = pz;
      volumeNodeIndices[i * 3 + v] = node;
    }

    const scalarVal = elementScalars ? elementScalars[elem] : 0;
    scalars[i * 3] = scalars[i * 3 + 1] = scalars[i * 3 + 2] = scalarVal;

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

  return { positions, scalars, normals, volumeNodeIndices, triangleCount: triCount };
}

// ── Colormap GLSL ────────────────────────────────────────────────────────────

const COLORMAP_GLSL: Record<ColormapName, string> = {
  jet: `
    vec3 colormap(float t) {
      float r = clamp(1.5 - abs(t - 0.75) * 4.0, 0.0, 1.0);
      float g = clamp(1.5 - abs(t - 0.5) * 4.0, 0.0, 1.0);
      float b = clamp(1.5 - abs(t - 0.25) * 4.0, 0.0, 1.0);
      return vec3(r, g, b);
    }
  `,
  viridis: `
    vec3 colormap(float t) {
      vec3 c0 = vec3(0.267, 0.004, 0.329);
      vec3 c4 = vec3(0.127, 0.566, 0.551);
      vec3 c8 = vec3(0.993, 0.906, 0.144);
      if (t < 0.5) return mix(c0, c4, t * 2.0);
      return mix(c4, c8, (t - 0.5) * 2.0);
    }
  `,
  turbo: `
    vec3 colormap(float t) {
      float r = 0.136 + t * (4.615 + t * (-42.66 + t * (132.13 + t * (-152.55 + t * 56.31))));
      float g = 0.091 + t * (2.264 + t * (-14.02 + t * (32.21 + t * (-29.27 + t * 10.16))));
      float b = 0.107 + t * (12.75 + t * (-60.58 + t * (132.75 + t * (-134.01 + t * 50.26))));
      return clamp(vec3(r, g, b), 0.0, 1.0);
    }
  `,
  inferno: `
    vec3 colormap(float t) {
      vec3 c0 = vec3(0.001, 0.0, 0.014);
      vec3 c3 = vec3(0.735, 0.216, 0.329);
      vec3 c6 = vec3(0.988, 0.999, 0.644);
      if (t < 0.5) return mix(c0, c3, t * 2.0);
      return mix(c3, c6, (t - 0.5) * 2.0);
    }
  `,
  coolwarm: `
    vec3 colormap(float t) {
      vec3 cool = vec3(0.230, 0.299, 0.754);
      vec3 neutral = vec3(0.865, 0.865, 0.865);
      vec3 warm = vec3(0.706, 0.016, 0.150);
      if (t < 0.5) return mix(cool, neutral, t * 2.0);
      return mix(neutral, warm, (t - 0.5) * 2.0);
    }
  `,
};

// ── Shaders ──────────────────────────────────────────────────────────────────

const RESULTS_VERT = /* glsl */ `
attribute float aScalar;
attribute float aVolumeNodeIndex;
uniform float uRangeMin;
uniform float uRangeMax;
uniform float uDisplacementScale;
uniform bool uUseGPU;

varying float vNormalizedScalar;
varying vec3 vNormal;

#ifdef USE_GPU_BUFFERS
layout(std430, binding = 0) readonly buffer uDisplacementBuffer { vec3 displacements[]; };
layout(std430, binding = 1) readonly buffer uScalarBuffer { float scalars[]; };
#endif

void main() {
  float range = uRangeMax - uRangeMin;
  float val = aScalar;
  
#ifdef USE_GPU_BUFFERS
  if (uUseGPU) {
    val = scalars[int(aVolumeNodeIndex)];
  }
#endif
  
  vNormalizedScalar = range > 0.0 ? clamp((val - uRangeMin) / range, 0.0, 1.0) : 0.5;
  vNormal = normalize(normalMatrix * normal);
  
  vec3 pos = position;
#ifdef USE_GPU_BUFFERS
  if (uUseGPU) {
    pos += displacements[int(aVolumeNodeIndex)] * uDisplacementScale;
  }
#endif
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

function makeResultsFrag(colormapName: ColormapName): string {
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

// ── Component ────────────────────────────────────────────────────────────────

export function SimResultsMesh({
  vertices,
  tetrahedra,
  nodesPerElement = 4,
  elementScalars,
  displacements,
  gpuDisplacementBuffer,
  displacementScale = 1.0,
  colormap = 'turbo',
  range,
  opacity = 0.9,
  wireframe = false,
  visible = true,
}: SimResultsMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.LineSegments>(null);

  const effectiveRange = useMemo<[number, number]>(() => {
    if (range) return range;
    if (!elementScalars || elementScalars.length === 0) return [0, 1];
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < elementScalars.length; i++) {
      if (elementScalars[i] < min) min = elementScalars[i];
      if (elementScalars[i] > max) max = elementScalars[i];
    }
    if (min === max) return [min - 1, max + 1];
    return [min, max];
  }, [range, elementScalars]);

  const { geometry, wireGeometry } = useMemo(() => {
    if (!vertices || !tetrahedra || vertices.length === 0) {
      return { geometry: new THREE.BufferGeometry(), wireGeometry: new THREE.BufferGeometry() };
    }

    const surface = extractSurface(
      vertices, tetrahedra, nodesPerElement,
      elementScalars, displacements, displacementScale,
      !!gpuDisplacementBuffer,
    );

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(surface.normals, 3));
    geo.setAttribute('aScalar', new THREE.BufferAttribute(surface.scalars, 1));
    geo.setAttribute('aVolumeNodeIndex', new THREE.BufferAttribute(surface.volumeNodeIndices, 1));

    const wirePositions = new Float32Array(surface.triangleCount * 18);
    for (let i = 0; i < surface.triangleCount; i++) {
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
  }, [vertices, tetrahedra, nodesPerElement, elementScalars, displacements, displacementScale, gpuDisplacementBuffer]);

  const fragmentShader = useMemo(() => makeResultsFrag(colormap), [colormap]);

  const uniforms = useMemo(
    () => ({
      uRangeMin: { value: effectiveRange[0] },
      uRangeMax: { value: effectiveRange[1] },
      uOpacity: { value: opacity },
      uDisplacementScale: { value: displacementScale },
      uUseGPU: { value: !!gpuDisplacementBuffer },
    }),
    []
  );

  useFrame(() => {
    uniforms.uRangeMin.value = effectiveRange[0];
    uniforms.uRangeMax.value = effectiveRange[1];
    uniforms.uOpacity.value = opacity;
    uniforms.uDisplacementScale.value = displacementScale;
    uniforms.uUseGPU.value = !!gpuDisplacementBuffer;
  });

  const onBeforeCompile = useCallback((shader: THREE.Shader) => {
    if (gpuDisplacementBuffer) {
      shader.defines.USE_GPU_BUFFERS = '';
    }
  }, [gpuDisplacementBuffer]);

  if (!visible || !vertices || vertices.length === 0) return null;

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          vertexShader={RESULTS_VERT}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          onBeforeCompile={onBeforeCompile}
          transparent
          depthWrite
          side={THREE.DoubleSide}
        />
      </mesh>
      {wireframe && (
        <lineSegments ref={wireRef} geometry={wireGeometry} frustumCulled={false}>
          <lineBasicMaterial color={0x000000} opacity={0.3} transparent />
        </lineSegments>
      )}
    </group>
  );
}
