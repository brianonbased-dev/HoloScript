# WebGPU capture driver

Real-WebGPU bench-capture infrastructure for paper-program GPU claims. Replaces the ad-hoc CPU-substitute pattern (which conflates the in-Node JS hash chain with the GPU-accelerated kernel that the paper actually claims) with a Playwright + Chromium driver that runs the kernel in a real browser against a real WebGPU adapter.

## Why this exists

Across the paper program, every "GPU benchmark" cite was one of:

- a CPU-substitute Vitest test that the paper labels as projected GPU speedup;
- a frozen `.bench-logs/` JSON whose producing code went missing (F.062);
- a memory-bandwidth-derived projection that depended on hardware nobody had.

The 2026-05-28 program-wide drift audit surfaced this across Papers 2, 3, 4, 8, 13, TVCG, and both capstones. The fix is one piece of infrastructure — this directory — applied per paper.

## Files

- `setup-host.sh` — idempotent Linux installer (vulkan + chromium + playwright).
- `capture-bench.mjs` — config-driven benchmark capture. Reads a JSON config, loads a WGSL kernel, dispatches it in a real WebGPU browser session, emits a receipt-v2 JSON.
- `receipt-v2.schema.json` — unified bench-receipt schema. The `path` field (`webgpu-browser | cpu-substitute | cuda-native | wasm-simd`) is the camera-ready honesty knob — reviewers see immediately which execution path produced a row.
- `configs/` — paper-specific bench configs (one per kernel).

## Quick start

### Local (Windows / Mac with Chrome installed)

```bash
node scripts/webgpu-capture/capture-bench.mjs \
  scripts/webgpu-capture/configs/smoke.json
```

### vast.ai fleet host (Linux)

```bash
# One-time per host:
bash scripts/webgpu-capture/setup-host.sh

# Per capture:
HOLOSCRIPT_HW_TIER=H3 \
HOLOSCRIPT_HW_LABEL='A100 SXM4 40GB (vast.ai mesh-worker-01)' \
HOLOSCRIPT_HW_GPU='NVIDIA A100-SXM4-40GB' \
  node scripts/webgpu-capture/capture-bench.mjs \
    scripts/webgpu-capture/configs/trust-by-construction-cg-fold.json
```

The artifact lands under `.bench-logs/<ISO>/<paper>-<entry>.json`.

## Receipt schema

Every capture emits a v2 receipt with these load-bearing fields:

| Field | Purpose |
|---|---|
| `path` | `webgpu-browser` / `cpu-substitute` / `cuda-native` / `wasm-simd` |
| `kernel.wgsl_sha256` | SHA-256 of the shader source — reviewer can verify same bytes were dispatched |
| `protocol_commit` | Git HEAD at capture time — pins the harness version |
| `adapter_info` | `navigator.gpu.requestAdapterInfo()` result — pins the GPU vendor/arch |
| `browser` | userAgent + executablePath + launchArgs — pins the runtime |
| `ots_proof_path` / `anchor_chain` | Reserved for follow-up OTS + Base anchoring (F.071, Paper 22) |

## Adding a new paper

1. Identify the cited `.wgsl` file + `@compute` entry point in the paper.
2. Write a config in `configs/<paper-slug>-<entry>.json`:
   ```json
   {
     "paper": "trust-by-construction-paper",
     "section": "5.1",
     "kernel": {
       "wgsl_path": "packages/engine/src/gpu/shaders/cg_kernels.wgsl",
       "entry_point": "reduce_residual",
       "workgroup_size": [256, 1, 1],
       "dispatch_size": [16, 1, 1]
     },
     "buffers": [
       { "name": "input", "binding": 0, "size_bytes": 16384, "init": "iota-f32", "usage": ["storage", "copy_dst", "copy_src"] }
     ],
     "trials": 200,
     "warmup": 20
   }
   ```
3. Run `node scripts/webgpu-capture/capture-bench.mjs <config>` on each tier (H1 local + H3 fleet).
4. Update the paper's `\measuredFrom{}` cite to point at the emitted receipt.

## Status

Phase 1 (this driver + smoke) shipped 2026-05-29.

Application phase per program:

| Paper | Status |
|---|---|
| Paper 4 §7.8 (sandbox) | H1/H3 CPU-path captured; GPU-path acquisition pending via this driver |
| TVCG §5.1 (`cg_kernels.wgsl`, 14 entry points) | First target of Phase 2 |
| Paper 3 §CRDT (`WebGPUDeterminismHarness.ts`) | Cleanest application — module already exists |
| Paper 2 SNN (9 WGSL shaders) | Phase 2 batch 2 |
| Paper 13 DumbGlass (E2 → E1) | Phase 3 |
| Paper 8 JEPA | CUDA-native path, not WebGPU — different driver, deferred |
| Capstone-UIST + Capstone-P2 | Roll-up after Phase 2 lands |

Plan reference: ai-ecosystem session 2026-05-29 "plan ratchet improvements for GPU".
