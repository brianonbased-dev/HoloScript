# Lotus — Emergent Phyllotaxis Research (grown, not placed)

**Date:** 2026-06-02
**Status:** Foundation committed (`cc7c30c92`); clean emergence = open multi-session research arc + paper candidate.
**Context:** HoloScript is simulation-first. The papers-program proof flower (I.007) currently
*renders* a lotus (real golden-angle placement rule + paper-state-driven keyframe bloom) — it is
not *grown*. Goal: make petal placement (and later form/bloom) EMERGE from a developmental model,
so the golden angle and Fibonacci parastichies fall out instead of being constants. Founder chose
"go bigger / L2+" then "build the reaction-diffusion model next."

## What shipped
`simulateLotusMorphogenesis()` in `packages/core/src/traits/BotanicalLotusTrait.ts` — the
Douady–Couder inhibitor-field model (three-free, deterministic, 5 tests). The divergence angle is a
genuine **emergent, deterministic, dynamics-dominated** output (no `137.5` in the placement loop;
two very different seeds agree within a few degrees vs ~90° for a seed-set value). Deliberately NOT
wired to the render (it doesn't lock to a clean spiral yet — see below), so the approved render stays clean.

## Experiments run (10) and what they showed
Geometric inhibitor-field / packing models:
1. Multiplicative advection (`r*=g`), global-argmin on apical ring → collapses to low-order modes (58–120°); exponential push-out leaves too few active primordia.
2. Additive advection (`r+=dr`, true Douady–Couder), global-argmin → **mean ≈138° at dr=0.08**, but raw deltas are a periodic cycle (e.g. `55/234/175/113/295/175…`) = **multijugate/whorled**, not a single Fibonacci spiral.
3. Power-law vs Gaussian inhibition, exponents s=1..10 → higher s locks onto sub-harmonics (58–68°); none give clean 137.5.
4. Greedy energy insertion (`r_n=c√n`, argmin vs prior) → wanders (177/81/128/105…); scale-invariant but jumps between near-degenerate gaps.
5. Simultaneous energy relaxation (fix `r_i=c√i`, gradient-descend all angles) → freezes in glassy local minima (spread 44–54°); random init never reaches the golden ground state.

**Root cause:** GLOBAL minimisation/argmin picks the absolute biggest gap, which alternates sides →
multijugate. Real phyllotaxis nucleates **locally and temporally** (a new primordium forms where
the inhibitor first clears as the meristem grows), which the global models don't capture.

Reaction-diffusion (the correct mechanism):
6. Gierer–Meinhardt on a growing ring with `D/R²` angular scaling → 0 peaks (never entered the Turing regime; `1/R²` killed the instability).
7. Schnakenberg fixed ring, naive dt → NaN blowup (`Du·dt/dx² ≈ 100`).
8. γ-scaled Schnakenberg, unit domain, dt=2e-6, M=128 → still NaN (`d·dt/dx² ≈ 1.3 > 0.5`).

**Root cause:** explicit Euler needs `D_max·dt/dx² < 0.5` (CFL). With M=128 and d=40 that means
dt ≲ 7.6e-7. Each fix is its own careful step; finding the Turing band + coupling growth is more.

## Correct next-step recipe (so the next session starts right)
1. **Get patterning first (fixed ring).** γ-Schnakenberg, **M=64** (dx≈0.0156), **dt≈2e-6**
   (CFL-safe: `d·dt/dx² = 40·2e-6/2.44e-4 ≈ 0.33 < 0.5`), d=40, γ sweep 300–1500, a=0.1, b=0.9,
   steps≈6e5 (t≈1.2). Confirm ~5–9 stable evenly-spaced spots + finite field range. (Or switch to
   semi-implicit / IMEX or spectral diffusion to lift the dt cap.)
2. **Add adiabatic meristem growth.** Slowly increase physical circumference (resample the ring to a
   larger L every K steps, or grow R with angular diffusion `D/R²` once patterning is stable). Spots
   should insert one-at-a-time in the opening gaps.
3. **Track nucleation.** Record each new peak's (θ, R, step) in emergence order; map R = f(emergence
   time) for the spiral.
4. **Measure + tune.** Divergence by emergence order → tune (d, γ, growth rate) toward a clean
   single-spiral ~137.5° with low spread. Parastichy counts should come out Fibonacci.
5. **Then L2 (emergent form).** Differential-growth / turgor petal-shape + bloom unfurling driven by
   the sim, replacing the renderer's keyframe curves.

## Framing
This is on-thesis (simulation-first) and **paper-worthy** (emergent golden-angle phyllotaxis via
reaction-diffusion is a citable result feeding the papers program). Treat as a dedicated tracked
research task with focused sessions — not chat-turn brute force. The geometric foundation + this
recipe are the resume point.
