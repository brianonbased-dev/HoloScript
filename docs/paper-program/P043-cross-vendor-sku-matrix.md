# P043 Cross-Vendor SKU Matrix

Purpose: replace the projected scaling table in P043 with measured SS-MFGS frame-time data across mobile XR and desktop WebGPU hardware.

This is a scaffold and protocol, not a result claim. The harness defines the cells, the required artifact schema, and the one-command capture hook. Actual 60 second runs must be captured on the listed devices before any paper table is promoted out of projected status.

## Matrix

| SKU | GPU class | N values | Required capture notes |
| --- | --- | --- | --- |
| Quest 3 / Adreno 740 | mobile XR | 2, 3, 4 | Record browser/WebXR shell, OS version, battery state, and thermal state after each 60 s sample. |
| RTX 4090 | desktop discrete | 2, 4, 8 | Primary high-end desktop cell. |
| RTX 3090 | desktop discrete | 2, 4, 8 | Ampere comparison point. |
| Apple M3 GPU | desktop integrated | 2, 4, 8 | Capture macOS and browser version because WebGPU path is Metal-backed. |
| Intel Arc | desktop discrete | 2, 4, 8 | Non-NVIDIA discrete WebGPU sanity cell. |

Scenes are fixed at three stress profiles:

| Scene | Gaussian count | Why it exists |
| --- | ---: | --- |
| `indoor-500k` | 500,000 | Medium occlusion, near-field geometry, laptop-webcam foveation demo scale. |
| `outdoor-1m` | 1,000,000 | Wide field of view and long depth range for centroid sort quality. |
| `dense-2m` | 2,000,000 | Alpha overdraw and visibility-mask stress case. |

Total required cells: 5 SKUs x 3 scenes x 3 N values = 45 artifacts.

## Commands

Generate the plan:

```bash
pnpm bench:p043:sku-matrix -- --write-plan .bench-logs/p043-sku-matrix-plan.json
```

List capture commands for one SKU:

```bash
pnpm bench:p043:sku-matrix -- --list-cells --sku rtx4090
```

Check which artifacts are captured, pending, or invalid:

```bash
pnpm bench:p043:sku-matrix -- --check-results
```

Run a single cell after the GPU capture runner is wired:

```bash
P043_BENCH_COMMAND="pnpm --filter @holoscript/engine run benchmark:p043:shared-sort" \
  pnpm bench:p043:sku-matrix -- --run-cell rtx4090__indoor-500k__n2 \
  --out .bench-logs/p043-sku-matrix/rtx4090/indoor-500k/n2.json
```

Until `P043_BENCH_COMMAND` is provided, `--run-cell` prints the required cell contract and exits 2. That is intentional: this task scaffolds the matrix and prevents placeholder numbers from masquerading as benchmark data.

## Artifact Contract

Each captured artifact must include:

| Field | Requirement |
| --- | --- |
| `adapterInfo` | WebGPU adapter/vendor/device details; must match the SKU token. |
| `browserVersion` | Browser or WebXR shell version. |
| `osVersion` | Host OS/headset version. |
| `frameTimeMs.samples` | Raw frame-time sample array covering 60 s after warmup. |
| `frameTimeMs.p50/p95/p99` | Whole-frame percentiles. |
| `perUserFrameTimeMs.p95` | P043 headline metric denominator. |
| `sharedSortMs.p95` | Shared-sort kernel cost. |
| `visibilityMaskMs.p95` | Per-view visibility bitmask cost. |
| `droppedFrameCount` | Count during the 60 s measurement window. |
| `thermalState` | Device thermal state or `unknown` when the platform cannot report it. |

Capture protocol:

1. Warm up for 5 s.
2. Sample frame times for 60 s.
3. Run every scene x N value cell three times on the same SKU.
4. Store raw samples and percentiles in the artifact; do not hand-edit paper medians.
5. Promote a paper number only by pointing to the JSON artifact path and commit.

