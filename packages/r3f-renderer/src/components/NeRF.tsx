import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type NeRFMethod = 'instant_ngp' | 'nerfacto' | 'tensorf' | 'mip_nerf' | 'zip_nerf';

export type Vec3 = [number, number, number];

export interface NeRFResolvedConfig {
  method: NeRFMethod;
  src: string | null;
  resolution: number;
  nearPlane: number;
  farPlane: number;
  samplesPerRay: number;
  batchSize: number;
  enableDeformation: boolean;
  backgroundColor: Vec3;
  densityScale: number;
}

export interface NeRFGridDescriptor {
  schema?: string;
  gridSize?: Vec3;
  density?: ArrayLike<number>;
  colors?: ArrayLike<number>;
  rgba?: ArrayLike<number>;
  bounds?: { min: Vec3; max: Vec3 } | [Vec3, Vec3];
  exposure?: number;
}

export interface NeRFGridModel {
  schema: string;
  gridSize: Vec3;
  density: Float32Array;
  colors: Float32Array;
  bounds: { min: Vec3; max: Vec3 };
  exposure: number;
}

export interface NeRFProps {
  /** Compiler-emitted @nerf config bag. */
  nerf?: boolean | Record<string, unknown>;
  src?: string;
  modelUrl?: string;
  model?: NeRFGridDescriptor | NeRFGridModel;
  method?: NeRFMethod;
  resolution?: number;
  nearPlane?: number;
  farPlane?: number;
  samplesPerRay?: number;
  batchSize?: number;
  enableDeformation?: boolean;
  backgroundColor?: Vec3;
  densityScale?: number;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
  onLoad?: (model: NeRFGridModel) => void;
  onError?: (error: Error) => void;
}

const DEFAULT_GRID: Vec3 = [24, 24, 24];
const DEFAULT_CONFIG: NeRFResolvedConfig = {
  method: 'instant_ngp',
  src: null,
  resolution: 512,
  nearPlane: 0.01,
  farPlane: 100,
  samplesPerRay: 64,
  batchSize: 4096,
  enableDeformation: false,
  backgroundColor: [0, 0, 0],
  densityScale: 1,
};

const VERTEX_SHADER = /* glsl */ `#version 300 es
out vec3 vLocalPos;
out vec3 vWorldPos;

void main() {
  vLocalPos = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uRadianceGrid;
uniform mat4 uInvModelMatrix;
uniform int uSamplesPerRay;
uniform float uNearPlane;
uniform float uFarPlane;
uniform float uDensityScale;
uniform vec3 uBackgroundColor;

in vec3 vLocalPos;
out vec4 fragColor;

bool intersectBox(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 invRd = 1.0 / max(abs(rd), vec3(1e-5)) * sign(rd);
  vec3 lo = (-0.5 - ro) * invRd;
  vec3 hi = (0.5 - ro) * invRd;
  vec3 tmin = min(lo, hi);
  vec3 tmax = max(lo, hi);
  t0 = max(max(tmin.x, tmin.y), tmin.z);
  t1 = min(min(tmax.x, tmax.y), tmax.z);
  return t1 >= max(t0, 0.0);
}

void main() {
  vec3 ro = (uInvModelMatrix * vec4(cameraPosition, 1.0)).xyz;
  vec3 rd = normalize(vLocalPos - ro);
  float t0;
  float t1;
  if (!intersectBox(ro, rd, t0, t1)) {
    fragColor = vec4(uBackgroundColor, 0.0);
    return;
  }

  t0 = max(t0, uNearPlane);
  t1 = min(t1, uFarPlane);
  float distance = max(t1 - t0, 0.0);
  int steps = clamp(uSamplesPerRay, 1, 128);
  float stepSize = distance / float(steps);
  vec3 color = vec3(0.0);
  float transmittance = 1.0;

  for (int i = 0; i < 128; i += 1) {
    if (i >= steps || transmittance < 0.01) break;
    float t = t0 + (float(i) + 0.5) * stepSize;
    vec3 p = ro + rd * t;
    vec4 radiance = texture(uRadianceGrid, clamp(p + 0.5, vec3(0.0), vec3(1.0)));
    float alpha = 1.0 - exp(-radiance.a * uDensityScale * stepSize * 8.0);
    color += transmittance * alpha * radiance.rgb;
    transmittance *= 1.0 - alpha;
  }

  color += transmittance * uBackgroundColor;
  fragColor = vec4(color, 1.0 - transmittance);
}
`;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function numberField(value: unknown, fallback: number, min = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
}

function boolField(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function vec3Field(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  const out = value.slice(0, 3).map((n) => Number(n));
  return out.every(Number.isFinite) ? (out as Vec3) : fallback;
}

function sourceField(config: Record<string, unknown>, props: NeRFProps): string | null {
  const value =
    props.src ??
    props.modelUrl ??
    config.src ??
    config.source ??
    config.url ??
    config.modelUrl ??
    config.model_url;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function resolveNeRFConfig(props: NeRFProps): NeRFResolvedConfig {
  const bag = props.nerf === true ? {} : asRecord(props.nerf);
  return {
    method: (props.method ?? bag.method ?? DEFAULT_CONFIG.method) as NeRFMethod,
    src: sourceField(bag, props),
    resolution: numberField(props.resolution ?? bag.resolution, DEFAULT_CONFIG.resolution, 1),
    nearPlane: numberField(
      props.nearPlane ?? bag.nearPlane ?? bag.near_plane,
      DEFAULT_CONFIG.nearPlane
    ),
    farPlane: numberField(props.farPlane ?? bag.farPlane ?? bag.far_plane, DEFAULT_CONFIG.farPlane),
    samplesPerRay: Math.min(
      128,
      numberField(
        props.samplesPerRay ?? bag.samplesPerRay ?? bag.samples_per_ray,
        DEFAULT_CONFIG.samplesPerRay,
        1
      )
    ),
    batchSize: numberField(
      props.batchSize ?? bag.batchSize ?? bag.batch_size,
      DEFAULT_CONFIG.batchSize,
      1
    ),
    enableDeformation: boolField(
      props.enableDeformation ?? bag.enableDeformation ?? bag.enable_deformation,
      DEFAULT_CONFIG.enableDeformation
    ),
    backgroundColor: vec3Field(
      props.backgroundColor ?? bag.backgroundColor ?? bag.background_color,
      DEFAULT_CONFIG.backgroundColor
    ),
    densityScale: numberField(
      props.densityScale ?? bag.densityScale ?? bag.density_scale,
      DEFAULT_CONFIG.densityScale
    ),
  };
}

function toFloatArray(
  value: ArrayLike<number> | undefined,
  expected: number,
  field: string
): Float32Array {
  if (!value) return new Float32Array(expected);
  if (value.length < expected) {
    throw new Error(`NeRF ${field} has ${value.length} values; expected at least ${expected}`);
  }
  const out = new Float32Array(expected);
  for (let i = 0; i < expected; i += 1) {
    const n = Number(value[i]);
    out[i] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

function normalizeGridSize(value: unknown): Vec3 {
  const gridSize = vec3Field(value, DEFAULT_GRID).map((n) => Math.max(1, Math.floor(n))) as Vec3;
  return gridSize;
}

function boundsField(value: NeRFGridDescriptor['bounds']): { min: Vec3; max: Vec3 } {
  if (Array.isArray(value) && value.length >= 2) {
    return {
      min: vec3Field(value[0], [-0.5, -0.5, -0.5]),
      max: vec3Field(value[1], [0.5, 0.5, 0.5]),
    };
  }
  if (value && typeof value === 'object') {
    const objectBounds = value as { min?: unknown; max?: unknown };
    return {
      min: vec3Field(objectBounds.min, [-0.5, -0.5, -0.5]),
      max: vec3Field(objectBounds.max, [0.5, 0.5, 0.5]),
    };
  }
  return { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
}

export function normalizeNeRFGridModel(input: NeRFGridDescriptor | NeRFGridModel): NeRFGridModel {
  const gridSize = normalizeGridSize(input.gridSize);
  const voxelCount = gridSize[0] * gridSize[1] * gridSize[2];
  const density = toFloatArray(input.density, voxelCount, 'density');
  let colors: Float32Array;
  if ('colors' in input && input.colors) {
    colors = toFloatArray(input.colors, voxelCount * 3, 'colors');
  } else if ('rgba' in input && input.rgba) {
    const rgba = toFloatArray(input.rgba, voxelCount * 4, 'rgba');
    colors = new Float32Array(voxelCount * 3);
    for (let i = 0; i < voxelCount; i += 1) {
      colors[i * 3] = rgba[i * 4];
      colors[i * 3 + 1] = rgba[i * 4 + 1];
      colors[i * 3 + 2] = rgba[i * 4 + 2];
      density[i] = rgba[i * 4 + 3];
    }
  } else {
    colors = new Float32Array(voxelCount * 3);
    for (let i = 0; i < voxelCount; i += 1) {
      colors[i * 3] = density[i];
      colors[i * 3 + 1] = density[i];
      colors[i * 3 + 2] = density[i];
    }
  }
  return {
    schema: input.schema ?? 'holoscript-nerf-grid/v1',
    gridSize,
    density,
    colors,
    bounds: boundsField(input.bounds),
    exposure: numberField(input.exposure, 1),
  };
}

export function createProceduralNeRFGrid(gridSize: Vec3 = DEFAULT_GRID): NeRFGridModel {
  const size = normalizeGridSize(gridSize);
  const voxelCount = size[0] * size[1] * size[2];
  const density = new Float32Array(voxelCount);
  const colors = new Float32Array(voxelCount * 3);
  let i = 0;
  for (let z = 0; z < size[2]; z += 1) {
    for (let y = 0; y < size[1]; y += 1) {
      for (let x = 0; x < size[0]; x += 1) {
        const nx = (x / Math.max(1, size[0] - 1)) * 2 - 1;
        const ny = (y / Math.max(1, size[1] - 1)) * 2 - 1;
        const nz = (z / Math.max(1, size[2] - 1)) * 2 - 1;
        const lobe = Math.exp(-(nx * nx * 3.5 + ny * ny * 5 + nz * nz * 3.5));
        const filament = Math.exp(-((nx - Math.sin(nz * 4) * 0.25) ** 2 + ny * ny) * 18);
        density[i] = Math.min(1, lobe * 0.9 + filament * 0.45);
        colors[i * 3] = 0.28 + 0.58 * Math.max(0, nx * 0.5 + 0.5);
        colors[i * 3 + 1] = 0.2 + 0.7 * density[i];
        colors[i * 3 + 2] = 0.42 + 0.45 * Math.max(0, nz * 0.5 + 0.5);
        i += 1;
      }
    }
  }
  return normalizeNeRFGridModel({ gridSize: size, density, colors });
}

export function packNeRFRadianceGrid(model: NeRFGridModel): Uint8Array {
  const voxelCount = model.gridSize[0] * model.gridSize[1] * model.gridSize[2];
  const out = new Uint8Array(voxelCount * 4);
  const exposure = Math.max(0, model.exposure);
  for (let i = 0; i < voxelCount; i += 1) {
    out[i * 4] = Math.round(Math.min(1, Math.max(0, model.colors[i * 3] * exposure)) * 255);
    out[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, model.colors[i * 3 + 1] * exposure)) * 255);
    out[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, model.colors[i * 3 + 2] * exposure)) * 255);
    out[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, model.density[i])) * 255);
  }
  return out;
}

function createRadianceTexture(model: NeRFGridModel): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(
    packNeRFRadianceGrid(model) as unknown as BufferSource,
    model.gridSize[0],
    model.gridSize[1],
    model.gridSize[2]
  );
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function NeRF({
  model,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  onLoad,
  onError,
  ...props
}: NeRFProps): ReactElement {
  const meshRef = useRef<THREE.Mesh>(null);
  const config = useMemo(() => resolveNeRFConfig(props), [props]);
  const [grid, setGrid] = useState<NeRFGridModel>(() =>
    model ? normalizeNeRFGridModel(model) : createProceduralNeRFGrid()
  );
  const [loading, setLoading] = useState(Boolean(config.src && !model));

  useEffect(() => {
    if (model) {
      const normalized = normalizeNeRFGridModel(model);
      setGrid(normalized);
      onLoad?.(normalized);
      return;
    }
    if (!config.src) {
      const fallback = createProceduralNeRFGrid();
      setGrid(fallback);
      onLoad?.(fallback);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(config.src)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load NeRF model: ${response.status}`);
        return response.json() as Promise<NeRFGridDescriptor>;
      })
      .then((payload) => {
        if (cancelled) return;
        const normalized = normalizeNeRFGridModel(payload);
        setGrid(normalized);
        setLoading(false);
        onLoad?.(normalized);
      })
      .catch((err) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setLoading(false);
        onError?.(error);
      });
    return () => {
      cancelled = true;
    };
  }, [config.src, model, onError, onLoad]);

  const texture = useMemo(() => createRadianceTexture(grid), [grid]);
  useEffect(() => () => texture.dispose(), [texture]);

  const uniforms = useMemo(
    () => ({
      uRadianceGrid: { value: texture },
      uInvModelMatrix: { value: new THREE.Matrix4() },
      uSamplesPerRay: { value: config.samplesPerRay },
      uNearPlane: { value: config.nearPlane },
      uFarPlane: { value: config.farPlane },
      uDensityScale: { value: config.densityScale },
      uBackgroundColor: { value: new THREE.Vector3(...config.backgroundColor) },
    }),
    [texture, config]
  );

  useFrame(() => {
    if (!meshRef.current) return;
    uniforms.uInvModelMatrix.value.copy(meshRef.current.matrixWorld).invert();
    uniforms.uSamplesPerRay.value = config.samplesPerRay;
    uniforms.uNearPlane.value = config.nearPlane;
    uniforms.uFarPlane.value = config.farPlane;
    uniforms.uDensityScale.value = config.densityScale;
    uniforms.uBackgroundColor.value.set(...config.backgroundColor);
  });

  const normalizedScale = (typeof scale === 'number' ? [scale, scale, scale] : scale) as Vec3;
  const rotRad = rotation.map((d) => (d * Math.PI) / 180) as Vec3;

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotRad}
      scale={normalizedScale}
      frustumCulled={false}
      userData={{ nerfMethod: config.method, loading }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        glslVersion={THREE.GLSL3}
      />
    </mesh>
  );
}

export const NeRFVolume = NeRF;
