import type { Vector3 } from '@holoscript/core';
/**
 * RayTracing.ts
 *
 * CPU-side software ray tracing engine:
 *   - Axis-Aligned Bounding Box (AABB) representation
 *   - BVH (Bounding Volume Hierarchy) construction with SAH splits
 *   - Ray-AABB intersection (slab method)
 *   - Ray-triangle intersection (Möller–Trumbore)
 *   - Simple path tracer loop (configurable bounces, Russian roulette)
 *   - Non-Local Means (NLM) bilateral denoising filter
 *   - RayTracingConfig descriptor (rt_api, features, spp, max_bounces)
 *
 * Fully CPU / TypeScript — testable without GPU.
 * Production GPU backends (DXR, OptiX, WebGPU RT extension) would
 * use these structures to generate shader pipelines.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type RTApi = 'dxr' | 'optix' | 'metal_rt' | 'vulkan_rt' | 'software';
export type RTFeature = 'reflections' | 'shadows' | 'ao' | 'gi';

export interface RayTracingConfig {
  rt_api: RTApi;
  features: RTFeature[];
  /** Samples per pixel */
  spp: number;
  /** Max path tracing bounces */
  max_bounces: number;
  denoising: 'nlm' | 'none';
}

const DEFAULT_RT_CONFIG: RayTracingConfig = {
  rt_api: 'software',
  features: ['reflections', 'shadows'],
  spp: 4,
  max_bounces: 3,
  denoising: 'nlm',
};

// =============================================================================
// GEOMETRIC PRIMITIVES
// =============================================================================

export interface AABB {
  min: Vector3;
  max: Vector3;
}

export interface Triangle {
  v0: Vector3;
  v1: Vector3;
  v2: Vector3;
  /** Pre-computed normal (optional, computed on demand) */
  normal?: Vector3;
}

export interface Ray {
  origin: Vector3;
  direction: Vector3; // must be unit length
  tMin: number;
  tMax: number;
}

export interface HitRecord {
  t: number;
  point: Vector3;
  normal: Vector3;
  triangleIndex: number;
}

// =============================================================================
// UTILITIES
// =============================================================================

function vec3Sub(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vec3Dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function vec3Cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vec3Length(v: Vector3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
function vec3Normalize(v: Vector3): Vector3 {
  const len = vec3Length(v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
function vec3AtT(ray: Ray, t: number): Vector3 {
  return [ray.origin[0] + ray.direction[0] * t, ray.origin[1] + ray.direction[1] * t, ray.origin[2] + ray.direction[2] * t];
}

export function computeTriangleNormal(tri: Triangle): Vector3 {
  const e1 = vec3Sub(tri.v1, tri.v0);
  const e2 = vec3Sub(tri.v2, tri.v0);
  return vec3Normalize(vec3Cross(e1, e2));
}

export function computeAABB(triangles: Triangle[], start: number, end: number): AABB {
  const min: Vector3 = [Infinity, Infinity, Infinity];
  const max: Vector3 = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < end; i++) {
    for (const v of [triangles[i].v0, triangles[i].v1, triangles[i].v2]) {
      if (v[0] < min[0]) min[0] = v[0];
      if (v[0] > max[0]) max[0] = v[0];
      if (v[1] < min[1]) min[1] = v[1];
      if (v[1] > max[1]) max[1] = v[1];
      if (v[2] < min[2]) min[2] = v[2];
      if (v[2] > max[2]) max[2] = v[2];
    }
  }
  return { min, max };
}

export function aabbSurfaceArea(box: AABB): number {
  const dx = box.max[0] - box.min[0];
  const dy = box.max[1] - box.min[1];
  const dz = box.max[2] - box.min[2];
  return 2 * (dx * dy + dy * dz + dz * dx);
}

export function aabbCentroid(box: AABB): Vector3 {
  return [(box.min[0] + box.max[0]) * 0.5, (box.min[1] + box.max[1]) * 0.5, (box.min[2] + box.max[2]) * 0.5];
}

// =============================================================================
// RAY INTERSECTION
// =============================================================================

/**
 * Ray–AABB intersection (slab method).
 * Returns t of intersection or -1 if miss.
 */
export function intersectRayAABB(ray: Ray, box: AABB): number {
  let tmin = ray.tMin,
    tmax = ray.tMax;

  for (let i = 0; i < 3; i++) {
    const invD = 1 / (ray.direction[i] || 1e-10);
    let t0 = (box.min[i] - ray.origin[i]) * invD;
    let t1 = (box.max[i] - ray.origin[i]) * invD;
    if (invD < 0) [t0, t1] = [t1, t0];
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmax < tmin) return -1;
  }
  return tmin;
}

/**
 * Ray–triangle intersection (Möller–Trumbore).
 * Returns t of intersection or -1 if miss / back-face.
 */
export function intersectRayTriangle(ray: Ray, tri: Triangle): number {
  const EPSILON = 1e-7;
  const e1 = vec3Sub(tri.v1, tri.v0);
  const e2 = vec3Sub(tri.v2, tri.v0);
  const h = vec3Cross(ray.direction, e2);
  const a = vec3Dot(e1, h);

  if (Math.abs(a) < EPSILON) return -1; // parallel

  const f = 1 / a;
  const s = vec3Sub(ray.origin, tri.v0);
  const u = f * vec3Dot(s, h);
  if (u < 0 || u > 1) return -1;

  const q = vec3Cross(s, e1);
  const v = f * vec3Dot(ray.direction, q);
  if (v < 0 || u + v > 1) return -1;

  const t = f * vec3Dot(e2, q);
  return t > ray.tMin && t < ray.tMax ? t : -1;
}

// =============================================================================
// BVH
// =============================================================================

export interface BVHNode {
  bound: AABB;
  leftChild: number; // index or -1 for leaf
  rightChild: number;
  triStart: number;
  triCount: number; // > 0 = leaf
}

export class BVH {
  nodes: BVHNode[] = [];
  tris: Triangle[] = [];

  /** Build from an array of triangles using SAH binned splits */
  build(triangles: Triangle[]): void {
    this.tris = [...triangles];
    this.nodes = [];
    if (this.tris.length === 0) return;
    this.buildRecursive(0, this.tris.length);
  }

  getNodeCount(): number {
    return this.nodes.length;
  }
  getLeafCount(): number {
    return this.nodes.filter((n) => n.triCount > 0).length;
  }

  private buildRecursive(start: number, end: number): number {
    const nodeIdx = this.nodes.length;
    const bound = computeAABB(this.tris, start, end);
    const count = end - start;

    if (count <= 2) {
      this.nodes.push({ bound, leftChild: -1, rightChild: -1, triStart: start, triCount: count });
      return nodeIdx;
    }

    // Choose split axis by longest extent
    const dx = bound.max[0] - bound.min[0];
    const dy = bound.max[1] - bound.min[1];
    const dz = bound.max[2] - bound.min[2];
    const axis = dx >= dy && dx >= dz ? 0 : dy >= dz ? 1 : 2;

    // SAH: try 8 bins, pick best
    const NUM_BINS = 8;
    let bestCost = Infinity,
      bestMid = Math.floor((start + end) / 2);
    const parentSA = aabbSurfaceArea(bound);

    for (let b = 1; b < NUM_BINS; b++) {
      const splitPos = bound.min[axis] + (bound.max[axis] - bound.min[axis]) * (b / NUM_BINS);
      let leftCount = 0,
        rightCount = 0;
      for (let i = start; i < end; i++) {
        const c = (this.tris[i].v0[axis] + this.tris[i].v1[axis] + this.tris[i].v2[axis]) / 3;
        c < splitPos ? leftCount++ : rightCount++;
      }
      if (leftCount === 0 || rightCount === 0) continue;

      // SAH cost: traversal cost 1 + leaf cost proportional to SA fraction
      const cost = 1 + (leftCount / parentSA + rightCount / parentSA) * 2;
      if (cost < bestCost) {
        bestCost = cost;
        bestMid = leftCount + start;
      }
    }

    // Partition around bestMid
    this.tris
      .slice(start, end)
      .sort((a, b) => {
        const ca = (a.v0[axis] + a.v1[axis] + a.v2[axis]) / 3;
        const cb = (b.v0[axis] + b.v1[axis] + b.v2[axis]) / 3;
        return ca - cb;
      })
      .forEach((t, i) => {
        this.tris[start + i] = t;
      });

    // Reserve placeholder
    this.nodes.push({ bound, leftChild: -1, rightChild: -1, triStart: 0, triCount: 0 });
    const left = this.buildRecursive(start, bestMid);
    const right = this.buildRecursive(bestMid, end);
    this.nodes[nodeIdx].leftChild = left;
    this.nodes[nodeIdx].rightChild = right;
    return nodeIdx;
  }

  /**
   * Traverse BVH to find nearest hit for a ray.
   */
  intersect(ray: Ray): HitRecord | null {
    if (this.nodes.length === 0) return null;
    let best: HitRecord | null = null;
    const stack = [0];

    while (stack.length > 0) {
      const ni = stack.pop()!;
      const node = this.nodes[ni];

      if (intersectRayAABB(ray, node.bound) < 0) continue;

      if (node.triCount > 0) {
        // Leaf
        for (let i = node.triStart; i < node.triStart + node.triCount; i++) {
          const t = intersectRayTriangle(ray, this.tris[i]);
          if (t > 0 && (!best || t < best.t)) {
            const point = vec3AtT(ray, t);
            const normal = this.tris[i].normal ?? computeTriangleNormal(this.tris[i]);
            best = { t, point, normal, triangleIndex: i };
          }
        }
      } else {
        if (node.leftChild >= 0) stack.push(node.leftChild);
        if (node.rightChild >= 0) stack.push(node.rightChild);
      }
    }
    return best;
  }
}

// =============================================================================
// PATH TRACER
// =============================================================================

export interface PathTracerScene {
  bvh: BVH;
  /** Ambient (sky) radiance (RGB) for misses */
  skyColor: [number, number, number];
  /** Light positions for shadow rays */
  lights: Array<{ position: Vector3; color: [number, number, number]; intensity: number }>;
}

function randomUnitHemisphere(normal: Vector3, seed: number): Vector3 {
  const phi = seed * 6.283185;
  const cosTheta = 1 - 2 * ((seed * 1.618033) % 1);
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const v: Vector3 = [sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), cosTheta];
  return vec3Dot(v, normal) < 0 ? [-v[0], -v[1], -v[2]] : v;
}

/**
 * Path-trace a single ray for up to maxBounces bounces.
 * Returns linear RGB radiance estimate.
 */
export function pathTrace(
  ray: Ray,
  scene: PathTracerScene,
  maxBounces: number,
  seed: number
): [number, number, number] {
  const throughput: [number, number, number] = [1, 1, 1];
  const radiance: [number, number, number] = [0, 0, 0];
  let currentRay = { ...ray };

  for (let bounce = 0; bounce <= maxBounces; bounce++) {
    const hit = scene.bvh.intersect(currentRay);

    if (!hit) {
      // Sky
      radiance[0] += scene.skyColor[0] * throughput[0];
      radiance[1] += scene.skyColor[1] * throughput[1];
      radiance[2] += scene.skyColor[2] * throughput[2];
      break;
    }

    // Direct lighting (shadow rays)
    for (const light of scene.lights) {
      const toLight = vec3Sub(light.position, hit.point);
      const dist = vec3Length(toLight);
      const lightDir = vec3Normalize(toLight);
      const NdotL = Math.max(0, vec3Dot(hit.normal, lightDir));
      if (NdotL <= 0) continue;

      const shadowRay: Ray = {
        origin: hit.point,
        direction: lightDir,
        tMin: 1e-3,
        tMax: dist - 1e-3,
      };
      const inShadow = scene.bvh.intersect(shadowRay) !== null;
      if (!inShadow) {
        const attenuation = light.intensity / (dist * dist + 1);
        radiance[0] += throughput[0] * light.color[0] * NdotL * attenuation;
        radiance[1] += throughput[1] * light.color[1] * NdotL * attenuation;
        radiance[2] += throughput[2] * light.color[2] * NdotL * attenuation;
      }
    }

    // Russian roulette termination
    if (bounce > 1) {
      const p = Math.max(throughput[0], throughput[1], throughput[2]);
      if ((seed * 129.37 + bounce * 17.13) % 1 > p) break;
      throughput[0] /= p;
      throughput[1] /= p;
      throughput[2] /= p;
    }

    // Diffuse bounce (Lambertian)
    const bounceDir = randomUnitHemisphere(hit.normal, (seed + bounce * 1.414) % 1);
    const NdotW = Math.max(0, vec3Dot(hit.normal, bounceDir));
    throughput[0] *= NdotW * 2;
    throughput[1] *= NdotW * 2;
    throughput[2] *= NdotW * 2;

    currentRay = { origin: hit.point, direction: bounceDir, tMin: 1e-3, tMax: Infinity };
  }

  return radiance;
}

// =============================================================================
// NLM DENOISER
// =============================================================================

export interface NLMConfig {
  /** Search window half-size in pixels */
  searchRadius: number;
  /** Patch half-size */
  patchRadius: number;
  /** Filter strength */
  h: number;
}

const DEFAULT_NLM: NLMConfig = { searchRadius: 5, patchRadius: 2, h: 0.1 };

/**
 * Non-Local Means bilateral denoising on a Float32Array RGBA buffer.
 * Reduces noise while preserving edges.
 */
export function nlmDenoise(
  noisy: Float32Array,
  width: number,
  height: number,
  config: Partial<NLMConfig> = {}
): Float32Array {
  const cfg = { ...DEFAULT_NLM, ...config };
  const output = new Float32Array(noisy.length);
  const { searchRadius: sr, patchRadius: pr, h } = cfg;
  const h2 = h * h;
  const patchArea = (2 * pr + 1) ** 2;

  const getPixel = (x: number, y: number, ch: number): number => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    return noisy[(cy * width + cx) * 4 + ch];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const out = [0, 0, 0, 0];
      let totalWeight = 0;

      for (let qy = y - sr; qy <= y + sr; qy++) {
        for (let qx = x - sr; qx <= x + sr; qx++) {
          // Compute patch distance (SSD)
          let dist = 0;
          for (let ky = -pr; ky <= pr; ky++) {
            for (let kx = -pr; kx <= pr; kx++) {
              for (let ch = 0; ch < 3; ch++) {
                const diff = getPixel(x + kx, y + ky, ch) - getPixel(qx + kx, qy + ky, ch);
                dist += diff * diff;
              }
            }
          }
          dist /= patchArea * 3;

          const weight = Math.exp(-dist / h2);
          for (let ch = 0; ch < 3; ch++) out[ch] += getPixel(qx, qy, ch) * weight;
          out[3] += getPixel(qx, qy, 3) * weight;
          totalWeight += weight;
        }
      }

      const pi = (y * width + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        output[pi + ch] = totalWeight > 0 ? out[ch] / totalWeight : noisy[pi + ch];
      }
    }
  }
  return output;
}

// =============================================================================
// RAY TRACER CLASS
// =============================================================================

export class RayTracer {
  private config: RayTracingConfig;
  private scene: PathTracerScene;

  constructor(config: Partial<RayTracingConfig> = {}) {
    this.config = { ...DEFAULT_RT_CONFIG, ...config };
    this.scene = {
      bvh: new BVH(),
      skyColor: [0.5, 0.7, 1.0],
      lights: [],
    };
  }

  getConfig(): Readonly<RayTracingConfig> {
    return { ...this.config };
  }
  setFeatures(features: RTFeature[]): void {
    this.config.features = features;
  }
  hasFeature(f: RTFeature): boolean {
    return this.config.features.includes(f);
  }

  loadScene(
    triangles: Triangle[],
    lights = this.scene.lights,
    sky: [number, number, number] = this.scene.skyColor
  ): void {
    this.scene = { bvh: new BVH(), skyColor: sky, lights };
    this.scene.bvh.build(triangles);
  }

  getBVH(): BVH {
    return this.scene.bvh;
  }

  /** Render a single pixel with multi-sample path tracing */
  renderPixel(
    rayOrigin: Vector3,
    rayDir: Vector3,
    pixelX: number,
    pixelY: number
  ): [number, number, number] {
    let r = 0,
      g = 0,
      b = 0;
    const { spp, max_bounces } = this.config;
    for (let s = 0; s < spp; s++) {
      const seed = ((pixelX * 1000 + pixelY * 37 + s * 7919) * 0.000001) % 1;
      const ray: Ray = {
        origin: rayOrigin,
        direction: vec3Normalize(rayDir),
        tMin: 1e-3,
        tMax: Infinity,
      };
      const [pr, pg, pb] = pathTrace(ray, this.scene, max_bounces, seed);
      r += pr;
      g += pg;
      b += pb;
    }
    return [r / spp, g / spp, b / spp];
  }
}
