/**
 * Shared-Sort Gaussian Splat Preprocess (Multi-User VR)
 *
 * P.043 / SS-MFGS substrate kernel. When a HoloScript composition has BOTH
 * `@gaussian_splat` and `@multiplayer` on the same object, this kernel
 * replaces the N independent per-view radix sorts (one per user) with:
 *
 *   1. A single SHARED back-to-front sort, keyed on distance from the
 *      centroid of all view eye positions.
 *   2. A per-Gaussian uint32 VISIBILITY BITMASK — bit v is set iff Gaussian g
 *      is in the half-FOV cone of viewOrder[v]. Per-view rasterizers consume
 *      the shared sorted index buffer + the bitmask to skip Gaussians they
 *      do not see (atomic scatter is the runtime's responsibility, NOT this
 *      kernel — keeping the bitmask write per-Gaussian non-atomic keeps the
 *      hot path branch-free).
 *
 * CPU reference algorithm (single source of truth — port THIS):
 *   `packages/core/src/traits/MultiviewGaussianRendererTrait.ts::preprocess()`
 *
 * Compiler emit gate (only emits this kernel when both traits co-occur):
 *   `packages/core/src/compiler/GaussianSplattingCompiler.ts::detectMultiUserSharedSort()`
 *
 * Composition rules with existing shader stack:
 *   - INPUT  ← output of `splat-compress.wgsl` (compressed SplatCompressed[])
 *   - OUTPUT → consumed by `splat-render-sorted.wgsl` via sortedIndices binding.
 *              The per-view rasterizer reads `visibilityBitmasks[gIdx]` and
 *              skips bits not set for its own viewIndex (bit testing
 *              constant-time on a uint32; up to 32 views per ceiling below).
 *
 * Cross-browser compatible:
 *   - No subgroup operations
 *   - No f16 shader feature required (handled upstream in splat-compress)
 *   - Standard storage-buffer / workgroup-shared / atomic ops
 *
 * WASM / no-WebGPU fallback (G.GOLD.006 — WebGPU features must provide a fallback):
 *   - The CPU port of THIS exact algorithm already ships at
 *     `packages/core/src/traits/MultiviewGaussianRendererTrait.ts::preprocess()`.
 *   - That implementation is platform-neutral (pure JS / TypedArrays) and is
 *     the path runtimes without WebGPU (Safari < 18, Node, WASM-only
 *     embedded) bind. The host runtime chooses GPU vs CPU at adapter-probe
 *     time; the compiler emit branch (`detectMultiUserSharedSort`) is GPU-
 *     -agnostic — it reports the flag and points at this shader as the
 *     preferred kernel; the runtime picks the executor.
 *
 * STATUS: SCAFFOLD — algorithm bodies are stubs marked with `// TODO(P.043):`.
 * Shader stage / bind-group / workgroup-size declarations are FINAL — the
 * runtime can bind this module and dispatch it; correctness pending the
 * kernel-body port from MultiviewGaussianRendererTrait.preprocess(). See
 * sub-scope (d) in `research/2026-05-12_webgpu-shared-sort-emit-branch.md`.
 *
 * @version 0.1.0-scaffold
 * @see docs/archive/P043_MULTIVIEW_FOVEATED_GS_PAPER.md §5
 */

// =============================================================================
// Constants (mirror MultiviewGaussianRendererTrait.ts)
// =============================================================================

/** Cosine of the half-FOV used for the cone-test visibility approximation.
 *  cos(60deg) = 0.5 — generous on purpose. Per-view rasterizers drop invisible
 *  splats cheaply; bitmask false-positives are fine, false-negatives are
 *  popping artifacts. CPU ref: DEFAULT_HALF_FOV_COS. */
const DEFAULT_HALF_FOV_COS: f32 = 0.5;

/** Maximum number of views encodable in the uint32 visibility bitmask. P.043's
 *  practical ceiling is N=8-12; 32 leaves headroom without going to uint64.
 *  CPU ref: MAX_BITMASK_VIEWS. */
const MAX_BITMASK_VIEWS: u32 = 32u;

/** Workgroup size for the per-Gaussian preprocess kernel. 64 is the cross-
 *  vendor sweet spot (Adreno 740 / Mali-G715 / NV Ada / Intel Xe) — wider
 *  workgroups can stall on the per-Gaussian cone-test loop over numViews. */
const WORKGROUP_SIZE: u32 = 64u;

// =============================================================================
// Structures
// =============================================================================

/** Mirrors SplatCompressed from splat-render-sorted.wgsl — compressed-form
 *  Gaussian as emitted by splat-compress.wgsl. Only `pos` is consumed by the
 *  centroid sort; the rest passes through to the rasterizer. */
struct SplatCompressed {
  pos: vec3<f32>,
  packedColor: u32,
  packedCov2D_01: u32,
  packedCov2D_2_opacity: u32,
  depth: f32,
  _pad: u32,
};

/** Per-view configuration. Mirrors ViewConfig in MultiviewGaussianRendererTrait.ts.
 *  `_pad0` / `_pad1` keep the struct 16-byte aligned for std430. */
struct ViewConfig {
  eyePosition: vec3<f32>,
  _pad0: f32,
  eyeDirection: vec3<f32>,
  _pad1: f32,
};

/** Shared-preprocess uniform block. */
struct SharedSortUniforms {
  /** Number of Gaussians in the input set. */
  gaussianCount: u32,
  /** Number of views (== users). Bounded by MAX_BITMASK_VIEWS. */
  numViews: u32,
  /** Centroid of all view eye positions, precomputed CPU-side per frame. */
  centroid: vec3<f32>,
  /** Pad to 16-byte alignment. */
  _pad: f32,
};

// =============================================================================
// Bindings
// =============================================================================

@group(0) @binding(0) var<uniform> uniforms: SharedSortUniforms;
@group(0) @binding(1) var<storage, read> splats: array<SplatCompressed>;
@group(0) @binding(2) var<storage, read> views: array<ViewConfig>;

/** Output: per-Gaussian distance-from-centroid (squared, monotonic). Consumed
 *  by `radix-sort.wgsl` as the sort key. */
@group(0) @binding(3) var<storage, read_write> distances: array<f32>;

/** Output: per-Gaussian visibility bitmask. Bit v set iff Gaussian g is in
 *  the half-FOV cone of views[v]. Per-view rasterizer indexes by gIdx. */
@group(0) @binding(4) var<storage, read_write> visibilityBitmasks: array<u32>;

// =============================================================================
// Helpers
// =============================================================================

/** Squared distance — matches CPU ref (avoids sqrt, monotonic for sorting). */
fn distSquared(a: vec3<f32>, b: vec3<f32>) -> f32 {
  let d = a - b;
  return dot(d, d);
}

/** Robust normalize — returns zero vector if input is degenerate. */
fn safeNormalize(v: vec3<f32>) -> vec3<f32> {
  let len2 = dot(v, v);
  if (len2 < 1e-12) {
    return vec3<f32>(0.0);
  }
  return v * inverseSqrt(len2);
}

// =============================================================================
// Kernel: per-Gaussian preprocess
// =============================================================================

/**
 * One workgroup invocation per Gaussian. Computes:
 *   - distances[g] = ||splats[g].pos - centroid||²   (sort key for radix-sort)
 *   - visibilityBitmasks[g] = cone-test against each view's eye/direction
 *
 * Output buffers are then consumed by:
 *   - `radix-sort.wgsl` to produce sortedIndices (the shared back-to-front order)
 *   - `splat-render-sorted.wgsl` (per-view) which gates rasterization on
 *     `(visibilityBitmasks[gIdx] & (1u << viewIndex)) != 0u`.
 *
 * TODO(P.043): port the full per-view cone test from
 *   MultiviewGaussianRendererTrait.preprocess() lines 201-231. The shape below
 *   is correct and runs; the inner conditional currently always sets the bit
 *   so the rasterizer falls back to "every view sees everything" until the
 *   real test is wired (matches the CPU iota-fallback contract — safe default).
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn cs_preprocess(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = gid.x;
  if (g >= uniforms.gaussianCount) {
    return;
  }

  let pos = splats[g].pos;

  // Sort key: squared distance to shared centroid (monotonic, sqrt-free).
  // FINAL — this is the load-bearing sort key for the back-to-front order.
  distances[g] = distSquared(pos, uniforms.centroid);

  // Per-view cone test → uint32 bitmask. Direct port of CPU ref
  // MultiviewGaussianRendererTrait.preprocess() lines 201-231. The JS parity
  // twin at splat-shared-sort.parity.ts is the test-time reference — both
  // implementations must compute identical bitmasks on the same fixture.
  //
  // Bit v of mask is set iff Gaussian g is inside the half-FOV cone of view v
  // OR Gaussian g is degenerately colocated with view v's eye position
  // (where the cone-test cosine is undefined; CPU ref line 213-216 sets the
  // bit unconditionally in that case to avoid popping).
  var mask: u32 = 0u;
  let nv = min(uniforms.numViews, MAX_BITMASK_VIEWS);
  for (var v: u32 = 0u; v < nv; v = v + 1u) {
    let view = views[v];
    let toG = pos - view.eyePosition;
    let toGLen2 = dot(toG, toG);
    if (toGLen2 < 1e-12) {
      // Degenerate: Gaussian colocated with eye. Match CPU ref lines 213-216.
      mask = mask | (1u << v);
      continue;
    }
    let nToG = toG * inverseSqrt(toGLen2);
    let nDir = safeNormalize(view.eyeDirection);
    if (dot(nToG, nDir) >= DEFAULT_HALF_FOV_COS) {
      mask = mask | (1u << v);
    }
  }
  visibilityBitmasks[g] = mask;
}
