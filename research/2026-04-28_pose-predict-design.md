# `pose.predict` Trait — Design Memo

**Status:** Plan-only (task_1777366583512_lmmc)  
**Author:** github-copilot  
**Date:** 2026-04-28  
**References:**
- research/2026-04-28_cascadeur-EVOLVED.md §W.701, W.702, W.705, W.706, Δ1, Δ4, Δ10
- research/2026-04-28_cascadeur.md (source RE)
- D.027 (Brittney operator contract — NL → manipulator → refusable diff)
- P.700.01 (animator-primacy)
- Paper 18 (Motion-SESL, training corpus methodology)
- `<RefusableDiff />` spec: research/2026-04-28_refusable-diff-spec.md

---

## 1. Problem Statement

Cascadeur's **AutoPosing** network solves: given a sparse set of manipulator positions, infer a plausible full-body pose for the remaining joints. The 2019 SIGGRAPH-referenced architecture demonstrates this is tractable at ~329k parameters — trivially CPU/WASM runnable, web-deliverable, mobile-viable.

HoloScript needs a first-party equivalent that:
1. Integrates with the `.hsplus` trait system
2. Feeds into the `<RefusableDiff />` animator-primacy pipeline (P.700.01)
3. Operates on `.holo` character data without mutation until accept
4. Supports Brittney NL-to-pose operator contract (D.027)

---

## 2. Architecture Reference (Verified from RE Phase 6)

### 2.1 Cascadeur 2019 Baseline

| Property | Value | Source |
|----------|-------|--------|
| Architecture | 5-layer FC | SIGGRAPH 2019 blog |
| Layer sizes | 300 → 400 → 300 → 200 | SIGGRAPH 2019 blog |
| Input | 18 manipulator joint positions | SIGGRAPH 2019 blog |
| Output | 111 joint positions | SIGGRAPH 2019 blog (inferred: ~37 joints × 3 coords) |
| Total params | ~329k (verified by direct count) | EVOLVED.md §Param Count |
| Float32 size | ~1.3 MB | EVOLVED.md §Param Count |
| Float16 size | ~660 KB | EVOLVED.md §Param Count |
| Training set | ~115k poses (2M after 17× augmentation) | SIGGRAPH 2019 blog |
| Loss | Least-squares on joint positions | SIGGRAPH 2019 blog |
| Error metric | 3.5cm average joint position error | SIGGRAPH 2019 blog |

### 2.2 HoloScript Target Architecture (W.706)

Per EVOLVED.md W.706, the HoloScript reference implementation mirrors the 2019 spec:
- 5-layer FC: input(N) → 300 → 400 → 300 → 200 → output(J×3)
- Input: 6 / 16 / 28 manipulator positions (three operating modes)
- Output: 37 joint positions (×3 = 111 output values)
- CPU/WASM target (NOT snn-webgpu — Δ1: acronym collision, different architecture)
- Training corpus: open MoCap — AMASS + CMU + W.702 mirror+rotation augmentation

---

## 3. Trait Interface

### 3.1 `.hsplus` Syntax

```hsplus
object Character @pose_predict {
  skeleton: 'rig/biped_standard.holo'
  manipulator_mode: 16          // 6 | 16 | 28
  model_path: 'pose/biped_v1.onnx'
  on_predict: { emit pose_suggest }
}
```

### 3.2 TypeScript Trait Handler (sketch, NOT implementation)

```typescript
// packages/core/src/traits/PosePredictTrait.ts (future impl ticket)

export interface PosePredictInput {
  /** Sparse manipulator positions, length must match manipulator_mode (6|16|28) */
  manipulators: ManipulatorPosition[];
  /** Operating mode — how many manipulators are being provided */
  mode: 6 | 16 | 28;
  /** Current skeleton state (original, immutable during prediction) */
  skeleton: SkeletonState;
}

export interface PosePredictOutput {
  /** Predicted full-body joint positions, 37 joints × 3 floats */
  joint_positions: Float32Array;
  /**
   * Average position error estimate (cm).
   * Derived from model's validation distribution; not a per-pose guarantee.
   */
  deviation_metric: number;
  /** Which model produced this prediction (audit trail per D.027) */
  model_id: string;
  /** Timestamp for provenance */
  predicted_at: number;
}
```

### 3.3 Refusable-Diff Contract (P.700.01 + D.027)

The trait NEVER mutates `skeleton`. It produces a `PosePredictOutput` which is wrapped in `<RefusableDiff<SkeletonState> />` by the Studio renderer:

```typescript
// Studio renderer (future — uses RefusableDiff spec)
<RefusableDiff
  original={currentSkeleton}
  suggested={applyJointPositions(currentSkeleton, prediction.joint_positions)}
  deviation_metric={prediction.deviation_metric}
  deviation_label={`avg joint deviation ~${(prediction.deviation_metric).toFixed(1)} cm`}
  renderHints={['side-by-side', 'slider-blend', 'blend']}
  onAccept={() => dispatch({ type: 'SKELETON_ACCEPT', payload: prediction })}
  onReject={() => dispatch({ type: 'POSE_PREDICT_DISMISS' })}
  onPartialBlend={(t) => dispatch({ type: 'SKELETON_BLEND', t, prediction })}
  source={`pose.predict / ${prediction.model_id}`}
  renderSlot={(skeleton, role) => <SkeletonViewport skeleton={skeleton} role={role} />}
/>
```

---

## 4. Brittney Operator Contract (D.027)

Natural-language → manipulator placement → trait call flow:

```
User: "pose this character in a fighting stance, right hand raised"
  ↓
Brittney (LLM): maps NL → ManipulatorPosition[] (16-manipulator mode)
  ↓
pose.predict trait: ManipulatorPosition[] → PosePredictOutput
  ↓
<RefusableDiff />: presents original ↔ suggested to animator
  ↓
Animator: Accept / Reject / Partial blend
```

Brittney NEVER commits the pose directly. Every NL-generated pose passes through `<RefusableDiff />`. The animator's `onAccept()` is the only write path.

---

## 5. Package Placement

### 5.1 Option A — New `packages/pose-predict` (recommended)

```
packages/pose-predict/
  src/
    index.ts                   ← exports: PosePredictEngine, createPosePredictEngine
    engine.ts                  ← WASM/ONNX inference wrapper
    types.ts                   ← PosePredictInput, PosePredictOutput, ManipulatorPosition
    manipulator-schemes.ts     ← 6/16/28 joint index maps for biped, quadruped
    training/
      dataset-loader.ts        ← CMU/AMASS loader (for training pipeline, not runtime)
      augmentation.ts          ← W.702 mirror + rotation augmentation
  models/
    biped_v1.onnx              ← trained model (git-lfs or CDN)
  tsconfig.json
  package.json
```

**Rationale for new package:** Separates ML inference concern from core runtime. Allows independent versioning, model swaps, WASM build pipeline without coupling to `packages/core` build chain.

**Per Δ1:** Do NOT put this in `packages/snn-webgpu` — that is the Spiking Neural Network package (unrelated architecture).

### 5.2 Option B — Fold into `packages/core/src/traits`

Simpler. Add `PosePredictTrait.ts` and a `PosePredictEngine` that imports from an ONNX runtime. Avoids new package overhead.

**Downside:** Couples model inference to core build. Model updates require core releases. WASM build complexity bleeds into core.

**Recommendation: Option A** for production. Option B acceptable for a prototype-to-validate cycle.

---

## 6. Manipulator Mode Design

| Mode | Joint indices | Use case |
|------|--------------|---------|
| 6 | pelvis, L/R wrist, L/R ankle, head | Minimal drag — quick pose sketching, HoloLand gesture input |
| 16 | 6 + L/R elbow, L/R knee, L/R shoulder, spine-mid, chest, neck | Standard Studio authoring |
| 28 | 16 + L/R hip, L/R finger (pinch proxy), L/R toe, clavicles, jaw | Precision character work, facial integration |

All three modes share the same trained model by zero-padding unused manipulator slots and masking them in a learned mask layer — consistent with the approach described in the SIGGRAPH 2019 blog for variable-input AutoPosing.

---

## 7. Companion: `pose.ik_resolve` Trait

Per EVOLVED.md, the `pose.predict` trait outputs **joint positions** (not rotations). A separate `pose.ik_resolve` trait converts joint positions → joint rotations for runtime use:

```typescript
// Future separate impl ticket
export interface IKResolveInput {
  joint_positions: Float32Array;   // from PosePredictOutput
  skeleton_bind_pose: SkeletonState;
  ik_solver: 'fabrik' | 'cyclic_ccd' | 'analytical';
}
```

This two-step design mirrors the Cascadeur separation between AutoPosing (position space) and the IK/FK layer. Keeps `pose.predict` model simple (position loss only).

---

## 8. Training Recipe (W.702 methodology)

For the first `biped_v1.onnx` model:

| Step | Details |
|------|---------|
| Corpus | CMU MoCap + AMASS (open license) |
| Augmentation | 17× per W.702: mirror (left↔right), rotation (N random azimuth orientations) |
| Target scale | ~115k raw poses → ~2M augmented (matching Cascadeur training scale) |
| Input format | 37 joint positions normalized to pelvis-origin, unit hip-width scale |
| Output format | 37 joint positions (same normalization) |
| Manipulator sampling | Random 6/16/28 subsets per batch (variable-input training) |
| Loss | MSE on joint positions |
| Validation metric | Average per-joint position error (cm) — target ≤4cm for biped |
| Benchmark | 3.5cm is Cascadeur's published error; ≤4cm is acceptable parity |
| Training infra | Paper 18 gate track (Motion-SESL pipeline, CAEL-logged) |

---

## 9. HoloLand / D.019 Cross-Product Note

Per Δ10: AutoPosing's 6→37 joint inference **is the same computational problem** as 2D keypoint→3D pose estimation when the input comes from image keypoints or hand tracking. 

If a Quest 3 user gestures (6 hand-tracked targets), this trait can infer a full avatar pose in real time. This is a HoloGram (D.019) + pose.predict product fusion candidate. Track separately; note here for cross-referencing.

---

## 10. Out of Scope (This Memo)

- Actual TypeScript/WASM implementation (separate impl ticket)
- Training pipeline code
- `pose.ik_resolve` trait implementation
- Finger AutoPosing (Cascadeur 2026.1 extension — track separately)
- Quadruped support (separate skeleton spec + model)
- `locomotion.generate_root_motion` (separate task, Paper 18 gate)

---

## 11. Open Questions (For /founder Ruling)

1. **Package A vs B?** New `packages/pose-predict` vs fold into `packages/core/src/traits`. Recommendation: A. Ruling needed before impl ticket opens.
2. **ONNX runtime choice:** `onnxruntime-web` (JS/WASM) vs `@tensorflow/tfjs` (WebGL fallback available) vs custom WASM. Affects bundle size and mobile compatibility.
3. **Model licensing:** Training on CMU/AMASS is clean. Does HoloScript publish the trained weights under a permissive license, or keep them proprietary? Affects `packages/pose-predict/models/` git-lfs vs CDN decision.
4. **Compete vs complement ruling** (D.028 prerequisite): Does HoloScript build `pose.predict` as a full AutoPosing analog (compete) or as a thin bridge that calls Cascadeur's Python API when licensed (complement)? This memo assumes compete-path.
