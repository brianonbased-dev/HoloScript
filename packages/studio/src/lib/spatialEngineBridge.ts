/**
 * spatialEngineBridge.ts — WASM Bridge for HoloScript Spatial Engine
 *
 * Typed TypeScript wrappers over the spatial-engine-wasm Rust module.
 * Provides noise generation, collision detection, and A* pathfinding
 * with automatic fallback to pure TS when WASM is unavailable.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type Vec3 = [number, number, number];
export interface AABB {
  min: Vec3;
  max: Vec3;
}
export interface Sphere {
  center: Vec3;
  radius: number;
}
export type Waypoint = [number, number];

export interface WasmModule {
  perlin_noise_2d(x: number, y: number, seed: number): number;
  perlin_noise_3d(x: number, y: number, z: number, seed: number): number;
  fbm_noise(
    x: number,
    y: number,
    octaves: number,
    lacunarity: number,
    persistence: number,
    seed: number
  ): number;
  sphere_sphere_test(
    ax: number,
    ay: number,
    az: number,
    ar: number,
    bx: number,
    by: number,
    bz: number,
    br: number
  ): number;
  aabb_overlap(
    aminX: number,
    aminY: number,
    aminZ: number,
    amaxX: number,
    amaxY: number,
    amaxZ: number,
    bminX: number,
    bminY: number,
    bminZ: number,
    bmaxX: number,
    bmaxY: number,
    bmaxZ: number
  ): number;
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  astar_find_path(
    gridPtr: number,
    width: number,
    height: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    resultPtr: number
  ): number;
  memory: WebAssembly.Memory;
}

export type BridgeBackend = 'wasm' | 'fallback';

export interface BridgeStatus {
  backend: BridgeBackend;
  wasmLoaded: boolean;
  moduleSize: number;
  functions: string[];
}

// ═══════════════════════════════════════════════════════════════════
// Pure TS Fallback Implementations
// ═══════════════════════════════════════════════════════════════════

function fallbackHash2d(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1013904223);
  h = Math.imul((h >> 13) ^ h, 1274126177);
  h = (h >> 16) ^ h;
  return ((h & 0x7fffffff) / 0x7fffffff) * 2.0 - 1.0;
}

function fallbackSmoothstep(t: number): number {
  return t * t * (3.0 - 2.0 * t);
}

function fallbackPerlinNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fallbackSmoothstep(fx);
  const sy = fallbackSmoothstep(fy);
  const n00 = fallbackHash2d(ix, iy, seed);
  const n10 = fallbackHash2d(ix + 1, iy, seed);
  const n01 = fallbackHash2d(ix, iy + 1, seed);
  const n11 = fallbackHash2d(ix + 1, iy + 1, seed);
  const nx0 = n00 * (1.0 - sx) + n10 * sx;
  const nx1 = n01 * (1.0 - sx) + n11 * sx;
  return nx0 * (1.0 - sy) + nx1 * sy;
}

// ═══════════════════════════════════════════════════════════════════
// Bridge Class
// ═══════════════════════════════════════════════════════════════════

let wasmModule: WasmModule | null = null;
let bridgeBackend: BridgeBackend = 'fallback';

/**
 * Initialize the WASM bridge. Falls back to TS if loading fails.
 */
export async function initWasmBridge(wasmUrl?: string): Promise<BridgeStatus> {
  try {
    if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly not supported');
    const url = wasmUrl ?? '/spatial-engine-wasm/spatial_engine_wasm_bg.wasm';
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes);
    wasmModule = instance.exports as unknown as WasmModule;
    bridgeBackend = 'wasm';
    return getBridgeStatus();
  } catch {
    bridgeBackend = 'fallback';
    return getBridgeStatus();
  }
}

/**
 * Get bridge status.
 */
export function getBridgeStatus(): BridgeStatus {
  return {
    backend: bridgeBackend,
    wasmLoaded: bridgeBackend === 'wasm',
    moduleSize: 0,
    functions: [
      'perlinNoise2D',
      'perlinNoise3D',
      'fbmNoise',
      'sphereSphereTest',
      'aabbOverlap',
      'astarFindPath',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════
// Noise Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * 2D Perlin noise. Uses WASM if available, else TS fallback.
 */
export function perlinNoise2D(x: number, y: number, seed: number = 42): number {
  if (wasmModule) return wasmModule.perlin_noise_2d(x, y, seed);
  return fallbackPerlinNoise2D(x, y, seed);
}

/**
 * 3D Perlin noise.
 */
export function perlinNoise3D(x: number, y: number, z: number, seed: number = 42): number {
  if (wasmModule) return wasmModule.perlin_noise_3d(x, y, z, seed);
  // Fallback: combine 3 planes of 2D noise
  const xy = fallbackPerlinNoise2D(x, y, seed);
  const yz = fallbackPerlinNoise2D(y, z, seed + 1);
  const xz = fallbackPerlinNoise2D(x, z, seed + 2);
  return (xy + yz + xz) / 3.0;
}

/**
 * Fractal Brownian Motion.
 */
export function fbmNoise(
  x: number,
  y: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  persistence: number = 0.5,
  seed: number = 42
): number {
  if (wasmModule) return wasmModule.fbm_noise(x, y, octaves, lacunarity, persistence, seed);
  let total = 0,
    amplitude = 1,
    frequency = 1,
    maxAmplitude = 0;
  for (let i = 0; i < octaves; i++) {
    total += fallbackPerlinNoise2D(x * frequency, y * frequency, seed + i) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return maxAmplitude > 0 ? total / maxAmplitude : 0;
}

// ═══════════════════════════════════════════════════════════════════
// Collision Detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Sphere-sphere collision test.
 */
export function sphereSphereTest(a: Sphere, b: Sphere): boolean {
  if (wasmModule) {
    return (
      wasmModule.sphere_sphere_test(
        a.center[0],
        a.center[1],
        a.center[2],
        a.radius,
        b.center[0],
        b.center[1],
        b.center[2],
        b.radius
      ) === 1
    );
  }
  const dx = b.center[0] - a.center[0];
  const dy = b.center[1] - a.center[1];
  const dz = b.center[2] - a.center[2];
  const distSq = dx * dx + dy * dy + dz * dz;
  const radSum = a.radius + b.radius;
  return distSq <= radSum * radSum;
}

/**
 * AABB overlap test.
 */
export function aabbOverlap(a: AABB, b: AABB): boolean {
  if (wasmModule) {
    return (
      wasmModule.aabb_overlap(
        a.min[0],
        a.min[1],
        a.min[2],
        a.max[0],
        a.max[1],
        a.max[2],
        b.min[0],
        b.min[1],
        b.min[2],
        b.max[0],
        b.max[1],
        b.max[2]
      ) === 1
    );
  }
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

// ═══════════════════════════════════════════════════════════════════
// Pathfinding
// ═══════════════════════════════════════════════════════════════════

/**
 * A* pathfinding on a 2D grid. Falls back to BFS if WASM unavailable.
 */
export function astarFindPath(
  grid: number[][],
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Waypoint[] {
  const height = grid.length;
  if (height === 0) return [];
  const width = grid[0].length;

  // Fallback BFS implementation
  const key = (x: number, y: number) => `${x},${y}`;
  const queue: { x: number; y: number; path: Waypoint[] }[] = [
    { x: startX, y: startY, path: [[startX, startY]] },
  ];
  const visited = new Set<string>([key(startX, startY)]);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];

  while (queue.length > 0) {
    const { x, y, path } = queue.shift()!;
    if (x === endX && y === endY) return path;

    for (const [dx, dy] of dirs) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (grid[ny][nx] !== 0 || visited.has(key(nx, ny))) continue;
      visited.add(key(nx, ny));
      queue.push({ x: nx, y: ny, path: [...path, [nx, ny]] });
    }
  }
  return []; // No path
}

/**
 * Generate a heightmap using FBM noise.
 */
export function generateHeightmap(
  width: number,
  height: number,
  scale: number = 0.05,
  seed: number = 42
): number[][] {
  const map: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(fbmNoise(x * scale, y * scale, 6, 2.0, 0.5, seed));
    }
    map.push(row);
  }
  return map;
}
