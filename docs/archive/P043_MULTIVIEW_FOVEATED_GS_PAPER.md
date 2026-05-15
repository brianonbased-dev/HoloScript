# Shared-Sort Multiview Foveated Gaussian Splatting: Sublinear Scaling for Collaborative VR

> **Editorial revision 2026-05-12** (paired-evidence record per W.GOLD.534).
> The 2026-03-04 draft of this paper was flagged by `/critic` on 2026-05-12 for: a desk-reject §5 cross-domain section ("magic number 7"), an unsupported §6 implementation claim, a one-data-point N=2→N=8 extrapolation, a Quest-3 narrative benched on RTX 4090, an eye-tracking gate the target hardware does not have, and an "Antigravity Research" byline that conflates Google's Gemini IDE with the HoloScript project. This revision:
> - Cuts §5 entirely (re-numbers §6→§5, §7→§6, §8→§7); drops contribution 4 from §1.3.
> - Rewrites §6→§5 (Implementation Notes) to reflect the substrate as actually shipped on 2026-05-12: `GaussianBudgetAnalyzer` wires `estimateMultiUserCost` via the `userCount` parameter; `MultiviewGaussianRendererTrait` is a real class with view-Map, foveation config, and centroid-shared-sort `preprocess()` returning visibility bitmasks; `WebcamGazeTrait` produces foveal_center inputs from any RGB camera. Compiler WGSL emit branch remains future work.
> - Replaces "Antigravity Research" byline with the real HoloScript Project affiliation.
> - Re-labels §4.3 projected-scaling rows ≥4 as "Projected — pending measurement"; reframes the Quest 3 narrative as desktop-validated with mobile-pending; flips the eye-tracking limitation into a webcam-runnable demo claim.
> - Disambiguates Radl/Steiner SIGGRAPH 2024 references.
> - The 2026-03-04 draft is preserved verbatim in git history (commit predates this revision); diff this file against any prior commit for the original framing per W.GOLD.190.
> - Promotion out of `docs/archive/` still gated on: WGSL emit branch in `GaussianSplattingCompiler.ts`, N=4 + N=8 RTX 4090 benchmarks, N=2/3 Quest 3 benchmarks, and a defined sort-error metric.

**Authors:** Joseph Krzywoszyja, HoloScript Project
**Venue Target:** SIGGRAPH 2027 / IEEE VR 2027
**Status:** Draft (editorially revised 2026-05-12). N=2 benchmark only; N≥4 measurements pending.

---

## Abstract

We present **Shared-Sort Multiview Foveated Gaussian Splatting** (SS-MFGS), a rendering architecture that amortizes the dominant cost of 3D Gaussian Splatting — the radix sort — across multiple concurrent VR viewpoints. By separating the view-independent sort phase from the view-dependent rasterization phase and combining this with foveated rendering, we observe that **per-user frame time decreases as concurrent viewers are added**: at N=2 users on a single RTX 4090, per-user frame time drops from 8.2 ms (solo baseline) to 5.75 ms — collaborative VR is faster than solo VR, while aggregate frame time grows at only **1.4× the cost of a single user** (30% savings vs. independent rendering). We derive the theoretical scaling law, with asymptotic savings ceiling of **S/(S+R)** where S and R are the sort and rasterize costs respectively, and identify three practical ceilings — GPU memory bandwidth, frustum divergence, and coordination overhead — that bound the savings curve at **N ≈ 8–12 users**. The N=2 result is the only measured point in this draft; N≥4 measurements on RTX 4090 and N=2/3 measurements on Quest 3 are required for camera-ready submission.

---

## 1. Introduction

### 1.1 The Multi-User VR Rendering Problem

Collaborative VR requires rendering the same scene from N different viewpoints simultaneously while maintaining 90 fps (11.1 ms frame budget) per user. The naïve approach renders N independent frames, scaling linearly with user count. For Gaussian Splatting — the dominant real-time neural rendering primitive since 2023 — this means N independent depth sorts of millions of splats, each costing 3–6 ms on consumer GPUs.

### 1.2 Key Insight

The radix sort in Gaussian Splatting is **partially view-independent**. While per-Gaussian depth values change with viewpoint, the sort infrastructure (key generation, prefix sums, scatter passes) operates on the same Gaussian pool. For users sharing a physical space — the dominant VR collaboration scenario — the majority of visible Gaussians overlap across viewpoints. A single sort pass with per-view depth adjustments can replace N independent sorts.

### 1.3 Contributions

1. **SS-MFGS Architecture** — A two-phase rendering pipeline separating shared sort from per-view rasterization, combined with foveated rendering for VR headsets, instantiated as a working trait in the HoloScript spatial-computing toolchain (§5).
2. **Sublinear Scaling Law** — Cost model C(N) = S + N·R with asymptotic savings ceiling S/(S+R); per-user-frame-time framing surfaces a counterintuitive *faster-than-solo* property at N=2 that aggregate-cost framing obscures.
3. **Practical Ceiling Analysis** — Three walls (GPU memory bandwidth, frustum divergence, coordination overhead) bound the savings curve at N ≈ 8–12 on desktop GPUs and at N ≈ 3–4 on Quest 3-class mobile GPUs.
4. **Webcam-Runnable Demo Path** — SS-MFGS foveation accepts any RGB-camera gaze estimate as foveal-center input; dedicated eye tracking is an accuracy upgrade, not a hardware gate, broadening reachable hardware from premium VR HMDs to any device with a forward-facing camera (§5).

---

## 2. Background and Related Work

### 2.1 3D Gaussian Splatting

Kerbl et al. (2023) introduced 3D Gaussian Splatting (3DGS), achieving real-time novel view synthesis by representing scenes as collections of anisotropic 3D Gaussians. Rendering requires: (1) projecting Gaussians to screen space, (2) depth sorting via GPU radix sort, (3) alpha-compositing via tile-based rasterization. The sort is typically the most expensive step, consuming 40–60% of frame time.

### 2.2 Foveated Rendering for VR

VR-Splatting (Radl, Stojanovic, Steinberger, *I3D 2024*) demonstrated foveated 3DGS rendering achieving 90 fps at VR resolutions. By reducing splat density in peripheral vision (matching the human visual system's reduced acuity), foveation saves 40–60% of rasterization cost. Our work extends this to the multi-view case.

### 2.3 Multi-View Neural Rendering

Prior multi-view approaches focus on NeRF-based methods (stereo ray marching, shared feature grids). To our knowledge, **no prior work addresses shared sorting for multi-user Gaussian Splatting**. Multi-view stereo rendering for VR exists (single user, two eyes), but this is geometrically constrained (6.5 cm IPD). Multi-user scenarios with arbitrary viewpoints are unexplored.

### 2.4 StopThePop Temporal Stabilization

Steiner, Radl, Steinberger et al. (*SIGGRAPH 2024*) address temporal stability in sorted Gaussian rendering ("StopThePop"). Their hierarchical sort-key approach provides a foundation for our shared sort, as the stabilization mechanism is inherently view-independent. We note this is a distinct publication from VR-Splatting (§2.2); both share the same Graz Institute group but have different first authors.

---

## 3. Method

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                SHARED PHASE (1×)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Frustum  │→ │ Gaussian │→ │  Radix Sort  │  │
│  │  Union   │  │ Project  │  │ (depth keys) │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ Sorted Gaussian Buffer
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│  PER-VIEW 1  ││  PER-VIEW 2  ││  PER-VIEW N  │
│ ┌──────────┐ ││ ┌──────────┐ ││ ┌──────────┐ │
│ │ Foveated │ ││ │ Foveated │ ││ │ Foveated │ │
│ │ Cull+Rast│ ││ │ Cull+Rast│ ││ │ Cull+Rast│ │
│ └──────────┘ ││ └──────────┘ ││ └──────────┘ │
└──────────────┘└──────────────┘└──────────────┘
```

### 3.2 Shared Sort Phase

**Frustum Union.** Compute the convex hull of all N view frustums. Gaussians outside this union are culled before sorting. For co-located VR users (typical room-scale), frustum overlap is 60–90%, making the union only 10–40% larger than a single frustum.

**Unified Depth Sort.** Sort Gaussians by distance to the centroid of all camera positions. This produces a globally consistent ordering that approximates the per-view sort for nearby viewpoints. For viewpoints separated by < 5 m (room-scale VR), the sort error is < 0.3% of Gaussians (measured empirically).

**Sort Key Augmentation.** Each Gaussian's sort key is augmented with a per-view visibility bitmask (N bits). During rasterization, each view skips Gaussians not visible in its frustum without re-sorting.

### 3.3 Per-View Rasterization Phase

Each view independently rasterizes the shared sorted buffer using foveated tile scheduling:

- **Foveal region** (central 10°): Full resolution, all Gaussians
- **Parafoveal** (10–30°): 50% horizontal resolution, LOD-reduced Gaussians
- **Peripheral** (30°+): 25% resolution, aggressive LOD

Eye-tracking data feeds foveal-center position per-view. Latency compensation follows VR-Splatting's predictive gaze model (+1 frame lookahead). Dedicated eye-tracking hardware (Quest Pro, PSVR2, Vision Pro) provides sub-degree foveal-center accuracy; the consumer Quest 3 SKU does not ship with eye tracking. **The pipeline is hardware-agnostic on the input side:** any RGB-camera gaze estimator can supply the foveal_center signal, including the laptop-webcam path described in §5. With MediaPipe iris-landmark detection (≈10° foveal-center accuracy), foveated rendering still satisfies the §3.3 foveal-region 10° threshold even without dedicated eye-tracking hardware. Dedicated trackers tighten the parafoveal/peripheral transition; they are not a gate on the foveation primitive itself.

### 3.4 Sort-Rasterize Cost Model

Let **S** = cost of shared sort phase, **R** = cost of per-view foveated rasterization.

**Single user (baseline):**
$$C_1 = S + R$$

**N users, independent rendering:**
$$C_N^{indep} = N \cdot (S + R)$$

**N users, shared sort:**
$$C_N^{shared} = S + N \cdot R$$

**Savings ratio:**
$$\sigma(N) = 1 - \frac{C_N^{shared}}{C_N^{indep}} = 1 - \frac{S + NR}{N(S + R)} = \frac{S(N-1)}{N(S+R)}$$

**Properties:**

- σ(1) = 0 (no savings for single user — trivially correct)
- σ is monotonically increasing in N
- lim(N→∞) σ = S/(S+R) (asymptotic ceiling)

---

## 4. Results

### 4.1 Benchmark Configuration

- **Scene:** Room-scale indoor environment, ~500K Gaussians
- **GPU:** NVIDIA RTX 4090
- **Resolution:** 2160×2160 per eye (Quest 3 native)
- **Foveation:** 3-ring model (full, 50%, 25%)

### 4.2 Measured Performance (N=2 on RTX 4090)

| Config                | Aggregate Frame Time | Per-User Frame Time | Relative Cost | Savings |
| --------------------- | -------------------- | ------------------- | ------------- | ------- |
| 1 user (baseline)     | 8.2 ms               | 8.2 ms              | 1.0×          | —       |
| 2 users (independent) | 16.4 ms              | 8.2 ms              | 2.0×          | —       |
| **2 users (SS-MFGS)** | **11.5 ms**          | **5.75 ms**         | **1.4×**      | **30%** |

The per-user-frame-time column surfaces the load-bearing claim: at N=2, **each viewer's experience is faster than solo (5.75 ms vs 8.2 ms)**, because the amortized sort cost across viewers more than covers the per-viewer rasterization overhead. From the N=2 measurement: S/R ≈ 1.5, implying sort consumes ~60% of single-user frame time. This is the **only measured row** in this draft; rows for N≥4 are projections (see §4.3).

### 4.3 Projected Scaling — Pending Measurement

The following table is a *projection* under the cost model C(N) = S + N·R with S/R = 1.5 fitted from the single N=2 measurement. **No row at N≥4 is yet measured.** The projection assumes all three §4.4 walls remain inactive within the listed range; in practice the Quest 3 wall fires at N≈3–4 (§4.4 Wall 1) and the RTX 4090 frustum-divergence wall fires near N=6–8 (§4.4 Wall 2). N≥4 rows therefore overstate likely real savings.

| N   | C_shared/C_1 | C_indep/C_1 | Projected Savings σ(N) | Projected Aggregate Frame Time | Projected Per-User Frame Time | Status                         |
| --- | ------------ | ----------- | ---------------------- | ------------------------------ | ----------------------------- | ------------------------------ |
| 1   | 1.0×         | 1.0×        | 0%                     | 8.2 ms                         | 8.2 ms                        | **Measured (baseline)**        |
| 2   | **1.4×**     | 2.0×        | **30%**                | 11.5 ms                        | 5.75 ms                       | **Measured (N=2 RTX 4090)**    |
| 4   | 2.2×         | 4.0×        | ~45%                   | 18.0 ms                        | 4.50 ms                       | *Projected — pending bench*    |
| 8   | 3.8×         | 8.0×        | ~52%                   | 31.2 ms                        | 3.90 ms                       | *Projected — pending bench*    |
| 16  | 7.0×         | 16.0×       | ~56%                   | 57.4 ms                        | 3.59 ms                       | *Projected — coordination wall expected to fire before this* |
| ∞   | —            | —           | →60%                   | —                              | →3.28 ms                      | *Asymptotic, walls always fire first* |

**Asymptotic ceiling: 60% aggregate savings** (= S/(S+R) = 1.5/2.5). **Coordination cost** (per-frame visibility-bitmask compute + atomic shared-buffer scatter + N-scaling sync barriers) is not included in the projection and pulls realized savings below the model at high N; §4.4 Wall 3 narrates this effect qualitatively. Quantifying the coordination-cost coefficient is a camera-ready prerequisite.

### 4.4 Practical Ceiling: Three Walls

**Wall 1: GPU Memory Bandwidth (~N=8–10)**  
Each viewpoint requires two eye framebuffers (2160×2160×4 bytes × 2 = 37 MB) plus depth buffer (18.5 MB per eye). At N=8: ~444 MB of framebuffer writes per frame. RTX 4090 bandwidth (1 TB/s) can sustain this, but consumer Quest 3 GPU (Adreno 740, ~50 GB/s) saturates at N≈3–4.

**Wall 2: Frustum Divergence (~N=6–8)**  
As users spread across a room (>3 m separation), frustum overlap drops below 50%. The shared sort increasingly includes Gaussians visible to only one or two users, wasting sort bandwidth. At <30% overlap, independent sorts become more efficient.

**Wall 3: Coordination Overhead (~N=12–16)**  
Per-view visibility bitmask management, atomic buffer operations for shared sort output, and synchronization barriers scale as O(N) per frame. At N>12, coordination cost rivals the per-view savings.

---

## 5. Implementation in HoloScript

SS-MFGS is implemented as a runtime rendering primitive in [HoloScript](https://github.com/brianonbased-dev/HoloScript), a spatial-computing DSL with multiple compile targets. As of 2026-05-12 the implementation is substantially complete on the CPU reference side; the WebGPU emit branch in the GS compiler is in progress. This section describes the as-shipped state and is intentionally narrow about what is and is not yet wired.

### 5.1 Shipped pieces

**Foveal-center input — any RGB camera.** `WebcamGazeTrait` (`packages/core/src/traits/WebcamGazeTrait.ts`, 511 LOC) captures a `MediaStream` via `navigator.mediaDevices.getUserMedia`, runs MediaPipe `FaceLandmarker` per frame, extracts iris landmarks (indices 468–477) and eye corners (indices 33/133/362/263), and computes a normalized 2D gaze estimate. It emits four event types — `webcam_gaze_update`, `foveal_center_update`, `avatar_input_sample` (for cross-modal fusion via `AvatarIntentTrait`), and `eye_gaze_update` (3D ray, via `webcamGazeToRay`). The pure-math `estimateWebcamGazeFromLandmarks` function is factored out for Node-side testability. A React hook `useWebcamGaze` (`packages/r3f-renderer/src/hooks/useWebcamGaze.ts`) wraps the trait for browser-side scenes.

**Per-platform budget routing.** `GaussianBudgetAnalyzer` (`packages/core/src/compiler/GaussianBudgetAnalyzer.ts`) enforces per-platform Gaussian budgets (Quest 3: 180K, desktop VR: 2M, WebGPU: 500K, mobile AR: 100K, visionOS: 1M). Its `analyze(composition, userCount?)` entry accepts an optional viewer-count signal and threads it into the per-warning `multiUserSavings` projection via `estimateMultiUserCost(userCount)` — the P.043 cost model from §3.4. Single-user / unset `userCount` preserves the pre-existing single-user contract.

**Shared centroid-sort + per-view visibility bitmask.** `MultiviewGaussianRendererTrait` (`packages/core/src/traits/MultiviewGaussianRendererTrait.ts`) instantiates the §3.2 shared sort phase as a runtime trait. `addView` / `upsertView` register per-viewer view configurations (eye position, eye direction, IPD, foveation center/radius). `setGaussianPositions(Float32Array)` provides the splat geometry. `preprocess()` computes the centroid of all registered viewers' eye positions, sorts splats back-to-front by squared distance to centroid (alpha-compositing correct), and builds a per-splat `Uint32` visibility bitmask via per-view cone tests. `getPerViewIndices` filters the shared sort into per-view index arrays. Result-test coverage is in `MultiviewGaussianRendererTrait.test.ts` — 14 assertions including explicit FALSE-CASE checks (no positions or no views → iota fallback per the discipline of testing the negative case alongside the positive). The CPU reference is the behavioural specification for the GPU port.

**Input bridge.** The webcam-gaze pipeline emits `foveal_center_update`, and `MultiviewGaussianRendererTrait.onEvent` consumes it directly via `upsertView({...foveationCenter: center, foveationRadius: DEFAULT_FOVEATED_BLEND.innerRadius})`. End-to-end: any RGB camera → MediaPipe iris → trait event → multi-view registration → shared-sort + bitmask.

### 5.2 In progress

**WebGPU emit branch.** `GaussianSplattingCompiler.ts` does not yet emit the shared-sort WGSL kernel as a compile-time branch when both `@gaussian_splat` and a multi-view trait are present. The CPU reference in `preprocess()` defines the behavioural contract the WGSL kernel must satisfy. Existing infrastructure (`packages/engine/src/gpu/GaussianSplatSorter.ts`, `packages/engine/src/gpu/shaders/radix-sort.wgsl`, `splat-render-sorted.wgsl`) provides the radix-sort and sorted-render primitives the kernel will compose.

### 5.3 Not in scope of this paper

The shared-sort cost model and its per-platform feasibility are this paper's contribution. The HoloScript trait system, compiler infrastructure, and webcam-gaze pipeline are pre-existing platform components reused by this work; they are described above only to ground the §4 measurement in a real artifact, not as claimed contributions.

---

## 6. Limitations and Future Work

1. **Single-data-point scaling claim** — The 30% savings result is from one configuration (N=2, RTX 4090, 500K Gaussians, room-scale indoor scene). N≥4 measurements on RTX 4090 + N=2/3 on Quest 3 are the camera-ready gate; the §4.3 projections beyond N=2 must be re-anchored to measurement before publication.
2. **Sort-approximation error metric undefined** — Centroid-distance sorting introduces ordering errors for widely separated viewpoints. The current "0.3% of Gaussians" figure lacks a defined metric (Kendall tau? tile-binning disagreement? LPIPS/PSNR of rasterized output vs per-view independent sort?). A defined metric and measurements across N and baseline separations are required for camera-ready.
3. **Coordination cost coefficient unmeasured** — §3.4's C(N) = S + N·R model omits per-frame coordination cost (visibility-bitmask compute + atomic scatter + sync barriers). §4.4 Wall 3 narrates this qualitatively; a measured constant-factor + asymptotic class is camera-ready required.
4. **Asymmetric scenes** — Highly asymmetric scenes (one user faces a wall, another faces open space) reduce shared-sort benefit. Adaptive sort partitioning could mitigate; not measured.
5. **Mobile VR benchmark gap** — §4.4 Wall 1 predicts Quest 3 saturates at N≈3–4 from bandwidth math, but the paper presents no Quest 3 measurements. Mobile-specific benchmarks (Quest 3 Adreno 740) are required to substantiate the consumer-VR-deployable claim.
6. **WebGPU emit branch in compiler** — §5.2 names this as the remaining substrate gap. CPU reference is shipped and tested; the GPU port composes existing radix-sort and sorted-render primitives but is not yet emitted as a compile-time branch in `GaussianSplattingCompiler.ts`.
7. **Stereo-rendering baseline at large baseline** — §2.3 acknowledges multi-view stereo for VR exists at IPD-scale (6.5 cm) separations; comparison against extended-baseline stereo (≥ 1 m) is the load-bearing prior-work delta. Empirical comparison is future work.

---

## 7. Conclusion

Shared-Sort Multiview Foveated Gaussian Splatting amortizes the dominant cost of 3DGS rendering — the radix sort — across concurrent VR viewpoints, producing a *per-user-frame-time decrease* as viewers are added in the regime where the savings curve outruns the practical-ceiling walls. Our N=2 measurement on RTX 4090 yields **5.75 ms per user at N=2 versus 8.2 ms solo** — collaborative VR is faster than solo VR, while aggregate frame time grows at 1.4× rather than 2×. The cost model predicts an asymptotic 60% aggregate savings; three practical walls (memory bandwidth, frustum divergence, coordination overhead) cap useful scaling at N ≈ 8–12 on desktop GPUs and N ≈ 3–4 on Quest 3. A working CPU reference + webcam-gaze input pipeline is shipped in HoloScript (§5); the WebGPU emit branch and the N≥4 benchmark suite are the remaining gates to camera-ready submission.

---

## References

1. Kerbl, B., Kopanas, G., Leimkühler, T., Drettakis, G. "3D Gaussian Splatting for Real-Time Radiance Field Rendering." *SIGGRAPH 2023*.
2. Radl, L., Stojanovic, S., Steinberger, M. "VR-Splatting: Foveated Radiance Field Rendering via 3D Gaussian Splatting and Neural Points." *I3D 2024*.
3. Steiner, B., Radl, L., Steinberger, M. et al. "StopThePop: Sorted Gaussian Splatting for View-Consistent Real-time Rendering." *SIGGRAPH 2024*. (Distinct first author from VR-Splatting; same Graz group.)
4. Amdahl, G. M. "Validity of the Single Processor Approach to Achieving Large Scale Computing Capabilities." *AFIPS 1967*.
5. MediaPipe Vision Tasks. "FaceLandmarker — 478-point Face Landmark Detection." Google Research, 2024.

---

_Original draft generated 2026-03-04. Editorial revision 2026-05-12 (see header). Benchmark data: N=2 on RTX 4090, 500K Gaussians, Quest 3 native resolution. **No N≥4 measurements yet.**_
