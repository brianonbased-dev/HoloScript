# Paper-3 — Cross-vendor WebGPU determinism (hardware-gated queue)

**Board:** `task_1776738722632_b7j1` — audit correction to surface an explicit cross-adapter determinism path for Paper-3 CRDT / hash-stability claims. Physical cross-vendor GPU rows are **not** automated in CI today; this document is the **queue + matrix + triggers** until hardware captures land.

## What already ships (CI-safe)

- **Mock harness** — `packages/engine/src/testing/WebGPUDeterminismHarness.ts` with `WEBGPU_HARNESS_MOCK=1` exercises the **artifact + hash** spine without WGSL or a real adapter.
- **Smoke entrypoints** — `pnpm webgpu:determinism:mock`, `node scripts/run-webgpu-determinism.mjs`, and `scripts/webgpu-determinism-harness.html` (browser stub for manual checks).
- **Protocol prose** — `benchmarks/cross-compilation/WISDOM.md` § **P.3** (6-row vendor matrix, Property 4 probes, ε drift, merge rounds, trace storage path, thermal stop rule).

## Hardware-gated queue (owner + trigger)

| Field | Value |
|--------|--------|
| **Owner** | Release / benchmarking (repo) with **HW delegate** for physical machines (NVIDIA / AMD / Apple / Intel adapter rows as available). |
| **Trigger (human)** | Before any Paper-3 narrative freeze that cites **cross-adapter** WebGPU numbers; or on-demand when a tagged release candidate needs empirical rows. |
| **Trigger (automation stub)** | CI continues to run **mock only** (`WEBGPU_HARNESS_MOCK=1`); it does **not** satisfy cross-vendor empirical claims. |

## Required adapter matrix (template — fill when hardware is booked)

Aligned with WISDOM **P.3**: aim for **≥2 vendor-disjoint physical devices** plus **≥1 software-only control** (mock or CPU-only control path). Minimum rows to capture before “cross-vendor” language in paper body:

| Row | Role | Vendor / GPU | OS | Browser | Build fingerprint (driver + browser build) |
|-----|------|----------------|-----|---------|---------------------------------------------|
| A | Physical | _e.g. NVIDIA_ | _fill_ | Chromium / Chrome | _fill_ |
| B | Physical | _e.g. AMD or Apple Silicon_ | _fill_ | Chromium / Chrome or Safari (WebGPU) | _fill_ |
| C | Control | Mock harness | any | N/A (CLI) | `WEBGPU_HARNESS_MOCK=1` trace only |

For each **physical** row: run Property 4 / ContractedSimulation probes per **P.3**, `N ≥ 30` trials, log ε drift + CRDT merge metadata + hash stability; drop JSON under:

`packages/comparative-benchmarks/results/paper-3/<date>/`  
(gitignored batches until publication — create directory per capture session.)

## Open gap (explicit)

- **Real WGSL + GPU adapter path** in harness (non-mock) remains **TODO** in `WebGPUDeterminismHarness.ts`; cross-vendor **empirical** claims stay gated until rows exist.

## Related

- `benchmarks/cross-compilation/WISDOM.md` — **P.3**
- `packages/engine/src/testing/WebGPUDeterminismHarness.mock.test.ts`
