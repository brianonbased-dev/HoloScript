# WGSL Operator Gap Analysis — HoloMap

**Purpose:** Enumerate every WGSL operator HoloMap's WebGPU transformer pass
needs, mark which exist in the monorepo today, and prioritize the gaps for
Sprint 2. This is the blocker for moving from scaffold to implementation.

**Generated:** 2026-04-18
**Scope:** Operators required by HoloMapRuntime, PagedKVCache, TrajectoryMemory, AnchorContext.
**Method:** Surveyed `packages/snn-webgpu/src/shaders/*.wgsl`, `packages/engine/src/gpu/shaders/*.wgsl`, and `packages/engine/src/shader/*.wgsl`. Paths below were **cross-checked against the tree** (see Verified inventory).

## Legend

- **Status:** `have` (shader exists) · `adapt` (similar primitive exists, needs shape/dtype tweak) · `build` (no precedent, write from scratch).
- **Priority:** `P0` (blocks Sprint 2 transformer pass) · `P1` (blocks v1 reconstruction end-to-end) · `P2` (v2+ quality / perf).
- **Difficulty:** `S` (1-2 days) · `M` (3-5 days) · `L` (1-2 weeks).

## Inventory

| Op | Status | Priority | Difficulty | Reuse source | Notes |
|----|--------|----------|------------|--------------|-------|
| Multi-head scaled dot-product attention | build | P0 | L | none directly; leverage `blelloch-scan-sort.wgsl` for prefix sums in masked softmax | The core transformer primitive. Need (Q·Kᵀ)/√d → softmax → ·V. Must fuse for bandwidth. Consider flash-style tiled implementation from day one. |
| Paged KV append | build | P0 | M | `GPUBuffers.ts` for buffer mgmt | Append (K, V) at per-page offsets keyed by (layer, head). Mirror FlashInfer page layout. |
| Paged KV lookup by layer | build | P0 | M | — | Indirect gather into the page table to read full K/V sequence per layer. |
| KV page eviction | build | P1 | S | — | LRU eviction from device to host buffer. Host copy-back on re-read. |
| Layer normalization | have | P0 | S | `reconstruction/shaders/layerNorm.wgsl`, `reconstruction/layerNormKernel.ts` | Implemented as two-pass hidden-dim reduction (mean/variance) + scale/shift in WebGPU f32. |
| Stable softmax (max-subtraction) | build | P0 | S | — | Standard numerically-stable softmax over last dim. |
| GELU activation | build | P0 | S | — | Either exact (erf-based) or tanh approximation. Tanh approx fine for feed-forward. |
| Dense matmul (GEMM, f32) | build | P0 | L | `cg_kernels.wgsl` is sparse CSR — not reusable shape | Tiled GEMM for linear projections. Workgroup-shared-memory tiling; consider subgroup ops if supported. |
| Rotary positional encoding (RoPE) | build | P0 | S | — | Apply sin/cos rotation to Q and K in-place. |
| Image patch embed (conv stem 2D → tokens) | build | P0 | M | — | Strided conv collapsing HxW image into token grid. Needed to convert RGB frame → transformer tokens. |
| Token gather/scatter | adapt | P1 | S | `radix-sort.wgsl` touches similar indirect writes | Index-based read/write for anchor / keyframe selection. |
| Cosine similarity | build | P1 | S | — | For loop-closure matching against stored embeddings. Vectorized dot + norm. |
| Quaternion math (normalize, compose, rotate) | build | P1 | S | — | For camera poses. Trivial but keep in a shared WGSL include. |
| Fused 4x4 matrix · vector | build | P1 | S | — | Used in projection matrix application. Trivial. |
| Prefix sum (exclusive scan) | have | P2 | — | `blelloch-scan-sort.wgsl` | Available if needed for cumulative masking. |
| Radix sort | have | P2 | — | `radix-sort.wgsl` + `engine/gpu/GaussianSplatSorter.ts` | Reusable for `@holomap_splat_output` depth sort. |
| SPZ splat compression | have | P1 | — | `splat-compress.wgsl` + `GaussianSplatBakingPipeline.ts` | Reusable when emitting splat output. |
| Sparse CG solver | have | P2 | — | `cg_kernels.wgsl` + `SparseLinearSolver.ts` | Potential future fit for bundle-adjustment pose refinement. |
| WebGPU context + buffer mgmt | have | — | — | `WebGPUContext.ts`, `GPUBuffers.ts`, `ComputePipeline.ts` | Foundation layer — reuse as-is. |

## Verified WGSL / TS reuse paths (cross-check)

**Last verified:** 2026-04-17 against the HoloScript monorepo.

### `packages/snn-webgpu/src/shaders/` (7 files)

These are the **SNN / tropical** stack plus the Blelloch kernel. HoloMap’s transformer pass does not need the spike/LIF/tropical shaders today; they remain adjacent capability.

| File |
|------|
| `blelloch-scan-sort.wgsl` |
| `lif-neuron.wgsl` |
| `spike-decode.wgsl` |
| `spike-encode.wgsl` |
| `synaptic-weights.wgsl` |
| `tropical-activation.wgsl` |
| `tropical-graph.wgsl` |

### `packages/engine/src/gpu/shaders/` (12 files)

| File |
|------|
| `cg_kernels.wgsl` |
| `mls-mpm-g2p.wgsl` |
| `mls-mpm-grid.wgsl` |
| `mls-mpm-p2g.wgsl` |
| `particle-physics.wgsl` |
| `radix-sort.wgsl` |
| `spatial-grid.wgsl` |
| `splat-compress.wgsl` |
| `splat-render-sorted.wgsl` |
| `ssfr-depth.wgsl` |
| `ssfr-filter.wgsl` |
| `ssfr-shade.wgsl` |

### `packages/engine/src/shader/` (1 WGSL file)

| File | Note |
|------|------|
| `SplatRenderer.wgsl` | Render-path WGSL; not under `gpu/shaders/`. |

### TypeScript modules cited in the gap table

| Mentioned above | Actual path |
|-----------------|-------------|
| `WebGPUContext.ts` | `packages/engine/src/gpu/WebGPUContext.ts` |
| `GPUBuffers.ts` | `packages/engine/src/gpu/GPUBuffers.ts` |
| `ComputePipeline.ts` | `packages/engine/src/gpu/ComputePipeline.ts` |
| `GaussianSplatSorter.ts` | `packages/engine/src/gpu/GaussianSplatSorter.ts` |
| `GaussianSplatBakingPipeline.ts` | `packages/core/src/traits/GaussianSplatBakingPipeline.ts` |
| `SparseLinearSolver.ts` | `packages/engine/src/gpu/SparseLinearSolver.ts` |

**Path corrections captured here:** `radix-sort.wgsl`, `splat-compress.wgsl`, and `cg_kernels.wgsl` live under **`packages/engine/src/gpu/shaders/`**, not under `snn-webgpu`. Only `blelloch-scan-sort.wgsl` in the “prefix / sort” family sits under **`snn-webgpu`**. Extra engine shaders (`ssfr-*`, `mls-mpm-*`, `spatial-grid`, `particle-physics`, `splat-render-sorted`) are **not** required for the HoloMap P0 operator list but are available for reuse (fluids, SSFR, sorted splat draw).

## Summary

- **Gaps to fill in Sprint 2 (P0):** 8 operators. Largest items are fused attention (L) and tiled dense GEMM (L). Remaining six are S/M.
- **Existing primitives to lean on:** WebGPU context/buffer/pipeline abstractions, Blelloch scan, radix sort, splat compression pipeline.
- **Estimated Sprint 2 capacity for op work:** ~18-22 person-days. Fits a 2-week sprint with attention + GEMM + KV cache + layer norm + softmax + GELU + RoPE + patch embed.
- **Stretch for Sprint 2:** cosine similarity (P1) if time permits; otherwise push to Sprint 3 alongside loop-closure logic.

## Open questions blocking this list

- **Q1:** Subgroup / wave operations availability — `subgroupBallot`, `subgroupAdd` would speed up attention reductions. Check browser support matrix (Chrome 123+? Safari 26?). If uneven, fall back to workgroup-shared-memory reductions.
- **Q2:** Does `GaussianSplatSorter.ts` cleanly accept a dynamically-sized input buffer, or is it fixed-size at pipeline creation? HoloMap splat output will vary in size. May need a small adapter.
- **Q3:** Do we want `f16` support on the attention path for memory savings? Chrome 121+ ships `shader-f16`. f32 for v1, f16 as a Sprint 3 perf win.

## Action items

1. Re-run the file listing in this section when adding/removing `*.wgsl` under the scoped directories (or monthly during active HoloMap work).
2. Open a tracking issue (or task on the HoloMesh board) per P0 gap row.
3. Sprint 2 planning: assign each P0 op to an owner; target first transformer pass end-to-end by mid-sprint.
