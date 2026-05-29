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

### vast.ai fleet host (Linux) — IMAGE MATTERS

**CRITICAL**: vast.ai's default `nvidia/cuda:*-runtime-ubuntu*` images ship CUDA only — they do NOT include the NVIDIA Vulkan ICD. Chromium will still acquire a WebGPU adapter, but via llvmpipe software rasterization (CPU). Verify with `vulkaninfo`:

| `vulkaninfo` shows | adapter is | acceptable for real-GPU capture? |
|---|---|---|
| `deviceName = llvmpipe (LLVM ...)` | CPU software | NO — receipt should mark path as `cpu-substitute` or relabel |
| `deviceName = NVIDIA GeForce/Tesla/A100/...` + `deviceType = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU` | real NVIDIA GPU | YES |

**Verified working recipe**:

```bash
# 1. Create instance with the cudagl variant (NVIDIA's official image with
#    OpenGL + Vulkan ICD preinstalled):
#       image: nvidia/cudagl:11.4.2-runtime-ubuntu20.04
#    Other cudagl tags (12.x) also work. Avoid plain nvidia/cuda images.
# 2. SSH in, then:
apt-get install -y vulkan-tools libnspr4 libnss3 libxss1 libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libcups2 libgtk-3-0 libgbm1 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxrandr2 libpangocairo-1.0-0 fonts-liberation
vulkaninfo 2>&1 | grep -E "deviceName|deviceType" | head -4   # must show NVIDIA, not llvmpipe
# 3. Install Node + Playwright + capture-bench:
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
cd /path/to/this/dir
npm install playwright
npx playwright install chromium
# 4. Run:
HOLOSCRIPT_HW_TIER=H3 \
HOLOSCRIPT_HW_LABEL='A100 SXM4 40GB (vast.ai cudagl host)' \
HOLOSCRIPT_HW_GPU='NVIDIA A100-SXM4-40GB' \
  node capture-bench.mjs configs/smoke.json
```

Evidence — first real-GPU capture on vast.ai via this recipe:
`.bench-logs-evidence/smoke-h3-vast-cudagl-gtx-1070-ti.json` (NVIDIA GeForce GTX 1070 Ti, driver 580.126.09, cudagl 11.4.2 image, 2026-05-29T01:xxZ).

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
