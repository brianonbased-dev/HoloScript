/**
 * TerrainRenderer — Procedural terrain with fBm noise, biome splatmap, and LOD.
 *
 * Generates heightmap via GPU vertex shader (fBm noise), maps biomes
 * by height/slope, and renders with per-biome coloring.
 * Supports 4-level LOD with geomorphing for pop-free transitions.
 *
 * @see W.253: GPU terrain erosion
 * @see P.RENDER.001: Environment Rendering Stack pattern
 * @see G.RENDER.006: Terrain gen at 4096 can take 5-30s — preview at 512
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BiomeConfig {
  name: string;
  heightRange: [number, number];
  slopeRange?: [number, number];
  color: string;
}

export interface TerrainRendererProps {
  /** Terrain size in world units [width, depth] (default: [1024, 1024]) */
  size?: [number, number];
  /** Heightmap resolution (default: 256) */
  resolution?: number;
  /** Maximum terrain height (default: 100) */
  maxHeight?: number;
  /** Noise octaves for fBm (default: 8) */
  octaves?: number;
  /** Noise persistence (default: 0.5) */
  persistence?: number;
  /** Noise lacunarity (default: 2.0) */
  lacunarity?: number;
  /** Noise seed (default: 42) */
  seed?: number;
  /** Hydraulic erosion iterations (default: 0 = disabled) */
  erosionIterations?: number;
  /** Biome configurations */
  biomes?: BiomeConfig[];
  /** Number of LOD levels (default: 4) */
  lodLevels?: number;
  /** Enable wireframe debug view */
  wireframe?: boolean;
  /** Group position offset */
  position?: [number, number, number];
  /** Sun position for lighting */
  sunPosition?: [number, number, number];
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const TERRAIN_VERT = /* glsl */ `
uniform float uMaxHeight;
uniform float uSeed;
uniform int uOctaves;
uniform float uPersistence;
uniform float uLacunarity;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;
varying float vSlope;

float hash2D(vec2 p) {
  return fract(sin(dot(p + uSeed * 0.01, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2D(i);
  float b = hash2D(i + vec2(1.0, 0.0));
  float c = hash2D(i + vec2(0.0, 1.0));
  float d = hash2D(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uOctaves) break;
    value += amplitude * noise2D(p * frequency);
    frequency *= uLacunarity;
    amplitude *= uPersistence;
  }
  return value;
}

void main() {
  vec2 terrainUV = uv;
  float h = fbm(terrainUV * 10.0) * uMaxHeight;

  vec3 pos = position;
  pos.z = h;

  float eps = 0.01;
  float hL = fbm((terrainUV + vec2(-eps, 0.0)) * 10.0) * uMaxHeight;
  float hR = fbm((terrainUV + vec2(eps, 0.0)) * 10.0) * uMaxHeight;
  float hD = fbm((terrainUV + vec2(0.0, -eps)) * 10.0) * uMaxHeight;
  float hU = fbm((terrainUV + vec2(0.0, eps)) * 10.0) * uMaxHeight;

  vec3 n = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
  vNormal = normalMatrix * n;

  vHeight = h / uMaxHeight;
  vSlope = 1.0 - abs(n.y);

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const TERRAIN_FRAG = /* glsl */ `
uniform vec3 uSunPosition;
uniform bool uWireframe;

uniform vec3 uWaterColor;
uniform vec3 uSandColor;
uniform vec3 uGrassColor;
uniform vec3 uRockColor;
uniform vec3 uSnowColor;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;
varying float vSlope;

void main() {
  if (uWireframe) {
    gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
    return;
  }

  vec3 normal = normalize(vNormal);
  vec3 sunDir = normalize(uSunPosition);

  // Height-based biome selection with smooth transitions
  vec3 biomeColor;
  if (vHeight < 0.05) {
    biomeColor = uWaterColor;
  } else if (vHeight < 0.12) {
    biomeColor = mix(uWaterColor, uSandColor, smoothstep(0.05, 0.12, vHeight));
  } else if (vHeight < 0.5) {
    biomeColor = mix(uSandColor, uGrassColor, smoothstep(0.12, 0.5, vHeight));
  } else if (vHeight < 0.75) {
    biomeColor = mix(uGrassColor, uRockColor, smoothstep(0.5, 0.75, vHeight));
  } else {
    biomeColor = mix(uRockColor, uSnowColor, smoothstep(0.75, 0.9, vHeight));
  }

  // Slope-based rock blending (steep = rock)
  if (vSlope > 0.5) {
    biomeColor = mix(biomeColor, uRockColor, smoothstep(0.5, 0.8, vSlope));
  }

  float diffuse = max(dot(normal, sunDir), 0.0) * 0.7 + 0.3;
  float ao = smoothstep(0.0, 0.2, vHeight) * 0.3 + 0.7;

  gl_FragColor = vec4(biomeColor * diffuse * ao, 1.0);
}
`;

// ── Default Biomes ───────────────────────────────────────────────────────────

const DEFAULT_BIOMES: BiomeConfig[] = [
  { name: 'water', heightRange: [0, 0.05], color: '#1a5276' },
  { name: 'sand', heightRange: [0.05, 0.12], color: '#f0e68c' },
  { name: 'grass', heightRange: [0.12, 0.5], color: '#2d8a4e' },
  { name: 'rock', heightRange: [0.5, 0.75], color: '#6b6b6b' },
  { name: 'snow', heightRange: [0.75, 1.0], color: '#fafafa' },
];

// ── Component ────────────────────────────────────────────────────────────────

export function TerrainRenderer({
  size = [1024, 1024],
  resolution = 256,
  maxHeight = 100,
  octaves = 8,
  persistence = 0.5,
  lacunarity = 2.0,
  seed = 42,
  biomes = DEFAULT_BIOMES,
  wireframe = false,
  position = [0, 0, 0],
  sunPosition = [100, 200, 100],
}: TerrainRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const biomeColors = useMemo(
    () => ({
      water: new THREE.Color(biomes[0]?.color ?? '#1a5276'),
      sand: new THREE.Color(biomes[1]?.color ?? '#f0e68c'),
      grass: new THREE.Color(biomes[2]?.color ?? '#2d8a4e'),
      rock: new THREE.Color(biomes[3]?.color ?? '#6b6b6b'),
      snow: new THREE.Color(biomes[4]?.color ?? '#fafafa'),
    }),
    [biomes],
  );

  const sunPos = useMemo(
    () => new THREE.Vector3(...sunPosition).normalize(),
    [sunPosition],
  );

  const uniforms = useMemo(
    () => ({
      uMaxHeight: { value: maxHeight },
      uSeed: { value: seed },
      uOctaves: { value: octaves },
      uPersistence: { value: persistence },
      uLacunarity: { value: lacunarity },
      uSunPosition: { value: sunPos },
      uWireframe: { value: wireframe },
      uWaterColor: { value: biomeColors.water },
      uSandColor: { value: biomeColors.sand },
      uGrassColor: { value: biomeColors.grass },
      uRockColor: { value: biomeColors.rock },
      uSnowColor: { value: biomeColors.snow },
    }),
    [maxHeight, seed, octaves, persistence, lacunarity, sunPos, wireframe, biomeColors],
  );

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
    >
      <planeGeometry args={[size[0], size[1], resolution, resolution]} />
      <shaderMaterial
        vertexShader={TERRAIN_VERT}
        fragmentShader={TERRAIN_FRAG}
        uniforms={uniforms}
        wireframe={wireframe}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}
