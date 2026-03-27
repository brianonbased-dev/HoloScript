/**
 * ScalarFieldOverlay — Generic visualization for simulation scalar fields.
 *
 * Renders per-vertex scalar data as a color-mapped semi-transparent overlay
 * on mesh geometry. Supports multiple colormaps (jet, viridis, turbo, inferno,
 * coolwarm) with independent opacity control.
 *
 * @see W.260: Simulation traits follow trait algebra pattern
 * @see P.RENDER.008: Generic Scalar Field Overlay pattern
 * @see G.RENDER.004: Overlay rendering avoids material conflict
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export type ColormapName = 'jet' | 'viridis' | 'turbo' | 'inferno' | 'coolwarm';

export interface ScalarFieldOverlayProps {
  /** Per-vertex scalar values (Float32Array) */
  scalarField?: Float32Array;
  /** Number of vertices */
  vertexCount?: number;
  /** Base mesh geometry to overlay on */
  geometry?: THREE.BufferGeometry;
  /** Colormap name (default: 'turbo') */
  colormap?: ColormapName;
  /** Scalar range [min, max] for colormap mapping */
  range?: [number, number];
  /** Overlay opacity 0-1 (default: 0.7) */
  opacity?: number;
  /** Whether overlay is visible */
  visible?: boolean;
  /** Domain label for UI (e.g., 'Temperature (C)', 'Stress (MPa)') */
  label?: string;
  /** Group position offset */
  position?: [number, number, number];
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

const OVERLAY_VERT = /* glsl */ `
attribute float aScalar;
uniform float uRangeMin;
uniform float uRangeMax;
varying float vNormalizedScalar;
varying vec3 vNormal;

void main() {
  float range = uRangeMax - uRangeMin;
  vNormalizedScalar = range > 0.0 ? clamp((aScalar - uRangeMin) / range, 0.0, 1.0) : 0.5;
  vNormal = normalMatrix * normal;

  vec3 offsetPos = position + normal * 0.01;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(offsetPos, 1.0);
}
`;

function makeOverlayFrag(colormapName: ColormapName): string {
  return /* glsl */ `
    uniform float uOpacity;
    varying float vNormalizedScalar;
    varying vec3 vNormal;

    ${COLORMAP_GLSL[colormapName]}

    void main() {
      vec3 color = colormap(vNormalizedScalar);
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
      float diffuse = max(dot(normalize(vNormal), lightDir), 0.0) * 0.3 + 0.7;
      gl_FragColor = vec4(color * diffuse, uOpacity);
    }
  `;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ScalarFieldOverlay({
  scalarField,
  vertexCount = 0,
  geometry,
  colormap = 'turbo',
  range = [0, 1],
  opacity = 0.7,
  visible = true,
  position = [0, 0, 0],
}: ScalarFieldOverlayProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const overlayGeometry = useMemo(() => {
    if (!geometry) return new THREE.BufferGeometry();
    const geo = geometry.clone();
    const maxVerts = geo.getAttribute('position')?.count ?? 0;
    const scalarAttr = new Float32Array(maxVerts);
    geo.setAttribute('aScalar', new THREE.BufferAttribute(scalarAttr, 1));
    return geo;
  }, [geometry]);

  useEffect(() => {
    if (!scalarField || vertexCount <= 0) return;
    const attr = overlayGeometry.getAttribute('aScalar') as THREE.BufferAttribute;
    if (!attr) return;
    const dst = attr.array as Float32Array;
    const copyLen = Math.min(scalarField.length, dst.length);
    dst.set(scalarField.subarray(0, copyLen));
    attr.needsUpdate = true;
  }, [scalarField, vertexCount, overlayGeometry]);

  const fragmentShader = useMemo(() => makeOverlayFrag(colormap), [colormap]);

  const uniforms = useMemo(
    () => ({
      uRangeMin: { value: range[0] },
      uRangeMax: { value: range[1] },
      uOpacity: { value: opacity },
    }),
    [range, opacity],
  );

  useFrame(() => {
    uniforms.uRangeMin.value = range[0];
    uniforms.uRangeMax.value = range[1];
    uniforms.uOpacity.value = opacity;
  });

  if (!visible || !geometry) return null;

  return (
    <mesh ref={meshRef} geometry={overlayGeometry} position={position} frustumCulled={false}>
      <shaderMaterial
        vertexShader={OVERLAY_VERT}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
