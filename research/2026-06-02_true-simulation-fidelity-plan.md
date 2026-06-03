# True Simulation & Reality — Fidelity Closure Plan

**Date:** 2026-06-02
**Author:** claude (full-surface)
**Status:** PLAN (founder-reviewable architecture direction; not yet executed)
**Vehicle:** the papers-program proof lotus (I.007), generalized to the simulation-first thesis (D.007/D.057/U.002 — digital twin before physical twin; the receipt IS the product).

---

## 0. The reframe that changes the plan

A subagent inventory of `packages/engine/src/simulation/` found that **HoloScript already ships a real continuum-mechanics solver suite**, dispatched through a factory and wrapped by a provenance contract:

| Capability | Implementation | Verdict |
|---|---|---|
| FEM linear elasticity | `StructuralSolverTET10.ts` (10-node quad tets, Gauss quadrature, GPU CG via `SparseLinearSolver`) | REAL |
| Heat equation | `ThermalSolver.ts` (FD, explicit/implicit, CFL-gated, GPU stencil) | REAL |
| Incompressible flow | `NavierStokesSolver.ts` (Chorin projection, semi-Lagrangian advection) | REAL |
| SPH fluid | `physics/FluidSim.ts` | REAL |
| Deformable bodies | `PBDSolver.ts` (GPU WGSL: distance/volume/bending/collision constraints) | REAL |
| Reaction-diffusion | `ReactionDiffusionSolver.ts` (registered `'reaction-diffusion'`) | REAL (assumed — unread) |
| Poroelasticity | `HydraulicSolver.ts` (registered `'hydraulic'`) | UNKNOWN — unread |
| FDTD / MD / MLS-MPM / Multiphase / Acoustic / Affinity-ODE | registered in factory | UNKNOWN — unread |
| Provenance contract | `SimulationContract.ts` — 5 scales (quantum/atomistic/meso/continuum/surrogate), per-scale tolerance, CAEL hash-chain receipts, deterministic replay | REAL |
| Paid GPU execution | `sim_run_paid` | **PARTIALLY REAL** — has a synthetic-result fallback when the Python solver subprocess is unavailable (OVERCLAIM) |

**Consequence.** The lotus's honest ceiling is **not** because the physics doesn't exist — the engine suite is real. The path is: wire/extend the real solvers, build the genuinely-missing physics, close the provenance holes, ground against reality.

---

## §0.5 PHASE A RESULTS — verified solver-truth ledger (2026-06-02)

Phase A executed: 3 whole-file `/deep-ratchet` audits + empirical test run (**55/55 solver tests pass**). Findings reshape the plan — corrections marked **A-VERIFIED** below.

| Solver | Verdict | Method (code-confirmed) | Caveat |
|---|---|---|---|
| StructuralSolver (TET4) | **REAL** | constant-strain tet, matrix-free Jacobi-PCG | linear only |
| StructuralSolverTET10 | **REAL** (strongest) | quadratic tet, 4-pt Gauss, CSR, GPU/CPU CG, **+ genuine Newton-Raphson St.Venant-Kirchhoff nonlinear path** | — |
| ThermalSolver | **REAL** | FD heat eq, CFL-gated explicit/implicit Jacobi | — |
| NavierStokesSolver | **REAL** | Chorin projection, semi-Lagrangian advection, Jacobi pressure-Poisson | tests boundedness-smoke, not convergence |
| MultiphaseNSSolver | **REAL** | level-set + CSF surface tension + variable-ρ Poisson | trivial smoke tests; 1000:1 ρ ratio deferred |
| ReactionDiffusionSolver | **REAL** (best-tested) | Strang split + **Dormand-Prince adaptive RK4/5** + Arrhenius mass-action | genuine physics asserts |
| HydraulicSolver | **REAL method / OVERCLAIMED framing** | Hardy-Cross + Darcy-Weisbach **pipe-network hydraulics** | **NOT Biot poroelasticity, not even Darcy porous flow** |
| FDTDSolver | **REAL** | Yee grid + Roden-Gedney **CPML** | one dead-code bug (harmless) |
| MolecularDynamicsSolver | **REAL** | LJ + velocity-Verlet + Berendsen | O(N²) |
| AcousticSolver | **REAL** | leapfrog wave eq + Engquist-Majda ABC | — |
| AffinityODESolver | **REAL** (ODE integrator) | RK4 Strogatz-Rinaldi + Sternberg + Nash | phenomenological social model |
| SimulationContract | **REAL** | 5-scale taxonomy, per-scale envelopes, CAEL provenance, cross-scale commutativity `ε_total=max(ε_field,ε_scale)` | — |

**Three plan-reshaping corrections (the value of running Phase A first):**
1. **`core → engine` dependency inversion.** The lotus trait is in `@holoscript/core`; solvers are in `@holoscript/engine`. Core cannot depend on engine, so **the lotus trait cannot directly consume the engine solvers** — and its own `createLotusMorphogen2D` (this session's 2-D Turing field) is REAL and *correct by package-graph*, not a toy that "should have used the engine." High-fidelity solving must happen at an engine-capable layer (renderer/studio/compose). **Rewrites Phase B.**
2. **Poroelastic turgor has NO existing solver.** `HydraulicSolver` is pipe-network hydraulics, not Biot poroelasticity (grep `Biot`/`poroelast` → zero implementations); the lotus turgor is a standalone 2-ODE relaxation that never calls it. Real poroelastic turgor is a **BUILD (new Biot solver)**, not a wire. **Rewrites Phase D2.**
3. **FEM is not yet reality-validated, and `sim_run_paid` is a synthetic stub.** The audited `NAFEMS-LE1.test.ts` only console-logs the 92.7 MPa reference (never asserts it); real validation (`paper-nafems-le1*.test.ts`) carries a **known ~52% residual gap** (open work). `sim_run_paid` self-documents OVERCLAIM (ratchet-P4): the Python executor `scripts/sim_solver_executor.py` is **absent**, so it always returns `billable_seconds = estimate*0.8 // placeholder`. The suite-wide weakness is **verification rigor** (boundedness-smoke tests), not implementation. **Expands Phase F.**

Corrected five-step framing:
1. **Wire/extend real engine solvers** at the engine-capable layer (not inside the core trait).
2. ~~Verify the unread solvers~~ — **DONE (ledger above)**.
3. **Build the genuinely-missing physics** (morphoelastic growth *extends* the real TET10 nonlinear path; Biot poroelasticity is *new*; mechanistic GRN transport is *new*).
4. **Close the provenance holes** (`sim_run_paid` stub; smoke→convergence tests; NAFEMS residual gap).
5. **Ground against reality** (botanical/material data, hardware-anchored receipts).

---

## 1. Fidelity ladder (what "true" means, level by level)

| Level | State | Lotus example | Platform meaning |
|---|---|---|---|
| **L0** | Reduced-order toy, in-trait, deterministic, render-driven | current: 1-D meristem, 2-D Schnakenberg pod, wave pond, kinematic turgor | "looks like" |
| **L1** | Real engine solvers wired, every run emits a CAEL receipt | RD pod → `ReactionDiffusionSolver`; pond → `NavierStokesSolver`/SPH; petal → `PBDSolver` | "is computed, and provably ran" |
| **L2** | 3-D volumetric domains; morphoelastic growth (growth tensor in FEM) | petal = tetrahedral tissue that grows differentially and buckles under its own residual stress | "is continuum-mechanically real" |
| **L3** | Mechanistic biology, not phenomenology | primordia from auxin/PIN polar-transport GRN (not a Turing analogue); turgor = poroelastic (`HydraulicSolver`) | "is biophysically causal" |
| **L4** | Coupled multiphysics under one contract | growth ⇄ tissue mechanics ⇄ auxin transport ⇄ pond fluid, one deterministic stepper, cross-scale commutativity envelope | "is a coupled digital twin" |
| **L5** | Validated against measured reality + hardware-anchored | golden angle, parastichy counts, bloom kinematics, Young's modulus/turgor pressures matched to botanical literature; receipts OTS/Base-anchored | "is a *trustworthy* twin — the receipt is the product (D.057)" |

The lotus is the proving ground; every rung is a reusable platform capability (a regulated, replayable, receipt-bearing solver path — D.057).

---

## 2. Workstreams, sequenced

### Phase A — Reality audit (no new physics; ~1–2 sessions)
**Goal:** know exactly what's real before building on it. Classic F.104/F.110.
- **A1.** `/deep-ratchet` the registered-but-unread solvers: `HydraulicSolver`, `ReactionDiffusionSolver`, `MultiphaseNSSolver`, `MolecularDynamicsSolver`, `FDTDSolver`, `MLSMPMFluid`, `AcousticSolver`, `AffinityODESolver`. Per-solver verdict REAL/THIN/OVERCLAIMED with file:line. Output: a solver-truth ledger.
- **A2.** Read `SimulationContract.ts` fully: scale tiers, tolerance envelopes, `CommutativityProfile`, receipt schema (`cael.v1`). Confirm the determinism + geometry-hash guarantees actually hold.
- **A3.** Confirm the `sim_run_paid` synthetic-fallback OVERCLAIM (`simulation-billing-tools.ts:71-75`) and scope its fix (fail-loud instead of returning synthetic results when the real solver is absent).
- **Falsifier:** A1 ledger must cite real assembly/stepping code per solver, not registration. A "registered" solver with a stub body is a finding, not a capability.

### Phase B — Run real solvers at the engine-capable layer (L0→L1; engineering)
**A-VERIFIED reframe:** the engine solvers are real, but `BotanicalLotusTrait.ts` lives in `@holoscript/core` and **cannot import `@holoscript/engine`** (dependency inversion). So we do NOT replace the in-trait solvers with engine calls inside the trait. Instead the **renderer/compose layer** (`services/holoscript-net/.../LotusProgram.tsx`, which already depends on engine-capable code) drives the engine solver, and feeds resulting geometry/fields to the core trait. The core trait keeps its lightweight deterministic solvers (the `createLotusMorphogen2D` shipped this session is REAL and correct-by-layer) as the trait-level path; the engine path is the high-fidelity, receipt-bearing one.
**Goal:** each high-fidelity lotus subsystem is solved by an engine solver at the render/compose layer, emitting a CAEL receipt.
- **B1. Seed pod** → engine `ReactionDiffusionSolver` (REAL: Dormand-Prince adaptive RK4/5 + Arrhenius mass-action) at the render layer, expressing Schnakenberg as mass-action. The core `createLotusMorphogen2D` remains the trait-layer fallback. *Note: this is a fidelity/receipt upgrade, not a correctness fix — the core 2-D solver is already real.*
- **B2. Pond** → `NavierStokesSolver` free-surface or `MLSMPMFluid`/SPH replaces the wave-equation height field. (Decision in B: NS height-field-coupled vs MPM free-surface — pick on A1 verdicts + perf.)
- **B3. Petal** → `PBDSolver` (GPU, real) replaces kinematic turgor curvature: petal = a constrained deformable sheet; turgor = a pressure/volume constraint.
- **B4.** Every lotus solve goes through `SimulationContract.solve()` so it records config+result+timing and yields a replayable `cael.v1` receipt. Wire `/journalist` to verify one receipt end-to-end.
- **Falsifier:** a `/journalist` pass on a captured receipt must replay bit-identically; geometry hash (solver mesh) must equal render mesh hash.
- **Note on live render:** the engine solvers may be too heavy for 60fps in-browser. Strategy: **solve at design/build time → bake receipt + trajectory → render replays the receipt**, with a "live" low-res path for the visible loop. This is honest *if* the receipt is the authority and the live path is labeled. (Resolves the earlier "live vs baked" tension correctly: baked-from-a-real-solver-with-a-receipt beats live-toy.)

### Phase C — 3-D + morphoelastic growth (L1→L2; research + build)
**Goal:** the petal is a real 3-D tissue that grows and self-shapes; the bloom is the mechanical consequence of differential growth, not a curve.
- **C1.** Volumetric petal mesh (tetrahedralize via the registered TetGen WASM mesher).
- **C2.** **Morphoelasticity:** multiplicative growth-tensor decomposition F = Fe·Fg in the FEM elasticity solver — growth Fg prescribed by a maturation field, elastic Fe carries residual stress; the petal curls/opens because growth incompatibility buckles it. This is the citable research core. Extends `StructuralSolverTET10` (nonlinear/incremental).
- **C3.** Acropetal growth front drives Fg over time → emergent unfurl kinematics.
- **Falsifier:** bloom kinematics (tip angle vs time, curvature distribution) emerge from the growth field with **no keyframe curve anywhere**; remove every hand-authored bloom constant.
- **Paper candidate:** "Morphoelastic petal bloom: emergent floral kinematics from differential growth" — feeds the papers program.

### Phase D — Mechanistic biology (L2→L3; research)
**Goal:** replace phenomenological pattern rules with causal biology.
- **D1.** **Auxin/PIN polar-transport GRN** for primordium initiation (Jönsson/Meyerowitz-class model) replacing the inhibitor-field/Turing analogue: auxin maxima self-organize via active polar transport on the growing meristem; the golden angle and Fibonacci parastichies emerge from transport dynamics, not a chiral search rule.
- **D2.** **Poroelastic turgor — BUILD a new Biot solver (A-VERIFIED: no existing solver fits).** `HydraulicSolver` is pipe-network hydraulics, not poroelasticity; nothing in the engine implements Biot coupled flow-deformation. So D2 is a genuine new engine solver: Biot consolidation (pore-pressure diffusion ⇄ effective-stress deformation) coupling water uptake → turgor pressure → tissue inflation, two-way coupled to C2's morphoelastic mechanics. Turgor stops being a scalar ODE. *Larger than originally scoped — promote to its own tracked research+build task.*
- **Falsifier:** divergence angle + parastichy counts are sampled outputs of the transport+growth simulation across seeds/resolutions, reproducible, and match botanical ranges; no `137.5` and no chiral-window constant anywhere.
- **Paper candidate:** "Emergent phyllotaxis from coupled auxin transport and meristem growth" (advances the existing `2026-06-02_lotus-emergent-phyllotaxis.md` arc from geometric to mechanistic).

### Phase E — Coupled multiphysics under one contract (L3→L4; research + build)
**Goal:** one deterministic stepper couples growth ⇄ mechanics ⇄ transport ⇄ fluid; the pond responds to the flower and vice-versa.
- **E1.** A coupling scheduler (operator-splitting / staggered) over the engine solvers, all sharing `SimulationContract` time + provenance.
- **E2.** Cross-scale commutativity: use the contract's `CommutativityProfile` (ε_total = max(ε_field, ε_scale)) to bound coupling error and *prove* the coupled run is within tolerance.
- **Falsifier:** swapping coupling order changes the result by < the contract's stated ε; receipt records the coupling graph.
- **Paper candidate:** "Verifiable coupled multiphysics for digital twins" — directly the D.057 regulated-orchestration thesis.

### Phase F — Provenance integrity + reality grounding (L4→L5; cross-cutting)
**Goal:** make "real" provable and grounded, not asserted.
- **F1. ✅ DONE (2026-06-02).** `sim_run_paid` (local dispatch) now runs the REAL solver via `handleSimulationTool`, bills the MEASURED wall time (capped), and **fails loud** when the solver doesn't run — no more synthetic `estimate*0.8` placeholder, no more silently-swallowed solver failures. New test asserts fail-loud on an invalid mesh. The synthetic block survives only for the still-unwired `fleet` path (THIN, documented). `packages/mcp-server/src/simulation-billing-tools.ts` + test; 13/13 green.
- **F1b.** Upgrade the suite-wide **verification rigor** gap: NS/Multiphase tests assert boundedness, not analytical convergence; close the `paper-nafems-le1*` **~52% residual gap** (proper symmetry BCs). Implementation is real; *validation* is the open weakness.
- **F2.** Anchor lotus/twin receipts (OTS + Base; cost ~$0.0007/tx per F.050) so a run's provenance is third-party-verifiable (provenance-class, W.677).
- **F3.** **Reality bridge:** validate the digital twin against measured botanical/material data (golden angle 137.5°, Young's modulus, turgor pressures, bloom timelapse). This is the simulation→physical-twin closing of U.002/D.007.
- **Falsifier:** a `/journalist` + `/deep-ratchet` quartet pass on the full pipeline with anchored receipts; every "real X" claim cites running code + a replayable receipt.

---

## 3. What this is NOT (Excludes)
- **Not** a rewrite of the engine solvers — they exist; we wire, extend (morphoelasticity, GRN), and verify them.
- **Not** a claim that the lotus needs molecular dynamics or quantum scales — those tiers exist in the contract but are out of scope for a flower (the *taxonomy* matters; using MD here would be theater).
- **Not** 60fps full-fidelity in-browser — heavy solves are design-time + receipt-replayed; the live loop is an honestly-labeled low-res path.
- **Not** founder-gated except where it crosses the four protected classes (F.095): GPU spend for large solves (treasury), on-chain anchoring spend, public paper claims under Joseph's name. Everything else is agent-decided (§0).

## 4. What Remains (open research, not just engineering)
- Morphoelastic growth-tensor stability at large growth strains (C2) — incremental/Newton schemes, mesh tangling.
- Auxin-transport GRN parameter regime that robustly selects Fibonacci over Lucas (D1) — continues the open branch-selection problem already documented in the phyllotaxis note.
- Two-way poroelastic↔morphoelastic coupling convergence (D2/E1) — and the Biot solver itself is now a build, not a wire.
- ~~Whether the engine solvers are production-real~~ — **RESOLVED Phase A: all 11 REAL, 55/55 tests pass.** The residual open item is *validation rigor* (smoke→convergence, NAFEMS ~52% gap), not implementation.

## 5. How this fails (premortem seeds — to harden via `/premortem` before execution)
- **A1 finds the "real" solvers are thin.** Then Phase B has no foundation and the plan silently becomes "build 4 solvers." Mitigation: A1 is a hard gate; re-scope publicly if THIN (no silent cap, F-rule).
- **Engine solvers can't hit interactive perf even at low-res.** Mitigation: receipt-replay is the default; live path is cosmetic and labeled.
- **Morphoelasticity is a multi-month research project, not a session.** Mitigation: treat C/D/E as tracked research tasks with falsifiers, not chat-turn brute force (same discipline the phyllotaxis note already adopted).
- **"Real solver" receipts that nobody replays.** Mitigation: `/journalist` replay is the acceptance test for every phase, not an afterthought.
- **Scope creep into the whole platform.** Mitigation: the lotus is the single vehicle; platform generalization is a *consequence*, not a parallel workstream.

## 6. First moves (Phase A, claimable now)
1. File Phase-A tasks to the board (`/room add-tasks`): A1 solver `/deep-ratchet`, A2 contract read, A3 `sim_run_paid` OVERCLAIM scope.
2. Run `/premortem` + `/critic` on **this plan** before opening Phase B (expensive-architecture gate — CLAUDE.md doctrine).
3. Execute A1 (`/deep-ratchet` the 8 unread solvers) — the truth ledger that everything downstream depends on.

---

*Lotus L0→L1 wiring (Phase B) is the cheapest high-signal proof. But A1 (are the solvers real?) is the true unblock — do not build Phase B on an unaudited foundation (F.110).*
