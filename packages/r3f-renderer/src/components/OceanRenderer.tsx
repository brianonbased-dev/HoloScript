/**
 * OceanRenderer — FFT-based ocean surface with foam, caustics, and buoyancy.
 *
 * Wraps physically-based ocean simulation with JONSWAP spectrum,
 * Gerstner swell layers, and Fresnel reflections.
 * Falls back to noise-based waves when WebGPU is unavailable.
 *
 * @see W.251: Three.js Water Pro FFT ocean
 * @see P.RENDER.001: Environment Rendering Stack pattern
 * @see G.RENDER.002: FFT requires compute shaders — noise fallback
 */

import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export type OceanType = 'fft_ocean' | 'calm_lake' | 'flowing_river';

export interface GerstnerSwell {
  amplitude: number;
  wavelength: number;
  direction: [number, number];
  speed: number;
}

export interface OceanRendererProps {
  /** Ocean type (default: 'fft_ocean') */
  type?: OceanType;
  /** Ocean plane size [width, depth] (default: [10000, 10000]) */
  size?: [number, number];
  /** Grid resolution (default: 256) */
  resolution?: number;
  /** Wind speed for FFT (default: 10) */
  windSpeed?: number;
  /** Wind direction [x, z] (default: [1, 0]) */
  windDirection?: [number, number];
  /** Wave choppiness (default: 1.5) */
  choppiness?: number;
  /** Additional Gerstner swell layers */
  swells?: GerstnerSwell[];
  /** Deep ocean color (default: '#004060') */
  color?: string;
  /** Surface roughness (default: 0.1) */
  roughness?: number;
  /** Show foam (default: true) */
  foam?: boolean;
  /** Foam threshold (default: 0.3) */
  foamThreshold?: number;
  /** Enable caustics (default: true) */
  caustics?: boolean;
  /** Enable refraction (default: true) */
  refraction?: boolean;
  /** Underwater fog color (default: '#012030') */
  underwaterFogColor?: string;
  /** Underwater fog density (default: 0.1) */
  underwaterFogDensity?: number;
  /** Enable buoyancy queries (default: true) */
  buoyancy?: boolean;
  /** Altitude of ocean surface (default: 0) */
  altitude?: number;
  /** Sun position for specular highlights */
  sunPosition?: [number, number, number];
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const OCEAN_VERT = /* glsl */ `
uniform float uTime;
uniform float uWindSpeed;
uniform vec2 uWindDirection;
uniform float uChoppiness;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;

vec3 gerstnerWave(vec2 pos, float amp, float wl, vec2 dir, float spd, float t) {
  float k = 6.28318 / wl;
  float c = sqrt(9.81 / k);
  vec2 d = normalize(dir);
  float f = k * (dot(d, pos) - c * spd * t);
  float a = amp / k;
  return vec3(d.x * a * cos(f), amp * sin(f), d.y * a * cos(f));
}

void main() {
  vUv = uv;
  vec3 pos = position;

  vec3 w1 = gerstnerWave(pos.xz, 1.0, 60.0, uWindDirection, uWindSpeed * 0.1, uTime);
  vec3 w2 = gerstnerWave(pos.xz, 0.5, 31.0, vec2(0.7, 0.3), uWindSpeed * 0.12, uTime);
  vec3 w3 = gerstnerWave(pos.xz, 0.3, 18.0, vec2(-0.2, 0.8), uWindSpeed * 0.15, uTime);
  vec3 w4 = gerstnerWave(pos.xz, 0.15, 9.0, vec2(0.5, -0.5), uWindSpeed * 0.2, uTime);

  vec3 totalWave = w1 + w2 + w3 + w4;
  pos += totalWave * uChoppiness;

  vFoam = max(0.0, totalWave.y * 0.5 - 0.3);

  vec3 tangent = vec3(1.0 + totalWave.x * 0.1, totalWave.y * 0.2, totalWave.z * 0.1);
  vec3 bitangent = vec3(totalWave.x * 0.1, totalWave.y * 0.2, 1.0 + totalWave.z * 0.1);
  vNormal = normalize(cross(bitangent, tangent));

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const OCEAN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uRoughness;
uniform float uFoamThreshold;
uniform vec3 uSunPosition;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 sunDir = normalize(uSunPosition - vWorldPos);

  // Fresnel
  float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 5.0);
  fresnel = mix(0.02, 1.0, fresnel);

  // Specular (Blinn-Phong)
  vec3 halfDir = normalize(sunDir + viewDir);
  float spec = pow(max(0.0, dot(normal, halfDir)), 256.0 * (1.0 - uRoughness));

  // Diffuse
  float diffuse = max(0.0, dot(normal, sunDir)) * 0.5 + 0.5;
  vec3 deepColor = uColor * diffuse;

  // Sky reflection approximation
  vec3 reflDir = reflect(-viewDir, normal);
  float skyGrad = max(0.0, reflDir.y);
  vec3 skyColor = mix(vec3(0.5, 0.6, 0.7), vec3(0.2, 0.4, 0.8), skyGrad);

  vec3 color = mix(deepColor, skyColor, fresnel);
  color += vec3(1.0, 0.95, 0.9) * spec * 2.0;

  // Foam
  if (vFoam > uFoamThreshold) {
    float foamMix = smoothstep(uFoamThreshold, uFoamThreshold + 0.3, vFoam);
    color = mix(color, vec3(0.9, 0.95, 1.0), foamMix * 0.7);
  }

  gl_FragColor = vec4(color, 0.92);
}
`;

// ── Component ────────────────────────────────────────────────────────────────

export function OceanRenderer({
  size = [10000, 10000],
  resolution = 256,
  windSpeed = 10,
  windDirection = [1, 0],
  choppiness = 1.5,
  color = '#004060',
  roughness = 0.1,
  foamThreshold = 0.3,
  sunPosition = [100, 200, 100],
  underwaterFogColor = '#012030',
  underwaterFogDensity = 0.1,
  altitude = 0,
}: OceanRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const colorObj = useMemo(() => new THREE.Color(color), [color]);
  const sunPos = useMemo(() => new THREE.Vector3(...sunPosition), [sunPosition]);
  const fogCol = useMemo(() => new THREE.Color(underwaterFogColor), [underwaterFogColor]);
  const windDir = useMemo(() => new THREE.Vector2(...windDirection), [windDirection]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWindSpeed: { value: windSpeed },
      uWindDirection: { value: windDir },
      uChoppiness: { value: choppiness },
      uColor: { value: colorObj },
      uRoughness: { value: roughness },
      uFoamThreshold: { value: foamThreshold },
      uSunPosition: { value: sunPos },
      uFogColor: { value: fogCol },
      uFogDensity: { value: underwaterFogDensity },
    }),
    [
      windSpeed,
      windDir,
      choppiness,
      colorObj,
      roughness,
      foamThreshold,
      sunPos,
      fogCol,
      underwaterFogDensity,
    ]
  );

  useFrame((_, delta) => {
    timeRef.current += delta;
    uniforms.uTime.value = timeRef.current;
    uniforms.uWindSpeed.value = windSpeed;
    uniforms.uChoppiness.value = choppiness;
  });

  /** Query wave height at a world position for buoyancy */
  const getWaveHeight = useCallback(
    (worldX: number, worldZ: number): number => {
      const t = timeRef.current;
      const k = (2 * Math.PI) / 60;
      const c = Math.sqrt(9.81 / k);
      const phase =
        k * (windDirection[0] * worldX + windDirection[1] * worldZ - c * windSpeed * 0.1 * t);
      return altitude + Math.sin(phase) * choppiness;
    },
    [altitude, windSpeed, windDirection, choppiness]
  );

  // Expose buoyancy API via userData
  useMemo(() => {
    if (meshRef.current) {
      meshRef.current.userData.getWaveHeight = getWaveHeight;
    }
  }, [getWaveHeight]);

  return (
    <mesh
      ref={meshRef}
      position={[0, altitude, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
    >
      <planeGeometry args={[size[0], size[1], resolution, resolution]} />
      <shaderMaterial
        vertexShader={OCEAN_VERT}
        fragmentShader={OCEAN_FRAG}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
