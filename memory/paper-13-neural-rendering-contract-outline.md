# Neural rendering under contract (NeRF / Gaussian splatting) (paper-13) — design outline

**Scope:** Bind neural scene representations (NeRF-style fields, Gaussian splats) to HoloScript simulation and asset contracts so views and edits remain auditable and versioned.

## Goals

- **Contract linkage** — Each renderable neural asset references contract metadata: provenance, tolerance bands for view synthesis, and upgrade path (e.g., hash mode consistent with Option C platform policy).
- **Safety** — No silent substitution of geometry: neural outputs are either explicitly labeled as approximate or gated by plausibility checks where the platform already defines them.

## Technical threads

1. **Representation** — NeRF / 3DGS parameters as first-class assets; integration points with existing Gaussian / mesh traits in the engine.
2. **Verification** — Compare rendered rays or splat composites against reference frames or depth cues; log pass/fail + residual stats per build or session.
3. **Runtime** — Budgets for inference (WebGPU / WASM paths) and fallbacks to mesh proxies when contract thresholds fail.
4. **Versioning** — Asset hash chain ties training checkpoints to contract digests for dispute resolution.

## Verification

- Golden viewpoints: PSNR/SSIM or perceptual thresholds against frozen references.
- Contract audit: same asset ID cannot change canonical hash without a new version record.

## Status

Research outline — full benchmarks and trait surface area are follow-on work.
