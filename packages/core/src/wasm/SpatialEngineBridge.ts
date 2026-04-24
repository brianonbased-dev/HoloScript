/**
 * SpatialEngineBridge.ts
 *
 * TypeScript bridge to the spatial-engine WASM module.
 * Loads the .wasm binary, provides ergonomic TS wrappers around
 * hot-path functions (collision, pathfinding, noise), and falls
 * back to pure-TS implementations when WASM is unavailable.
 *
 * @module wasm
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type Vec3Like = Vec3 | [number, number, number];
const vx = (v: Vec3Like) => (v as Vec3).x ?? (v as [number, number, number])[0] ?? 0;
const vy = (v: Vec3Like) => (v as Vec3).y ?? (v as [number, number, number])[1] ?? 0;
const vz = (v: Vec3Like) => (v as Vec3).z ?? (v as [number, number, number])[2] ?? 0;

export interface WasmExports {
  // Memory
  memory: WebAssembly.Memory;

  // Noise generation
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

  // Pathfinding
  astar_find_path(
    gridPtr: number,
    width: number,
    height: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    resultPtr: number
  ): number; // Returns path length

  // Collision detection
  sphere_sphere_test(
    ax: number,
    ay: number,
    az: number,
    ar: number,
    bx: number,
    by: number,
    bz: number,
    br: number
  ): number; // 1 = colliding, 0 = not

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

  // Memory management
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
}

export interface BridgeStatus {
  wasmLoaded: boolean;
  fallbackMode: boolean;
  loadTimeMs: number;
  moduleSize: number;
}

// =============================================================================
// FALLBACK IMPLEMENTATIONS (Pure TS)
// =============================================================================

function perlinNoise2D_fallback(x: number, y: number, seed: number): number {
  // Simplified value noise fallback
  const hash = (ix: number, iy: number) => {
    let h = (ix * 374761393 + iy * 668265263 + seed * 1013904223) | 0;
    h = ((h >> 13) ^ h) * 1274126177;
    h = (h >> 16) ^ h;
    return ((h & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  };

  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash(ix, iy),
    n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1),
    n11 = hash(ix + 1, iy + 1);

  return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fbmNoise_fallback(
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  persistence: number,
  seed: number
): number {
  let total = 0,
    amplitude = 1,
    frequency = 1,
    maxAmplitude = 0;
  for (let i = 0; i < octaves; i++) {
    total += perlinNoise2D_fallback(x * frequency, y * frequency, seed + i) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / maxAmplitude;
}

function sphereSphereTest_fallback(
  ax: number,
  ay: number,
  az: number,
  ar: number,
  bx: number,
  by: number,
  bz: number,
  br: number
): boolean {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const distSq = dx * dx + dy * dy + dz * dz;
  const radSum = ar + br;
  return distSq <= radSum * radSum;
}

function aabbOverlap_fallback(
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
): boolean {
  return (
    aminX <= bmaxX &&
    amaxX >= bminX &&
    aminY <= bmaxY &&
    amaxY >= bminY &&
    aminZ <= bmaxZ &&
    amaxZ >= bminZ
  );
}

// =============================================================================
// BRIDGE
// =============================================================================

export class SpatialEngineBridge {
  private wasm: WasmExports | null = null;
  private status: BridgeStatus = {
    wasmLoaded: false,
    fallbackMode: true,
    loadTimeMs: 0,
    moduleSize: 0,
  };

  /**
   * Load the WASM module from a URL or ArrayBuffer.
   * Returns false if loading fails (bridge switches to fallback mode).
   */
  async load(source: string | ArrayBuffer): Promise<boolean> {
    const start = performance.now();

    try {
      let wasmBytes: ArrayBuffer;
      if (typeof source === 'string') {
        const resp = await fetch(source);
        if (!resp.ok) throw new Error(`Failed to fetch WASM: ${resp.status}`);
        wasmBytes = await resp.arrayBuffer();
      } else {
        wasmBytes = source;
      }

      const module = await WebAssembly.compile(wasmBytes);
      const instance = await WebAssembly.instantiate(module, {
        env: {
          // Minimal import stubs
          console_log: (ptr: number, len: number) => {
            const bytes = new Uint8Array(this.wasm!.memory.buffer, ptr, len);
            console.log(new TextDecoder().decode(bytes));
          },
        },
      });

      this.wasm = instance.exports as unknown as WasmExports;
      this.status = {
        wasmLoaded: true,
        fallbackMode: false,
        loadTimeMs: performance.now() - start,
        moduleSize: wasmBytes.byteLength,
      };
      return true;
    } catch (e) {
      console.warn('[SpatialEngineBridge] WASM load failed, using fallback:', e);
      this.status = {
        wasmLoaded: false,
        fallbackMode: true,
        loadTimeMs: performance.now() - start,
        moduleSize: 0,
      };
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Noise
  // ---------------------------------------------------------------------------

  perlinNoise2D(x: number, y: number, seed = 42): number {
    if (this.wasm) return this.wasm.perlin_noise_2d(x, y, seed);
    return perlinNoise2D_fallback(x, y, seed);
  }

  perlinNoise3D(x: number, y: number, z: number, seed = 42): number {
    if (this.wasm) return this.wasm.perlin_noise_3d(x, y, z, seed);
    // Fallback: combine 2D noise planes
    return (
      (perlinNoise2D_fallback(x, y, seed) +
        perlinNoise2D_fallback(y, z, seed + 1) +
        perlinNoise2D_fallback(x, z, seed + 2)) /
      3
    );
  }

  fbmNoise(
    x: number,
    y: number,
    octaves = 6,
    lacunarity = 2,
    persistence = 0.5,
    seed = 42
  ): number {
    if (this.wasm) return this.wasm.fbm_noise(x, y, octaves, lacunarity, persistence, seed);
    return fbmNoise_fallback(x, y, octaves, lacunarity, persistence, seed);
  }

  // ---------------------------------------------------------------------------
  // Collision
  // ---------------------------------------------------------------------------

  sphereSphereTest(aPos: Vec3Like, aRadius: number, bPos: Vec3Like, bRadius: number): boolean {
    if (this.wasm)
      return (
        this.wasm.sphere_sphere_test(
          vx(aPos),
          vy(aPos),
          vz(aPos),
          aRadius,
          vx(bPos),
          vy(bPos),
          vz(bPos),
          bRadius
        ) === 1
      );
    return sphereSphereTest_fallback(
      vx(aPos),
      vy(aPos),
      vz(aPos),
      aRadius,
      vx(bPos),
      vy(bPos),
      vz(bPos),
      bRadius
    );
  }

  aabbOverlap(aMin: Vec3Like, aMax: Vec3Like, bMin: Vec3Like, bMax: Vec3Like): boolean {
    if (this.wasm)
      return (
        this.wasm.aabb_overlap(
          vx(aMin),
          vy(aMin),
          vz(aMin),
          vx(aMax),
          vy(aMax),
          vz(aMax),
          vx(bMin),
          vy(bMin),
          vz(bMin),
          vx(bMax),
          vy(bMax),
          vz(bMax)
        ) === 1
      );
    return aabbOverlap_fallback(
      vx(aMin),
      vy(aMin),
      vz(aMin),
      vx(aMax),
      vy(aMax),
      vz(aMax),
      vx(bMin),
      vy(bMin),
      vz(bMin),
      vx(bMax),
      vy(bMax),
      vz(bMax)
    );
  }

  // ---------------------------------------------------------------------------
  // Pathfinding
  // ---------------------------------------------------------------------------

  /**
   * A* pathfinding on a 2D grid. Returns array of [x, y] waypoints.
   * Grid values: 0 = walkable, 1 = blocked.
   */
  findPath(
    grid: Uint8Array,
    width: number,
    height: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): [number, number][] {
    if (this.wasm) {
      // Allocate grid + result buffer in WASM memory
      const gridPtr = this.wasm.alloc(grid.length);
      const maxPath = width * height;
      const resultPtr = this.wasm.alloc(maxPath * 2 * 4); // x,y as i32 pairs

      new Uint8Array(this.wasm.memory.buffer, gridPtr, grid.length).set(grid);
      const pathLen = this.wasm.astar_find_path(
        gridPtr,
        width,
        height,
        startX,
        startY,
        endX,
        endY,
        resultPtr
      );

      const result: [number, number][] = [];
      const view = new Int32Array(this.wasm.memory.buffer, resultPtr, pathLen * 2);
      for (let i = 0; i < pathLen; i++) {
        result.push([view[i * 2], view[i * 2 + 1]]);
      }

      this.wasm.dealloc(gridPtr, grid.length);
      this.wasm.dealloc(resultPtr, maxPath * 2 * 4);
      return result;
    }

    // Pure TS A* fallback
    return this.astarFallback(grid, width, height, startX, startY, endX, endY);
  }

  private astarFallback(
    grid: Uint8Array,
    w: number,
    h: number,
    sx: number,
    sy: number,
    ex: number,
    ey: number
  ): [number, number][] {
    const key = (x: number, y: number) => y * w + x;
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const openSet = new Set<number>();

    const startKey = key(sx, sy);
    gScore.set(startKey, 0);
    fScore.set(startKey, Math.abs(ex - sx) + Math.abs(ey - sy));
    openSet.add(startKey);

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

    while (openSet.size > 0) {
      // Find lowest fScore in open set
      let current = -1,
        bestF = Infinity;
      for (const k of openSet) {
        const f = fScore.get(k) ?? Infinity;
        if (f < bestF) {
          bestF = f;
          current = k;
        }
      }
      if (current === -1) break;

      const cx = current % w,
        cy = Math.floor(current / w);
      if (cx === ex && cy === ey) {
        // Reconstruct path
        const path: [number, number][] = [];
        let c = current;
        while (c !== undefined) {
          path.unshift([c % w, Math.floor(c / w)]);
          c = cameFrom.get(c)!;
          if (c === startKey) {
            path.unshift([sx, sy]);
            break;
          }
        }
        return path;
      }

      openSet.delete(current);

      for (const [dx, dy] of dirs) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (grid[ny * w + nx] !== 0) continue; // Blocked

        const nk = key(nx, ny);
        const tentG = (gScore.get(current) ?? Infinity) + (dx !== 0 && dy !== 0 ? 1.414 : 1);

        if (tentG < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, current);
          gScore.set(nk, tentG);
          fScore.set(nk, tentG + Math.abs(ex - nx) + Math.abs(ey - ny));
          openSet.add(nk);
        }
      }
    }

    return []; // No path found
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  getStatus(): BridgeStatus {
    return { ...this.status };
  }

  isWasmAvailable(): boolean {
    return this.status.wasmLoaded;
  }
}
