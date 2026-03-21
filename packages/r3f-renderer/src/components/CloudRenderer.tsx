/**
 * CloudRenderer — Volumetric cloud layer using billboard sprites.
 *
 * Renders a cloud dome at configurable altitude with wind-driven scrolling.
 * Reads coverage and wind from the trait system via props.
 *
 * For full raymarching volumetrics, the WGSL shaders in core handle
 * the compute; this component provides the R3F visual representation.
 *
 * @see W.161: Volumetric clouds trait
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CloudRendererProps {
  /** Cloud layer altitude (default: 500) */
  altitude?: number;
  /** Cloud layer radius (default: 2000) */
  radius?: number;
  /** Cloud density/coverage 0-1 (default: 0.5) */
  coverage?: number;
  /** Wind offset for scrolling [x, y, z] (default: [0, 0, 0]) */
  windOffset?: [number, number, number];
  /** Cloud color (default: '#ffffff') */
  color?: string;
  /** Cloud opacity (default: 0.6) */
  opacity?: number;
  /** Number of cloud billboard layers (default: 3) */
  layers?: number;
  /** Sun position for lighting [x, y, z] */
  sunPosition?: [number, number, number];
  /** Sun intensity 0-1 (default: 1.0) */
  sunIntensity?: number;
  /** Group position offset */
  position?: [number, number, number];
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform float uCoverage;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uSunDir;
uniform float uSunIntensity;
uniform float uTime;
uniform vec3 uWindOffset;
varying vec2 vUv;
varying vec3 vWorldPos;

// Simple noise for cloud shapes
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float val = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    val += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return val;
}

void main() {
  vec2 uv = vUv + uWindOffset.xz * 0.001;

  float n = fbm(uv * 4.0 + uTime * 0.02);
  float cloudShape = smoothstep(1.0 - uCoverage, 1.0, n);

  if (cloudShape < 0.01) discard;

  // Simple sun lighting
  float sunDot = max(dot(normalize(uSunDir), vec3(0.0, 1.0, 0.0)), 0.0);
  vec3 lit = uColor * mix(0.6, 1.0, sunDot * uSunIntensity);

  gl_FragColor = vec4(lit, cloudShape * uOpacity);
}
`;

// ── Component ────────────────────────────────────────────────────────────────

export function CloudRenderer({
  altitude = 500,
  radius = 2000,
  coverage = 0.5,
  windOffset = [0, 0, 0],
  color = '#ffffff',
  opacity = 0.6,
  layers = 3,
  sunPosition = [100, 200, 100],
  sunIntensity = 1.0,
  position = [0, 0, 0],
}: CloudRendererProps) {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  const colorObj = useMemo(() => new THREE.Color(color), [color]);
  const sunDir = useMemo(
    () => new THREE.Vector3(...sunPosition).normalize(),
    [sunPosition],
  );
  const windVec = useMemo(
    () => new THREE.Vector3(...windOffset),
    [windOffset],
  );

  const uniforms = useMemo(
    () => ({
      uCoverage: { value: coverage },
      uOpacity: { value: opacity },
      uColor: { value: colorObj },
      uSunDir: { value: sunDir },
      uSunIntensity: { value: sunIntensity },
      uTime: { value: 0 },
      uWindOffset: { value: windVec },
    }),
    [coverage, opacity, colorObj, sunDir, sunIntensity, windVec],
  );

  useFrame((_, delta) => {
    timeRef.current += delta;
    uniforms.uTime.value = timeRef.current;
    uniforms.uCoverage.value = coverage;
    uniforms.uWindOffset.value.set(...windOffset);
    uniforms.uSunIntensity.value = sunIntensity;
  });

  // Generate cloud layers at slightly different altitudes
  const layerOffsets = useMemo(
    () => Array.from({ length: layers }, (_, i) => i * 30),
    [layers],
  );

  return (
    <group ref={groupRef} position={position}>
      {layerOffsets.map((yOff, i) => (
        <mesh
          key={i}
          position={[0, altitude + yOff, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[radius * 2, radius * 2, 1, 1]} />
          <shaderMaterial
            vertexShader={CLOUD_VERT}
            fragmentShader={CLOUD_FRAG}
            uniforms={uniforms}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
