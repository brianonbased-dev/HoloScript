# Lotus — Emergent Phyllotaxis Research (grown, not placed)

**Date:** 2026-06-02
**Status:** Foundation committed (`cc7c30c92`); clean emergence = open multi-session research arc + paper candidate.
**Context:** HoloScript is simulation-first. The papers-program proof flower (I.007) currently
_renders_ a lotus (real golden-angle placement rule + paper-state-driven keyframe bloom) — it is
not _grown_. Goal: make petal placement (and later form/bloom) EMERGE from a developmental model,
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

Reaction-diffusion (the correct mechanism): 6. Gierer–Meinhardt on a growing ring with `D/R²` angular scaling → 0 peaks (never entered the Turing regime; `1/R²` killed the instability). 7. Schnakenberg fixed ring, naive dt → NaN blowup (`Du·dt/dx² ≈ 100`). 8. γ-scaled Schnakenberg, unit domain, dt=2e-6, M=128 → still NaN (`d·dt/dx² ≈ 1.3 > 0.5`).

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

---

## Session 2 progress (2026-06-02, same day)

**Milestone — CFL-safe Turing patterning WORKS.** γ-Schnakenberg, M=64, dt=2e-6
(`d·dt/dx²=0.33<0.5`), d=40, a=0.1, b=0.9. Stable finite fields; spot count scales with γ
(γ≈2000 → 3 evenly-spaced spots at 120°). γ behaves like meristem size → ramping γ = growth.

**Finding — 1-D ring gives WHORLS, not a spiral.** Ramping γ on a 1-D ring reorganises the whole
pattern globally (period-doubling), not one-spot-at-a-time insertion. Spiral phyllotaxis is
intrinsically 2-D OR needs threshold-gated temporal nucleation.

**BREAKTHROUGH — threshold-gated nucleation produces a CLEAN single spiral.** Continuous
Douady-Couder: primordia advect outward at constant velocity `v`; inhibitor is finite-range
`exp(-d/λ)`; a new primordium nucleates at the rim angle of least inhibition **only when that
minimum drops below threshold `T`** (a gap has opened) → sequential, one-at-a-time. At
`λ=0.5, v=0.01, T=1.0, R0=1, samples=1440`:

```
mean = 137.5°, spread = 1.6°, raw deltas = 138 136 139 136 138 138 136 139 136
```

First clean golden-angle spiral in the whole arc — no 137.5 constant anywhere; it EMERGES.
Threshold-gating is the missing ingredient the geometric global-argmin models lacked.

**CAVEAT — multistable / resolution-fragile.** At the SAME params with samples=2880 the result
flips to 128° (multijugate, spread 42°); `v=0.012` gives a clean 100° lock (spread 2.4°). The
golden-angle basin is narrow and competes with multijugate/other clean locks. (This multistability
is real phyllotaxis physics, not just a bug — but it means we don't yet have a _robust_ generator.)

**Next hypothesis — Fibonacci cascade for basin selection.** The known way to reliably reach 137.5
is to adiabatically ramp the control parameter (here: shrink λ relative to spacing, or grow the rim)
SLOWLY from a low value, so the system follows the 1→2→3→5→8→13 parastichy branch onto the golden
attractor. Also try LOCAL-continuation nucleation (nucleate at the local min nearest the spiral
front) instead of global argmin, to stop basin-jumping. Verify robustness across seeds AND angular
resolution (the resolution test is the falsifier — a robust result must be sample-count-independent).

**Status:** a model that CAN produce a clean emergent 137.5° spiral now exists; reliable
golden-angle basin selection (cascade) is the remaining open problem. Resume here.

### Cascade result — fragility SOLVED; now a Fibonacci-vs-Lucas branch problem

Ramping the advection velocity `v` high→low (Douady-Couder control parameter Γ∝v) along the run
makes the result **robust**: `λ=0.5, v:0.04→0.008, T=1.0` gives a clean spiral that is **identical
at samples=1440 AND 2880 AND across seeds** (102°, spread 12°). The resolution-fragility from the
fixed-`v` model is gone — the cascade locks a single reproducible attractor.

BUT it lands on **~102° ≈ the Lucas angle (99.5°)** — the well-known _secondary_ phyllotactic branch
— not the Fibonacci 137.5°. So the model robustly follows a real parastichy branch; the open problem
narrowed from "noisy/multistable" to "select the **Fibonacci** branch vs Lucas." Branch selection is
set by the early transient / cascade gentleness (Fibonacci needs the slowest, most gradual order
increase from the first 2-3 primordia). Next: sweep gentler/power-curve `v`-ramps + `λ` for a ramp
that catches 137.5 robustly at both resolutions; if the early transient is the lever, seed the first
two primordia spacing from the dynamics (not a constant) to bias onto the Fibonacci attractor.

This is a real, citable arc: **emergent phyllotaxis with reproducible Fibonacci/Lucas branch
selection via a reaction-diffusion cascade.** Resume at the Fibonacci-branch sweep.

### SOLVED (2026-06-02) — robust emergent golden angle + wired into the flower

Instrumenting the early transient showed every config starts `180 90 180 90…` — a symmetric
**decussate lattice** (global-argmin fills opposite/perpendicular gaps), never a spiral. Three
additions fixed it, verified with the resolution-falsifier:

1. **THRESHOLD-gated nucleation** — sequential one-at-a-time primordium formation.
2. **CHIRALITY** — search the gap AHEAD of the most recent primordium (fixed handedness, as real
   meristems have); breaks the decussate symmetry onto a single spiral.
3. **PARABOLIC sub-sample refinement** of the inhibition minimum — removes discrete-argmin error,
   making the angle resolution-independent (this was the whole source of the earlier fragility).

Result (`λ=0.5, v=0.025, T=1.0, window [80°,230°]`): **137.43° ± 2.7°, BYTE-IDENTICAL at samples
720/1440/2880 and across seeds.** Shipped as `simulateLotusPhyllotaxis()` in core (commit
`5887d2ca4`, 4 dedicated tests). Then **wired into the proof flower** (commit `121ca7920`):
`buildLotusSceneFromComposition` derives every petal angle from the simulation (with a 60-primordium
warmup past the establishment transient); the compiled 42-petal scene now has an emergent all-42
divergence of **137.59°** — no `index*137.5` formula anywhere.

**Status: DONE for placement (L1).** The proof flower is authored in HoloScript → compiled to R3F →
its phyllotaxis is GROWN by a deterministic developmental simulation. Remaining for the full L2+:
emergent _form_ (petal shape + bloom unfurling from differential growth + turgor), still keyframed.
The placement simulation + this writeup are the foundation for that next phase.
