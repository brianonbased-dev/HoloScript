# Cross-Vendor SNN Membrane-State Observation

> Task: `task_1778381112560_wh1h` — [inversion-critic] Cross-vendor SNN determinism validation  
> Date: 2026-05-10  
> Agent: claudecode-claude-x402
> Integrity correction: 2026-07-17

## Executive Summary

This file records the 2026-05-10 `LIFDeterminismProbe` observation on two adapters. The probe output is the final membrane-potential byte array; it does not contain spike masks.

| Vendor | Architecture             | Power Preference   | Hash (sha256)      |
| ------ | ------------------------ | ------------------ | ------------------ |
| NVIDIA | Ampere (RTX 3060 Laptop) | `high-performance` | `2c70fe2e...266b7` |
| Intel  | Gen-12LP (UHD Graphics)  | `low-power`        | `2e903cc2...cc21f` |

**Observed result:** The NVIDIA and Intel membrane-potential hashes were **not bit-identical**.

**Quantitative variance:**

- Max absolute difference: `1.5259e-5`
- Mean absolute difference: `5.4893e-6`
- Max relative difference: `0.0000%`

These values describe the recorded membrane arrays only. The original report attributed the difference to backend floating-point behavior, but this probe alone does not isolate that cause. It also cannot support any conclusion about spike-mask identity because no spike mask was read or hashed.

## Evidence Boundary for Paper #2

1. **No cross-vendor spike-decision result was measured.**
   A discrete threshold does not by itself guarantee parity when membrane values differ, especially for values near threshold. A separate probe must read and compare spike masks before making that claim.

2. **The current hash is a final-membrane-byte hash.**
   The observed cross-vendor hashes differ. Any epsilon criterion is a separately declared numerical-acceptance policy, not hash equality and not a spike-parity result.

3. **A green unit test is not necessarily GPU evidence.**
   The Vitest setup can use a deterministic fallback/mock backend. Seed- and tick-divergence assertions return early when `GPU_LIVE` is false. Same-backend GPU repeatability may be reported only with a receipt confirming a live adapter.

## Pending Vendors

The recorded observation has no rows for:

- **AMD** (e.g., RDNA3 discrete or integrated)
- **Apple Silicon** (M-series, requires macOS + Dawn or Safari WebGPU)

When hardware becomes available, re-run `scripts/cross-vendor-determinism-runner.mjs`, record adapter/driver identity and live-GPU status, and append rather than infer the missing rows.

## Runner Usage

```bash
cd packages/snn-webgpu
pnpm build
node scripts/cross-vendor-determinism-runner.mjs
```

The script bootstraps the `webgpu` (Dawn) npm package, requests `high-performance` and `low-power` adapters, runs the canonical LIF membrane probe, and prints hashes and numerical variance metrics. Power preference is not itself proof of distinct vendor selection; retain the adapter identity in each hardware receipt.

## Decision Log

- **Deterministic-float WGSL mode:** Deferred in the 2026-05-10 run. The recorded membrane difference was `~1.5e-5`; no claim about unmeasured spike masks follows from that magnitude.
- **Cross-vendor claim:** The current probe refutes cross-vendor membrane-byte identity for the two recorded adapters. Spike-decision identity remains untested, not verified.

## Files Modified

- `packages/snn-webgpu/src/paper/LIFDeterminismProbe.ts` — hashes final membrane-potential bytes.
- `packages/snn-webgpu/src/paper/lif_determinism_probe.hsplus` — declares the same evidence boundary.
- `packages/snn-webgpu/src/paper/__tests__/LIFDeterminismProbe.test.ts` — documents live-GPU versus fallback scope.
- `packages/snn-webgpu/scripts/cross-vendor-determinism-runner.mjs` — runner for future hardware rows.
- `packages/snn-webgpu/cross-vendor-determinism-results.md` — this corrected report.
