/**
 * Gaussian Splatting Compiler — HoloScript → KHR_gaussian_splatting glTF
 *
 * Exports HoloScript compositions to glTF 2.0 with the KHR_gaussian_splatting
 * extension. Each object carrying a `@gaussian_splat` trait is encoded as a
 * mesh primitive with Gaussian attributes (POSITION, _ROTATION, _SCALE,
 * _OPACITY, COLOR_0) and the extension metadata.
 *
 * When no Gaussian data is present in the composition, a minimal 2×2×2 demo
 * grid is generated so the compiler is always testable.
 *
 * Output formats:
 *   - 'glb' (default): single binary GLB file
 *   - 'gltf': JSON document + separate binary buffer
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type { HoloComposition, HoloObjectDecl, HoloObjectTrait } from '../parser/HoloCompositionTypes';
import type { GLTFExportResult, GLTFExportStats } from './CompilerTypes';

// =============================================================================
// MULTI-USER SHARED-SORT DETECTION (P.043 — substrate side of the paper claim)
// =============================================================================
//
// When a composition has BOTH `@gaussian_splat` and `@multiplayer` traits on
// the same object, the WebGPU emit path should use a shared-sort kernel
// (single centroid-sorted index buffer + per-view visibility bitmask) instead
// of N independent per-view radix sorts. The CPU reference algorithm is in
// `packages/core/src/traits/MultiviewGaussianRendererTrait.ts::preprocess()`.
//
// This block is the compiler-side detection layer for that emit branch.
// G.GOLD.013: callers must test FALSE-case (single trait, neither trait) AND
// TRUE-case (both on same object, both on nested objects).
//
// Trait names in `HoloObjectTrait.name` are stored UNPREFIXED (the parser
// strips the `@`). The constants below match that convention.
const GAUSSIAN_SPLAT_TRAIT_NAME = 'gaussian_splat';
const MULTIPLAYER_TRAIT_NAME = 'multiplayer';

/**
 * Walk a HoloComposition's object tree and report whether any single object
 * (or any of its nested children) carries BOTH `@gaussian_splat` and
 * `@multiplayer` traits.
 *
 * Co-occurrence must be on the SAME object — a sibling pair where one object
 * has `@gaussian_splat` and another has `@multiplayer` does NOT trigger the
 * shared-sort emit (they would not share a sort buffer at runtime anyway).
 *
 * @param composition  Parsed HoloComposition
 * @returns `true` iff at least one object in the tree carries both traits.
 *
 * @see packages/engine/src/gpu/shaders/splat-shared-sort.wgsl (emit target)
 * @see packages/core/src/traits/MultiviewGaussianRendererTrait.ts (CPU ref)
 * @see docs/archive/P043_MULTIVIEW_FOVEATED_GS_PAPER.md §5
 */
export function detectMultiUserSharedSort(composition: HoloComposition): boolean {
  const objects = composition.objects ?? [];
  for (const obj of objects) {
    if (objectHasBothTraits(obj)) return true;
  }
  return false;
}

function objectHasBothTraits(obj: HoloObjectDecl): boolean {
  const traits = obj.traits ?? [];
  let hasSplat = false;
  let hasMultiplayer = false;
  for (const t of traits) {
    if (t.name === GAUSSIAN_SPLAT_TRAIT_NAME) hasSplat = true;
    else if (t.name === MULTIPLAYER_TRAIT_NAME) hasMultiplayer = true;
    if (hasSplat && hasMultiplayer) return true;
  }
  // Recurse into nested children if the parser surface exposes them. We treat
  // any 'children' / 'objects' field uniformly as HoloObjectDecl[]; missing
  // fields are no-ops. Cast-on-read here keeps the detector loose against
  // future parser shape changes without forcing a parser-type widening.
  const childrenLike =
    (obj as unknown as { children?: HoloObjectDecl[] }).children ??
    (obj as unknown as { objects?: HoloObjectDecl[] }).objects ??
    [];
  for (const child of childrenLike) {
    if (objectHasBothTraits(child)) return true;
  }
  return false;
}

// =============================================================================
// TYPES
// =============================================================================

export interface GaussianSplattingCompilerOptions {
  /** Output format: 'glb' (single binary) or 'gltf' (JSON + .bin) */
  format?: 'glb' | 'gltf';
  /** Color space for Gaussian colors */
  colorSpace?: 'srgb_rec709_display' | 'lin_rec709_display';
  /** Generator string for glTF metadata */
  generator?: string;
  /** Copyright string for glTF metadata */
  copyright?: string;
  /** Maximum spherical-harmonics degree (0-3) */
  shDegree?: number;
}

/**
 * Extended compile result that wraps the glTF export with WebGPU-side metadata
 * derived from compile-time trait analysis.
 *
 * The shared-sort emit path is gated on `multiUserSharedSort` — see
 * `detectMultiUserSharedSort()` for the detection rule and
 * `packages/engine/src/gpu/shaders/splat-shared-sort.wgsl` for the kernel.
 */
export interface GaussianSplattingExtendedResult {
  /** Standard glTF export (KHR_gaussian_splatting). Unchanged shape. */
  gltf: GLTFExportResult;
  /**
   * True iff at least one object in the composition carries both
   * `@gaussian_splat` and `@multiplayer`. When true, the WebGPU runtime
   * should bind the shared-sort kernel instead of per-view radix sort.
   */
  multiUserSharedSort: boolean;
  /**
   * Path (relative to repo root) to the WebGPU shader the runtime should
   * load when `multiUserSharedSort === true`. Undefined when false so callers
   * can branch on presence.
   */
  sharedSortShaderPath?: string;
}

/**
 * Repo-relative path to the shared-sort WGSL kernel. Surfaced so call sites
 * (and the test suite) can verify the compiler points at the right artifact
 * without hard-coding the string at each call site.
 */
export const SHARED_SORT_SHADER_PATH =
  'packages/engine/src/gpu/shaders/splat-shared-sort.wgsl';

interface GaussianData {
  positions: Float32Array;   // N × 3
  scales: Float32Array;      // N × 3
  rotations: Float32Array;   // N × 4 (quaternion)
  colors: Float32Array;      // N × 4 (RGBA)
  opacities: Float32Array;   // N
  shCoefficients?: Float32Array;
  count: number;
}

// =============================================================================
// COMPILER
// =============================================================================

export class GaussianSplattingCompiler extends CompilerBase {
  protected readonly compilerName = 'GaussianSplattingCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.GLTF;
  }

  private options: Required<GaussianSplattingCompilerOptions>;

  constructor(options: GaussianSplattingCompilerOptions = {}) {
    super();
    this.options = {
      format: options.format ?? 'glb',
      colorSpace: options.colorSpace ?? 'srgb_rec709_display',
      generator: options.generator ?? 'HoloScript GaussianSplattingCompiler v1.0.0',
      copyright: options.copyright ?? '',
      shDegree: options.shDegree ?? 0,
    };
  }

  compile(
    composition: HoloComposition,
    agentToken?: string,
    outputPath?: string
  ): GLTFExportResult {
    this.validateCompilerAccess(agentToken, outputPath);
    const data = this.extractGaussianData(composition);
    return this.buildGLTF(data);
  }

  /**
   * Extended compile that runs the standard glTF export AND reports
   * compile-time WebGPU emit flags derived from trait co-occurrence.
   *
   * The standard `compile()` API is left unchanged so existing call sites
   * (MCP `compile_to_3dgs`, ExportManager) keep their contract. Callers that
   * need the shared-sort flag opt in via this method.
   *
   * @see detectMultiUserSharedSort (the detection rule)
   * @see SHARED_SORT_SHADER_PATH (the kernel artifact path)
   */
  compileExtended(
    composition: HoloComposition,
    agentToken?: string,
    outputPath?: string
  ): GaussianSplattingExtendedResult {
    const gltf = this.compile(composition, agentToken, outputPath);
    const multiUserSharedSort = detectMultiUserSharedSort(composition);
    return {
      gltf,
      multiUserSharedSort,
      sharedSortShaderPath: multiUserSharedSort ? SHARED_SORT_SHADER_PATH : undefined,
    };
  }

  /**
   * Instance accessor for the multi-user shared-sort detector. Mirrors the
   * standalone `detectMultiUserSharedSort()` export — provided so callers
   * holding a compiler instance can run the check without a second import.
   */
  detectMultiUserSharedSort(composition: HoloComposition): boolean {
    return detectMultiUserSharedSort(composition);
  }

  // ─── Data extraction ────────────────────────────────────────────────────────

  private extractGaussianData(composition: HoloComposition): GaussianData {
    for (const obj of composition.objects ?? []) {
      const trait = obj.traits?.find((t: HoloObjectTrait) => t.name === 'gaussian_splat');
      if (trait && trait.config) {
        const p = trait.config;
        const positions = this.parseFloatArray(p.positions);
        const scales = this.parseFloatArray(p.scales);
        const rotations = this.parseFloatArray(p.rotations);
        let colors = this.parseFloatArray(p.colors);
        const opacities = this.parseFloatArray(p.opacities);
        if (positions && scales && rotations && colors && opacities) {
          const count = positions.length / 3;
          if (
            scales.length === count * 3 &&
            rotations.length === count * 4 &&
            (colors.length === count * 4 || colors.length === count * 3) &&
            opacities.length === count
          ) {
            // Normalize Nx3 colors to Nx4 RGBA
            if (colors.length === count * 3) {
              colors = this.expandRgbToRgba(colors, count);
            }
            return {
              positions,
              scales,
              rotations,
              colors,
              opacities,
              shCoefficients: this.parseFloatArray(p.shCoefficients),
              count,
            };
          }
        }
        // Raw point cloud (positions + colors only) — compute covariance-derived Gaussians
        if (positions && colors) {
          const count = positions.length / 3;
          if (colors.length === count * 3 || colors.length === count * 4) {
            return this.computeCovarianceFromPointCloud(positions, colors);
          }
        }
      }
    }
    // Fallback demo grid so the compiler is always testable
    return this.generateDemoGrid();
  }

  private expandRgbToRgba(rgb: Float32Array, count: number): Float32Array {
    const rgba = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      rgba[i * 4] = rgb[i * 3];
      rgba[i * 4 + 1] = rgb[i * 3 + 1];
      rgba[i * 4 + 2] = rgb[i * 3 + 2];
      rgba[i * 4 + 3] = 1.0;
    }
    return rgba;
  }

  private parseFloatArray(value: unknown): Float32Array | undefined {
    if (value instanceof Float32Array) return value;
    if (Array.isArray(value)) {
      const nums = value.map((v) => (typeof v === 'number' ? v : Number(v)));
      return new Float32Array(nums);
    }
    return undefined;
  }

  // ─── Covariance from point cloud (HoloMap raw output) ───────────────────────

  /**
   * Compute per-point Gaussian parameters from a raw point cloud.
   *
   * For each point we find k nearest neighbours, compute the 3x3 covariance
   * matrix of that neighbourhood, eigen-decompose it via Jacobi rotations,
   * and derive:
   *   - scales   = sqrt(eigenvalues)  (isotropic minimum clamp)
   *   - rotation = quaternion from eigenvector basis
   *   - opacity  = 1.0 (uniform)
   *   - colors   = passed through (RGB expanded to RGBA if needed)
   */
  private computeCovarianceFromPointCloud(
    positions: Float32Array,
    colors: Float32Array
  ): GaussianData {
    const n = Math.floor(positions.length / 3);
    const k = Math.min(12, Math.max(4, n - 1));

    const scales = new Float32Array(n * 3);
    const rotations = new Float32Array(n * 4);
    const opacities = new Float32Array(n);
    let rgbaColors: Float32Array;
    if (colors.length === n * 3) {
      rgbaColors = this.expandRgbToRgba(colors, n);
    } else {
      rgbaColors = colors;
    }

    // Build spatial grid for fast k-NN
    const grid = this.buildSpatialGrid(positions, n);

    for (let i = 0; i < n; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];

      const neighbours = this.findKNearestNeighbours(grid, positions, n, px, py, pz, k, i);

      // Compute covariance matrix of neighbour set
      let meanX = 0, meanY = 0, meanZ = 0;
      for (const idx of neighbours) {
        meanX += positions[idx * 3];
        meanY += positions[idx * 3 + 1];
        meanZ += positions[idx * 3 + 2];
      }
      const invM = 1.0 / neighbours.length;
      meanX *= invM;
      meanY *= invM;
      meanZ *= invM;

      let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
      for (const idx of neighbours) {
        const dx = positions[idx * 3] - meanX;
        const dy = positions[idx * 3 + 1] - meanY;
        const dz = positions[idx * 3 + 2] - meanZ;
        c00 += dx * dx;
        c01 += dx * dy;
        c02 += dx * dz;
        c11 += dy * dy;
        c12 += dy * dz;
        c22 += dz * dz;
      }
      const invLen = 1.0 / (neighbours.length - 1 || 1);
      c00 *= invLen; c01 *= invLen; c02 *= invLen;
      c11 *= invLen; c12 *= invLen; c22 *= invLen;

      // Eigen-decompose 3x3 symmetric covariance via Jacobi
      const ev = this.jacobiEigenvalues3([
        c00, c01, c02,
        c01, c11, c12,
        c02, c12, c22,
      ]);

      // Scales = sqrt(eigenvalues), clamped to isotropic minimum
      const minScale = 0.001;
      scales[i * 3] = Math.max(minScale, Math.sqrt(Math.abs(ev.values[0])));
      scales[i * 3 + 1] = Math.max(minScale, Math.sqrt(Math.abs(ev.values[1])));
      scales[i * 3 + 2] = Math.max(minScale, Math.sqrt(Math.abs(ev.values[2])));

      // Rotation = quaternion from eigenvector basis
      const q = this.rotationMatrixToQuaternion(ev.vectors);
      rotations[i * 4] = q[0];
      rotations[i * 4 + 1] = q[1];
      rotations[i * 4 + 2] = q[2];
      rotations[i * 4 + 3] = q[3];

      opacities[i] = 1.0;
    }

    return {
      positions,
      scales,
      rotations,
      colors: rgbaColors,
      opacities,
      count: n,
    };
  }

  /** Simple uniform-grid spatial hash for k-NN acceleration. */
  private buildSpatialGrid(
    positions: Float32Array,
    n: number
  ): Map<string, number[]> {
    // Compute bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
    // Aim for ~8 points per cell on average
    const cellsPerAxis = Math.max(1, Math.round(Math.pow(n / 8, 1 / 3)));
    const cellSize = extent / cellsPerAxis;

    const grid = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor((positions[i * 3] - minX) / cellSize);
      const cy = Math.floor((positions[i * 3 + 1] - minY) / cellSize);
      const cz = Math.floor((positions[i * 3 + 2] - minZ) / cellSize);
      const key = `${cx},${cy},${cz}`;
      const arr = grid.get(key);
      if (arr) {
        arr.push(i);
      } else {
        grid.set(key, [i]);
      }
    }
    return grid;
  }

  private findKNearestNeighbours(
    grid: Map<string, number[]>,
    positions: Float32Array,
    n: number,
    px: number,
    py: number,
    pz: number,
    k: number,
    selfIdx: number
  ): number[] {
    // Re-derive cell size and origin from grid heuristic (not stored)
    // We'll just brute-force with a small candidate set by scanning nearby cells.
    // Because grid keys are string tuples, we need to infer cell size.
    // Simplification: scan all points for n <= 2048, else use grid.
    if (n <= 2048) {
      const dists: { idx: number; d2: number }[] = [];
      for (let i = 0; i < n; i++) {
        const dx = positions[i * 3] - px;
        const dy = positions[i * 3 + 1] - py;
        const dz = positions[i * 3 + 2] - pz;
        dists.push({ idx: i, d2: dx * dx + dy * dy + dz * dz });
      }
      dists.sort((a, b) => a.d2 - b.d2);
      return dists.slice(0, k + 1).map((d) => d.idx);
    }

    // For larger clouds, infer cell size from first key's coordinate magnitude
    // Fallback: use a fixed-radius search around the point.
    // Heuristic radius: 3x the average nearest-neighbour distance estimate.
    const radius = this.estimateSearchRadius(positions, n);
    const radius2 = radius * radius;

    const candidates: { idx: number; d2: number }[] = [];
    for (let i = 0; i < n; i++) {
      const dx = positions[i * 3] - px;
      const dy = positions[i * 3 + 1] - py;
      const dz = positions[i * 3 + 2] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= radius2) {
        candidates.push({ idx: i, d2 });
      }
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    return candidates.slice(0, k + 1).map((c) => c.idx);
  }

  private estimateSearchRadius(positions: Float32Array, n: number): number {
    // Sample 256 points and average distance to nearest neighbour
    const sampleCount = Math.min(256, n);
    let totalDist = 0;
    let counted = 0;
    const step = Math.max(1, Math.floor(n / sampleCount));
    for (let i = 0; i < n; i += step) {
      let minD2 = Infinity;
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = positions[j * 3] - px;
        const dy = positions[j * 3 + 1] - py;
        const dz = positions[j * 3 + 2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < minD2) minD2 = d2;
      }
      if (minD2 < Infinity) {
        totalDist += Math.sqrt(minD2);
        counted++;
      }
    }
    const avg = counted > 0 ? totalDist / counted : 0.1;
    return avg * 3.0;
  }

  /** Jacobi eigenvalue decomposition for a 3x3 symmetric matrix.
   *  Returns eigenvalues (descending) and eigenvectors as column-major 3x3.
   */
  private jacobiEigenvalues3(a: number[]): { values: number[]; vectors: number[] } {
    // a is row-major symmetric 3x3: [a00,a01,a02,a10,a11,a12,a20,a21,a22]
    let m = [
      [a[0], a[1], a[2]],
      [a[3], a[4], a[5]],
      [a[6], a[7], a[8]],
    ];
    let v = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const eps = 1e-10;
    const maxSweeps = 50;

    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let offDiagSum = 0;
      for (let p = 0; p < 3; p++) {
        for (let q = p + 1; q < 3; q++) {
          offDiagSum += Math.abs(m[p][q]);
          if (Math.abs(m[p][q]) < eps) continue;

          const tau = (m[q][q] - m[p][p]) / (2 * m[p][q]);
          let t: number;
          if (tau >= 0) {
            t = 1 / (tau + Math.sqrt(1 + tau * tau));
          } else {
            t = 1 / (tau - Math.sqrt(1 + tau * tau));
          }
          const c = 1 / Math.sqrt(1 + t * t);
          const s = t * c;

          // Rotate m
          const mpp = m[p][p];
          const mqq = m[q][q];
          const mpq = m[p][q];
          m[p][p] = c * c * mpp - 2 * s * c * mpq + s * s * mqq;
          m[q][q] = s * s * mpp + 2 * s * c * mpq + c * c * mqq;
          m[p][q] = 0;
          m[q][p] = 0;
          for (let r = 0; r < 3; r++) {
            if (r !== p && r !== q) {
              const mr_p = m[r][p];
              const mr_q = m[r][q];
              m[r][p] = c * mr_p - s * mr_q;
              m[p][r] = m[r][p];
              m[r][q] = s * mr_p + c * mr_q;
              m[q][r] = m[r][q];
            }
          }

          // Rotate v
          for (let r = 0; r < 3; r++) {
            const vr_p = v[r][p];
            const vr_q = v[r][q];
            v[r][p] = c * vr_p - s * vr_q;
            v[r][q] = s * vr_p + c * vr_q;
          }
        }
      }
      if (offDiagSum < eps) break;
    }

    // Extract eigenvalues and sort descending
    const vals = [m[0][0], m[1][1], m[2][2]];
    const cols = [
      [v[0][0], v[1][0], v[2][0]],
      [v[0][1], v[1][1], v[2][1]],
      [v[0][2], v[1][2], v[2][2]],
    ];
    const order = [0, 1, 2].sort((i, j) => vals[j] - vals[i]);
    return {
      values: [vals[order[0]], vals[order[1]], vals[order[2]]],
      vectors: [
        cols[order[0]][0], cols[order[1]][0], cols[order[2]][0],
        cols[order[0]][1], cols[order[1]][1], cols[order[2]][1],
        cols[order[0]][2], cols[order[1]][2], cols[order[2]][2],
      ],
    };
  }

  private rotationMatrixToQuaternion(m: number[]): [number, number, number, number] {
    // m is column-major 3x3: [c0x,c1x,c2x, c0y,c1y,c2y, c0z,c1z,c2z]
    const trace = m[0] + m[4] + m[8];
    let qw: number, qx: number, qy: number, qz: number;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      qw = 0.25 / s;
      qx = (m[5] - m[7]) * s;
      qy = (m[6] - m[2]) * s;
      qz = (m[1] - m[3]) * s;
    } else if (m[0] > m[4] && m[0] > m[8]) {
      const s = 2.0 * Math.sqrt(1.0 + m[0] - m[4] - m[8]);
      qw = (m[5] - m[7]) / s;
      qx = 0.25 * s;
      qy = (m[3] + m[1]) / s;
      qz = (m[6] + m[2]) / s;
    } else if (m[4] > m[8]) {
      const s = 2.0 * Math.sqrt(1.0 + m[4] - m[0] - m[8]);
      qw = (m[6] - m[2]) / s;
      qx = (m[3] + m[1]) / s;
      qy = 0.25 * s;
      qz = (m[7] + m[5]) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m[8] - m[0] - m[4]);
      qw = (m[1] - m[3]) / s;
      qx = (m[6] + m[2]) / s;
      qy = (m[7] + m[5]) / s;
      qz = 0.25 * s;
    }
    const norm = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
    return [qx / norm, qy / norm, qz / norm, qw / norm];
  }

  private generateDemoGrid(): GaussianData {
    const count = 8;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const colors = new Float32Array(count * 4);
    const opacities = new Float32Array(count);
    let i = 0;
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          positions[i * 3] = x * 0.5;
          positions[i * 3 + 1] = y * 0.5;
          positions[i * 3 + 2] = z * 0.5;
          scales[i * 3] = 0.1;
          scales[i * 3 + 1] = 0.1;
          scales[i * 3 + 2] = 0.1;
          rotations[i * 4] = 0;
          rotations[i * 4 + 1] = 0;
          rotations[i * 4 + 2] = 0;
          rotations[i * 4 + 3] = 1;
          colors[i * 4] = 0.8;
          colors[i * 4 + 1] = 0.3;
          colors[i * 4 + 2] = 0.3;
          colors[i * 4 + 3] = 1;
          opacities[i] = 1;
          i++;
        }
      }
    }
    return { positions, scales, rotations, colors, opacities, count };
  }

  // ─── glTF builder ─────────────────────────────────────────────────────────

  private buildGLTF(data: GaussianData): GLTFExportResult {
    const N = data.count;
    const bufferData = this.buildBuffer(data);
    const bufferViews = this.buildBufferViews(N);
    const accessors = this.buildAccessors(N);

    const primitive: Record<string, unknown> = {
      attributes: {
        POSITION: 0,
        _ROTATION: 1,
        _SCALE: 2,
        _OPACITY: 3,
        COLOR_0: 4,
      },
      mode: 0, // POINTS
      extensions: {
        KHR_gaussian_splatting: {
          colorSpace: this.options.colorSpace,
        },
      },
    };

    const mesh = {
      name: 'GaussianSplatMesh',
      primitives: [primitive],
    };

    const node = {
      name: 'GaussianSplatNode',
      mesh: 0,
    };

    const gltf: Record<string, unknown> = {
      asset: {
        version: '2.0',
        generator: this.options.generator,
        ...(this.options.copyright ? { copyright: this.options.copyright } : {}),
      },
      scene: 0,
      scenes: [{ name: 'Scene', nodes: [0] }],
      nodes: [node],
      meshes: [mesh],
      accessors,
      bufferViews,
      buffers: [{ byteLength: bufferData.byteLength }],
      extensionsUsed: ['KHR_gaussian_splatting'],
    };

    const stats: GLTFExportStats = {
      nodeCount: 1,
      meshCount: 1,
      materialCount: 0,
      textureCount: 0,
      animationCount: 0,
      totalVertices: N,
      totalTriangles: 0,
      fileSizeBytes: 0,
    };

    if (this.options.format === 'glb') {
      const binary = this.createGLB(gltf, bufferData);
      stats.fileSizeBytes = binary.byteLength;
      return { binary, stats };
    }

    stats.fileSizeBytes = JSON.stringify(gltf).length + bufferData.byteLength;
    return { json: gltf, buffer: bufferData, stats };
  }

  // ─── Binary layout ──────────────────────────────────────────────────────────

  private buildBuffer(data: GaussianData): Uint8Array {
    const N = data.count;
    // Scales stored in log-space per KHR spec
    const logScales = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) {
      logScales[i] = Math.log(Math.max(data.scales[i]!, 1e-8));
    }
    const size = N * 3 * 4 + N * 4 * 4 + N * 3 * 4 + N * 4 + N * 4 * 4;
    const buf = new Uint8Array(size);
    let off = 0;
    const write = (arr: Float32Array) => {
      const view = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      buf.set(view, off);
      off += arr.byteLength;
    };
    write(data.positions);
    write(data.rotations);
    write(logScales);
    write(data.opacities);
    write(data.colors);
    return buf;
  }

  private buildBufferViews(N: number): Array<{ buffer: number; byteOffset: number; byteLength: number }> {
    let off = 0;
    const views: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
    const add = (len: number) => {
      views.push({ buffer: 0, byteOffset: off, byteLength: len });
      off += len;
      return views.length - 1;
    };
    add(N * 3 * 4); // POSITION
    add(N * 4 * 4); // _ROTATION
    add(N * 3 * 4); // _SCALE
    add(N * 4);     // _OPACITY
    add(N * 4 * 4); // COLOR_0
    return views;
  }

  private buildAccessors(N: number): Array<{ bufferView: number; componentType: number; count: number; type: string }> {
    let bv = 0;
    const accs: Array<{ bufferView: number; componentType: number; count: number; type: string }> = [];
    const add = (type: string, compType: number, count: number) => {
      accs.push({ bufferView: bv++, componentType: compType, count, type });
    };
    add('VEC3', 5126, N);  // POSITION
    add('VEC4', 5126, N);  // _ROTATION
    add('VEC3', 5126, N);  // _SCALE
    add('SCALAR', 5126, N); // _OPACITY
    add('VEC4', 5126, N);  // COLOR_0
    return accs;
  }

  // ─── GLB assembler (mirrors GLTFPipeline) ─────────────────────────────────

  private createGLB(gltf: object, buffer: Uint8Array): Uint8Array {
    const jsonString = JSON.stringify(gltf);
    const jsonBuffer = new TextEncoder().encode(jsonString);
    const jsonPadding = (4 - (jsonBuffer.byteLength % 4)) % 4;
    const paddedJsonLength = jsonBuffer.byteLength + jsonPadding;
    const binPadding = (4 - (buffer.byteLength % 4)) % 4;
    const paddedBinLength = buffer.byteLength + binPadding;
    const totalSize = 12 + 8 + paddedJsonLength + 8 + paddedBinLength;

    const output = new ArrayBuffer(totalSize);
    const view = new DataView(output);
    const bytes = new Uint8Array(output);
    let offset = 0;

    // Header
    view.setUint32(offset, 0x46546c67, true);
    offset += 4;
    view.setUint32(offset, 2, true);
    offset += 4;
    view.setUint32(offset, totalSize, true);
    offset += 4;

    // JSON chunk
    view.setUint32(offset, paddedJsonLength, true);
    offset += 4;
    view.setUint32(offset, 0x4e4f534a, true);
    offset += 4;
    bytes.set(jsonBuffer, offset);
    offset += jsonBuffer.byteLength;
    for (let i = 0; i < jsonPadding; i++) bytes[offset++] = 0x20;

    // BIN chunk
    view.setUint32(offset, paddedBinLength, true);
    offset += 4;
    view.setUint32(offset, 0x004e4942, true);
    offset += 4;
    bytes.set(buffer, offset);
    offset += buffer.byteLength;
    for (let i = 0; i < binPadding; i++) bytes[offset++] = 0x00;

    return new Uint8Array(output);
  }
}

export function createGaussianSplattingCompiler(
  options?: GaussianSplattingCompilerOptions
): GaussianSplattingCompiler {
  return new GaussianSplattingCompiler(options);
}
