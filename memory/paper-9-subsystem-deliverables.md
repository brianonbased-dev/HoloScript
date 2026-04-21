# Paper-9 subsystem deliverables — decomposition map (repo anchors)

**Paper:** Verifiable Motion (paper-9 in research repo). This note satisfies the **decomposition** workstreams that split a monolithic “ship the whole ML stack” into **subsystem boundaries**, with **where the code lives today** vs **what is still open**.

Parent umbrella task on the board: **Ship ML motion pipeline** (paper-9) — remains open until training + inference deployments exist; this document **does not** claim end-to-end ML shipping.

---

## Subsystem 1 — Motion model training pipeline (board: decomposition task **9dw8**)

**Goal per board:** contracted dataset generation, training scripts, reproducible checkpoints, benchmark-ready artifact paths.

**In-repo today**

- Deterministic **evaluation substrate** for motion quality ( hashes / probes ) lives under `packages/engine/src/animation/paper/` (e.g. `MotionDeterminismProbe.ts`, `AnimationSamplingProbe.ts`, `IKDeterminismProbe.ts`) and uses `@holoscript/core` `DeterminismHarness` for cross-backend checks.
- **Synthetic clip generation** for the plausibility **matrix** is implemented inside `MotionPlausibilityBenchmark.ts` (not learned weights — statistical baselines vs `contracted`).

**Still open (true training path)**

- Export pipelines from Studio or batch jobs → frozen **contracted datasets** (versioned manifests + hashes).
- External training jobs (PyTorch/JAX/etc.) producing **checkpoints** with an agreed **MotionClip** / skeleton contract on export.
- CI stage that pins **dataset + checkpoint IDs** next to benchmark results (paper tables).

---

## Subsystem 2 — Plausibility contract engine (board: decomposition task **b9rm**)

**Goal per board:** hard plausibility constraints (joint limits, interpenetration, ZMP/support, force bounds), rejection diagnostics, deterministic evaluation harness integration.

**Shipped in HoloScript (engine)**

| Area | Location |
|------|----------|
| Five-category physics contract | `packages/engine/src/animation/paper/PhysicsPlausibilityContract.ts` |
| Full benchmark matrix (5 categories × 4 systems) | `packages/engine/src/animation/paper/MotionPlausibilityBenchmark.ts` |
| Vitest gate + measured pass rates | `packages/engine/src/animation/paper/__tests__/MotionPlausibilityBenchmark.test.ts` |

Integration with **DeterminismHarness** and paper probes is already the intended “deterministic evaluation harness” layer; extend with richer **rejection diagnostics** (per-clip failure codes) when camera-ready tables need them.

---

## Subsystem 3 — Inference / runtime service (board: decomposition task **xjuf**)

**Goal per board:** inference server/runtime path for **contracted** motion outputs, API surface, failure paths, hooks for evaluation workloads.

**In-repo today**

- **Contract shape** for evaluation is `MotionClip` + plausibility results (see `PhysicsPlausibilityContract.ts`).
- **Provenance-style hashing** of benchmark matrices exists (`hashBenchmarkMatrix` in `MotionPlausibilityBenchmark.ts`).

**Still open (serving path)**

- A small HTTP/gRPC **inference** service that accepts constraints + returns `MotionClip` (or tensor intermediary) is **not** checked in as a standalone deployable; add under `services/` or `packages/` with the same contracts as the benchmark.
- Failure taxonomy: align HTTP status + body with plausibility `PlausibilityResult` rejection reasons for operability.

---

## Cross-links

- Paper program / D.011 checklist: `docs/paper-program/` (when citing venues).
- Motion paper probes index: `packages/engine/src/animation/paper/`.

**Status:** Decomposition + repo map **shipped** in this file for planning and board closure of the three “Decompose Paper-9” tasks; training-job and inference-service **runtime** work remain future commits.
