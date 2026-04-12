/**
 * UncertaintyCloud — Volumetric uncertainty visualization for simulation results.
 *
 * Renders GCI (Grid Convergence Index) or statistical uncertainty distributions
 * as semi-transparent volumetric clouds around simulation meshes. Professionals
 * can walk through the cloud to see where uncertainty is highest (densest fog)
 * and where the solution is most reliable (clear regions).
 *
 * Pipeline:
 *   1. Takes per-element or per-node uncertainty values (e.g., GCI, std dev)
 *   2. Generates instanced billboard quads at mesh node positions
 *   3. Sizes and opacities each billboard by local uncertainty magnitude
 *   4. Applies a soft Gaussian falloff shader for volumetric appearance
 *   5. Color-codes by uncertainty severity (green=low, yellow=medium, red=high)
 *
 * @see ConvergenceAnalysis.gridConvergenceIndex — produces per-element GCI
 * @see SimResultsMesh — the solid mesh this cloud wraps around
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UncertaintyCloudProps {
  /** Node positions: flat [x0,y0,z0, x1,y1,z1, ...] */
  nodePositions: Float64Array | Float32Array;
  /** Per-node uncertainty values (0..1 normalized, or absolute) */
  uncertainties: Float32Array | Float64Array;
  /** Whether uncertainty values are already normalized to 0..1 */
  normalized?: boolean;
  /** Maximum billboard size in world units (default: 0.3) */
  maxSize?: number;
  /** Minimum billboard size for nonzero uncertainty (default: 0.05) */
  minSize?: number;
  /** Global cloud opacity multiplier (default: 0.4) */
  opacity?: number;
  /** Uncertainty threshold below which particles are hidden (default: 0.01) */
  threshold?: number;
  /** Color for low uncertainty (default: '#00ff88') */
  colorLow?: string;
  /** Color for high uncertainty (default: '#ff2244') */
  colorHigh?: string;
  /** Color for medium uncertainty (default: '#ffaa00') */
  colorMid?: string;
  /** Whether to animate the cloud (gentle pulsing) */
  animated?: boolean;
  /** Group position offset */
  position?: [number, number, number];
  /** Whether cloud is visible */
  visible?: boolean;
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const CLOUD_VERT = /* glsl */ `
attribute vec3 aOffset;
attribute float aSize;
attribute float aUncertainty;

uniform float uTime;
uniform bool uAnimated;

varying float vUncertainty;
varying vec2 vUv;

void main() {
  vUncertainty = aUncertainty;
  vUv = uv;

  // Billboard: always face camera
  vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

  float size = aSize;
  if (uAnimated) {
    // Gentle pulsing based on position hash + time
    float hash = fract(sin(dot(aOffset.xy, vec2(12.9898, 78.233))) * 43758.5453);
    size *= 0.9 + 0.2 * sin(uTime * 0.8 + hash * 6.283);
  }

  vec3 worldPos = aOffset
    + cameraRight * position.x * size
    + cameraUp * position.y * size;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform float uOpacity;
uniform vec3 uColorLow;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

varying float vUncertainty;
varying vec2 vUv;

void main() {
  // Gaussian falloff from center
  vec2 center = vUv - 0.5;
  float dist = dot(center, center) * 4.0;
  float alpha = exp(-dist * 3.0) * uOpacity;

  // Discard transparent fragments
  if (alpha < 0.005) discard;

  // Three-stop color ramp: low → mid → high
  vec3 color;
  if (vUncertainty < 0.5) {
    color = mix(uColorLow, uColorMid, vUncertainty * 2.0);
  } else {
    color = mix(uColorMid, uColorHigh, (vUncertainty - 0.5) * 2.0);
  }

  // Modulate alpha by uncertainty magnitude
  alpha *= 0.3 + 0.7 * vUncertainty;

  gl_FragColor = vec4(color, alpha);
}
`;

// ── Billboard Quad ───────────────────────────────────────────────────────────

const QUAD_POSITIONS = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0,
  -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
]);

const QUAD_UVS = new Float32Array([
  0, 0, 1, 0, 1, 1,
  0, 0, 1, 1, 0, 1,
]);

// ── Component ────────────────────────────────────────────────────────────────

export function UncertaintyCloud({
  nodePositions,
  uncertainties,
  normalized = false,
  maxSize = 0.3,
  minSize = 0.05,
  opacity = 0.4,
  threshold = 0.01,
  colorLow = '#00ff88',
  colorMid = '#ffaa00',
  colorHigh = '#ff2244',
  animated = true,
  position = [0, 0, 0],
  visible = true,
}: UncertaintyCloudProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Normalize uncertainties if needed
  const normalizedUncertainties = useMemo(() => {
    if (normalized) return new Float32Array(uncertainties);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < uncertainties.length; i++) {
      if (uncertainties[i] < min) min = Number(uncertainties[i]);
      if (uncertainties[i] > max) max = Number(uncertainties[i]);
    }
    const range = max - min;
    if (range < 1e-30) return new Float32Array(uncertainties.length).fill(0);
    const result = new Float32Array(uncertainties.length);
    for (let i = 0; i < uncertainties.length; i++) {
      result[i] = (Number(uncertainties[i]) - min) / range;
    }
    return result;
  }, [uncertainties, normalized]);

  const geometry = useMemo(() => {
    const nodeCount = nodePositions.length / 3;

    // Filter nodes above threshold
    const validIndices: number[] = [];
    for (let i = 0; i < nodeCount; i++) {
      if (normalizedUncertainties[i] > threshold) {
        validIndices.push(i);
      }
    }

    const count = validIndices.length;
    if (count === 0) return new THREE.BufferGeometry();

    // Instanced attributes: offset, size, uncertainty per billboard
    const offsets = new Float32Array(count * 6 * 3); // 6 verts per quad
    const sizes = new Float32Array(count * 6);
    const uncerts = new Float32Array(count * 6);
    const positions = new Float32Array(count * 6 * 3);
    const uvs = new Float32Array(count * 6 * 2);

    for (let idx = 0; idx < count; idx++) {
      const ni = validIndices[idx];
      const u = normalizedUncertainties[ni];
      const size = minSize + u * (maxSize - minSize);

      const ox = Number(nodePositions[ni * 3]);
      const oy = Number(nodePositions[ni * 3 + 1]);
      const oz = Number(nodePositions[ni * 3 + 2]);

      for (let v = 0; v < 6; v++) {
        const base = (idx * 6 + v) * 3;
        positions[base] = QUAD_POSITIONS[v * 3];
        positions[base + 1] = QUAD_POSITIONS[v * 3 + 1];
        positions[base + 2] = QUAD_POSITIONS[v * 3 + 2];

        offsets[base] = ox;
        offsets[base + 1] = oy;
        offsets[base + 2] = oz;

        sizes[idx * 6 + v] = size;
        uncerts[idx * 6 + v] = u;

        const uvBase = (idx * 6 + v) * 2;
        uvs[uvBase] = QUAD_UVS[v * 2];
        uvs[uvBase + 1] = QUAD_UVS[v * 2 + 1];
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aUncertainty', new THREE.BufferAttribute(uncerts, 1));

    return geo;
  }, [nodePositions, normalizedUncertainties, maxSize, minSize, threshold]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uAnimated: { value: animated },
      uColorLow: { value: new THREE.Color(colorLow) },
      uColorMid: { value: new THREE.Color(colorMid) },
      uColorHigh: { value: new THREE.Color(colorHigh) },
    }),
    []
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
    uniforms.uOpacity.value = opacity;
    uniforms.uAnimated.value = animated;
    uniforms.uColorLow.value.set(colorLow);
    uniforms.uColorMid.value.set(colorMid);
    uniforms.uColorHigh.value.set(colorHigh);
  });

  if (!visible || nodePositions.length === 0) return null;

  return (
    <mesh ref={meshRef} geometry={geometry} position={position} frustumCulled={false}>
      <shaderMaterial
        vertexShader={CLOUD_VERT}
        fragmentShader={CLOUD_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
