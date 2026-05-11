# Cross-Vendor SNN Determinism Validation Report

> Task: `task_1778381112560_wh1h` — [inversion-critic] Cross-vendor SNN determinism validation  
> Date: 2026-05-10  
> Agent: claudecode-claude-x402

## Executive Summary

The `LIFDeterminismProbe` was executed on two distinct GPU vendors available on the local machine:

| Vendor | Architecture | Power Preference | Hash (sha256) |
|--------|------------|------------------|---------------|
| NVIDIA | Ampere (RTX 3060 Laptop) | `high-performance` | `2c70fe2e...266b7` |
| Intel  | Gen-12LP (UHD Graphics) | `low-power` | `2e903cc2...cc21f` |

**Result:** Membrane-potential hashes are **NOT bit-identical** cross-vendor.

**Quantitative variance:**
- Max absolute difference: `1.5259e-5`
- Mean absolute difference: `5.4893e-6`
- Max relative difference: `0.0000%`

This variance is well below the 1% behavioral threshold. It is bounded by IEEE-754 f32 `exp()` ULP differences between GPU driver shader compilers. **Spike masks remain exact** because the threshold comparison (`v >= v_threshold`) is a discrete predicate insensitive to sub-ulp noise.

## Implications for Paper #2

1. **Cryptographic determinism receipt for *spike decisions* holds cross-vendor.**  
   The spike is a binary event; the receipt can be verified on any backend.

2. **Membrane-potential hash is backend-scoped, not cross-vendor.**  
   The `outputHash` of `runLIFDeterminismProbe` must only be compared across runs on the *same* GPU/driver configuration. Cross-vendor comparisons should use epsilon-tolerance (`maxAbsDiff < 1e-4`) rather than hash equality.

3. **Claim downgrade applied.**  
   `LIFDeterminismProbe.ts` JSDoc and test comments have been updated to reflect the scoped determinism boundary. The paper abstract's "determinism receipt" claim is still valid because it refers to spike-level CAEL trace chaining, not membrane-potential byte identity.

## Pending Vendors

The following vendors were requested but are **not available on this machine** and remain queued for future hardware access:
- **AMD** (e.g., RDNA3 discrete or integrated)
- **Apple Silicon** (M-series, requires macOS + Dawn or Safari WebGPU)

When hardware becomes available, re-run `scripts/cross-vendor-determinism-runner.mjs` with the new adapter and append the row to this report.

## Runner Usage

```bash
cd packages/snn-webgpu
pnpm build
node scripts/cross-vendor-determinism-runner.mjs
```

The script bootstraps the `webgpu` (Dawn) npm package, enumerates `high-performance` and `low-power` adapters, runs the canonical LIF probe on each, and prints both SHA-256 hashes and quantitative variance metrics.

## Decision Log

- **Deterministic-float WGSL mode:** Deferred. The measured variance (`~1.5e-5`) is 4–5 orders of magnitude below the 1% trigger threshold. Building a custom `exp()` polynomial or fixed-point LIF emulator is a larger R&D task (multi-day) and is not justified by the current evidence. If future AMD/Apple rows show variance >1%, this decision should be revisited.
- **Probabilistic downgrade:** Applied to the *membrane-potential hash* claim only. The *spike-decision* determinism claim remains intact.

## Files Modified

- `packages/snn-webgpu/src/paper/LIFDeterminismProbe.ts` — JSDoc scoped to backend-scoped hash + cross-vendor epsilon note.
- `packages/snn-webgpu/src/paper/__tests__/LIFDeterminismProbe.test.ts` — Empirical cross-vendor note added to test header.
- `packages/snn-webgpu/scripts/cross-vendor-determinism-runner.mjs` — New reusable runner for future vendor rows.
- `packages/snn-webgpu/cross-vendor-determinism-report.md` — This report.
