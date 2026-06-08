# JEPA Training Experiment — Paper 26 Contribution 2 ("PillarJEPA trains stably")

**Date:** 2026-05-24
**Script:** `packages/core/src/traits/pillar/sim/jepa-training-experiment.ts`
**Run:** `npx tsx packages/core/src/traits/pillar/sim/jepa-training-experiment.ts`

## The gap this closes

`PillarJEPA.onUpdate()` and `JEPAObjective.onUpdate()` are **both empty** —
their comments say weight updates are "expected to be driven externally." No loop
ever updated the predictor weights, so every previously-reported number was the
**deterministic-init baseline forward pass**, not a trained model. This experiment
supplies the missing external gradient-descent loop and measures whether the REAL
assembled objective is actually trainable.

## What is real

- **Predictor:** the real `JEPAPredictor` (`JEPAPredictor.ts`) — we call its
  `forward()` / `getWeights()` / `setWeights()`; the MLP math is unmodified.
- **Conservation loss:** `computeConservationLoss` + `axisIdToDirection`
  **imported** from `PillarJEPA.ts` (unmodified).
- **Gradients:** EXACT analytic backprop through the real MLP topology
  (input → ReLU hidden → linear out). dL/dẑ is closed-form for MSE + SIGReg +
  conservation; chain-ruled to dL/dθ. **Gradcheck rel-err vs central finite
  difference = 0.000e+0** (< 1e-3 ⇒ backprop correct).
- **Cross-check:** the real `pillarJepaHandler` is driven with the trained
  weights synced in; its `jepaTotalLoss` is compared to ours each checkpoint
  (max delta 1.715e-1 — see NOTE below).

## Convergence (REAL numbers)

The **held-out eval loss** (fixed 256-sample batch, evaluated every 25
steps) is the convergence signal — it removes the per-step sampling noise of
minibatch SGD (each training step draws fresh random conservation-respecting
targets). Training uses minibatches of 16.

- **Held-out eval loss: 0.340645 → 0.175162 (reduction 1.94×)**
- Eval head-quarter mean: 0.221880 → tail-quarter mean: 0.179156

Per-step minibatch components (initial → final):

|             | totalLoss |      MSE |   SIGReg | conservation |  symmetry |
| ----------- | --------: | -------: | -------: | -----------: | --------: |
| **initial** |  0.364688 | 0.052471 | 4.148449 |     1.048645 | 3.780e-34 |
| **final**   |  0.176016 | 0.083340 | 1.853521 |     0.000000 | 6.309e-34 |

## Temporal gating (the "simulation depth dial")

λ_c_eff = λ_c·(1−κ), κ rises 0→1 over training.

- initial effective conservation weight: 0.099933
- final effective conservation weight: 0.000e+0
- monotone decreasing (pressure relieved as κ→1): **true**

## Stability verdict

**trains_stably = true**

| check                                                | result |
| ---------------------------------------------------- | :----: |
| no NaN / Inf                                         |  true  |
| held-out eval reduced ≥30% (actual: 48.6%)           |  true  |
| tail plateau stable (CV 4.0% < 25%, no upward drift) |  true  |
| smoothed eval curve non-increasing                   |  true  |
| gating relieves conservation as κ→1                  |  true  |
| final eval < initial eval                            |  true  |

## NOTE (honest scope boundary)

The handler cross-check compares the assembled JEPA core (MSE + SIGReg) the REAL
`pillarJepaHandler` computes against ours, with the trained weights synced in.
The handler runs its **own** context encoder (EmbeddingTrait deterministic hash of
a step string) rather than our physically-structured context vector, so its MSE
term differs from ours **by construction** — the reported `max_handler_delta`
(1.715e-1) is that expected encoder gap, **not** a discrepancy in the
objective. The point of the cross-check is that the SAME unmodified handler
ingests our trained weights and emits a finite, well-formed `pillarjepa:loss`
with all components present — i.e. the trained predictor is a valid drop-in for
the production trait. The symmetry term is a conditioning-space proxy in
PillarJEPA (∂L_sym/∂θ = 0 by design), so it is logged but not part of the
gradient — matching the trait's own documented behaviour.
