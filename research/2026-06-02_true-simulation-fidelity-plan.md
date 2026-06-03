# True Simulation & Reality — Fidelity Closure Plan

**Date:** 2026-06-02
**Author:** claude (full-surface)
**Status:** PLAN — GATE-HARDENED (Phase A done; `/premortem`+`/critic` gate run + findings repo-verified 2026-06-02, see §0.6). Phase B BLOCKED on A.5 + B0. Not yet executed past A.
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
1. **`core → engine` dependency inversion.** The lotus trait is in `@holoscript/core`; solvers are in `@holoscript/engine`. Core cannot depend on engine, so **the lotus trait cannot directly consume the engine solvers** — and its own `createLotusMorphogen2D` (this session's 2-D Turing field) is REAL and *correct by package-graph*, not a toy that "should have used the engine." High-fidelity solving must happen at an engine-capable layer (renderer/studio/compose). **Rewrites Phase B.** **⚠️ GATE-CORRECTED (§0.6, 2026-06-02):** this is *imprecise* and was overstated. `packages/core/package.json` declares `@holoscript/engine` as an **optional `peerDependency`** (lines 301–311, `peerDependenciesMeta.optional`) + a devDependency (329); `engine→core` is the hard edge (engine "extracted from core"). The real constraint is "core must not **hard**-depend on engine (cold-install gate W.681); optional-peer / type-only consumption is permitted." This reopens an in-trait `solveHighFidelity(engineModule?)` optional-peer seam as a legitimate Phase B option — see §0.6.
2. **Poroelastic turgor has NO existing solver.** `HydraulicSolver` is pipe-network hydraulics, not Biot poroelasticity (grep `Biot`/`poroelast` → zero implementations); the lotus turgor is a standalone 2-ODE relaxation that never calls it. Real poroelastic turgor is a **BUILD (new Biot solver)**, not a wire. **Rewrites Phase D2.**
3. **FEM is not yet reality-validated, and `sim_run_paid` is a synthetic stub.** The audited `NAFEMS-LE1.test.ts` only console-logs the 92.7 MPa reference (never asserts it); real validation (`paper-nafems-le1*.test.ts`) carries a **known ~52% residual gap** (open work). `sim_run_paid` self-documents OVERCLAIM (ratchet-P4): the Python executor `scripts/sim_solver_executor.py` is **absent**, so it always returns `billable_seconds = estimate*0.8 // placeholder`. The suite-wide weakness is **verification rigor** (boundedness-smoke tests), not implementation. **Expands Phase F.**

Corrected five-step framing:
1. **Wire/extend real engine solvers** at the engine-capable layer (not inside the core trait).
2. ~~Verify the unread solvers~~ — **DONE (ledger above)**.
3. **Build the genuinely-missing physics** (morphoelastic growth *extends* the real TET10 nonlinear path; Biot poroelasticity is *new*; mechanistic GRN transport is *new*).
4. **Close the provenance holes** (`sim_run_paid` stub; smoke→convergence tests; NAFEMS residual gap).
5. **Ground against reality** (botanical/material data, hardware-anchored receipts).

---

## §0.6 GATE RESULTS — `/premortem` + `/critic` hardening (2026-06-02)

Per §6.2 (expensive-architecture gate), both ran on this plan after Phase A. Findings below were **each cross-checked against the repo this session** (files cited). The audit (Phase A) earned trust; the *forward plan* had re-introduced overclaim and is corrected here. **These amendments are binding; inline `⚠️ GATE-CORRECTED` markers above point back here.**

**Verified findings (repo-cited):**
1. **Phase B's foundation was false.** `services/holoscript-net` has **no** `@holoscript/engine` dep (only core/mcp-server/r3f-renderer/runtime); `LotusProgram.tsx` imports core+three only. "Render layer already depends on engine-capable code" is false. → **B0 below.**
2. **"Core cannot depend on engine" is imprecise.** core→engine is a *declared optional `peerDependency`* (`core/package.json:301-311`); the real rule is "no **hard** dep (W.681 cold-install gate)." Reopens an in-trait optional-peer seam as a B option.
3. **NAFEMS validation is illusory.** `paper-nafems-le1.test.ts:405` gates only `tet10.error < tet4.error` (relative); 92.7 MPa never asserted. The ~52% gap is a **correctness signal**, not rigor. → **A.5 below; F1b corrected.**
4. **C2 morphoelasticity & D2 Biot are BUILDs, not "extends."** Zero growth-tensor code; TET10 is St.Venant-Kirchhoff geometric nonlinearity. Both need analytical-benchmark falsifiers (bilayer critical-growth; Terzaghi 1-D). → corrected inline.
5. **`createLotusMorphogen2D` is tested-but-unwired** (called only from tests) — not a live "trait-level path." → corrected inline.
6. **fleet billing path still returns synthetic `success:true`** — the path the expensive phases need. Treasury-class. → F1 corrected.

**New binding phases / amendments:**

- **A.5 — ✅ RESOLVED (2026-06-02). Root cause = stress-EXTRACTION method, NOT the solver (F.110 vindicated).** The `StructuralSolverTET10` was computing correct stresses all along; `paper-nafems-le1.test.ts` sampled them with `extractCauchyComponentNearPoint(..., searchRadius=0.5)` — a fixed-radius element-centroid **ball average** around point D=(2,0). At a boundary stress *concentration*, that converges to the field's spatial average over the ball (~45 MPa), NOT the edge peak (92.7) — hence the flat ~51.5% mesh-converged error. **Fix: wired the codebase's already-present but unused Superconvergent Patch Recovery** (`verification/StressRecovery.ts` `recoverNodalStressSPR`, Zienkiewicz–Zhu — the solver already stored `gaussPointStress`/`gaussPointCoords` for exactly this) to recover σ_yy at node D. **Result: TET10 finest-mesh error 51.5% → 1.20%, monotonically converging (4.11→2.49→1.62→1.20%), GCI 156.8% → 1.83%, Richardson est. 92.44 MPa (0.28% off).** Replaced the relative-only assertion (line 405) with **5 absolute gates**: accuracy ≤5%, monotone convergence, GCI <5%, Richardson agreement, TET10≫TET4. **Correction to my own plan: the speculative "observed order ≥~1.8" sub-criterion was WRONG** — point-stress convergence *at a concentration* is genuinely sub-quadratic (measured ~0.89) even with SPR; the right evidence is absolute error + monotone + low GCI, which the data provides. TET4 stays poor (~83%, expected: constant-strain tets can't resolve a concentration) and is the honest baseline. **FEM stress validation floor is now REAL — Phases C/D/E unblocked on the validation axis; NAFEMS LE1 may now be cited as validated (F.037).** (Historical measured table below, pre-fix:)

- ~~**A.5 (NEW, BLOCKING — before Phase B). ⚠️ MEASURED THIS SESSION — the gap is SYSTEMATIC, not residual.**~~ Ran `paper-nafems-le1.test.ts`; σ_yy at point D (ref **92.7 MPa**), Roller BCs:
  | mesh h | TET4 σ_yy / err | TET10 σ_yy / err |
  |---|---|---|
  | 0.2500 | 5.47 / 94.10% | 44.22 / 52.30% |
  | 0.1250 | 11.37 / 87.73% | 45.25 / 51.18% |
  | 0.0830 | 13.53 / 85.40% | 44.78 / 51.69% |
  | 0.0625 | 16.27 / 82.45% | 44.93 / 51.53% |
  | **GCI** | **789.82%** | **156.80%** |

  **TET10 converges to ~45 MPa (~49% of reference) and refinement does NOT close the gap (error flat ~51.5%).** A mesh-converged answer wrong by half = a **systematic error** (stress extraction / symmetry-BC modeling / curved-boundary point-load approximation per `paper-nafems-le1.test.ts:283-285,304`), **not** discretization. The §0.5 "TET10 REAL (strongest)" verdict holds for the *linear-solve machinery* but its *benchmark stress output* is wrong by half. **A.5 is now a CORRECTNESS INVESTIGATION:** find the systematic source, fix it, then add the absolute-tolerance gate (finest-mesh TET10 σ_yy within ≤5% of 92.7 MPa). **Phases C/D/E DO NOT OPEN until green** — C2 morphoelasticity is built on this exact solver, so a ~50% stress bias would propagate into every residual-stress/buckling result. Suspect METHOD first (F.110). **No paper may cite NAFEMS LE1 as validated (F.037).**
- **B0 (NEW — before B1).** Establish + *prove* one engine-capable execution site. Candidates, pick by measured cost: (a) add `@holoscript/engine` to `holoscript-net` and prove it builds for the target; (b) **[recommended]** build-time `scripts/compile-lotus-scene.mts` → engine solves, bakes receipt+trajectory, browser replays (the honest "baked receipt" seam, sidesteps browser-bundle); (c) MCP-server tool dispatch — **only if** the receipt replays bit-identically from a **cold checkout with no mcp-server / no Railway / no network**. **Hard acceptance: a Phase-B receipt must replay bit-identical from a clean checkout with no services up** — else the D.057 provenance chain has a hole.
- **Cost column (NEW — W.314 decoder-cost).** Add an asymptotic-class + measured-wall-time-at-figure-resolution + 10×-mesh-scaling cell to the L0→L5 table and every C/D/E falsifier. A physically-beautiful but computationally-undeployable coupled stepper is a finding *before* building it (cf. MD's O(N²), already scoped out — apply the same rigor to the solvers we DO use).
- **Cycle guard (NEW).** Any Phase B/C cross-package import edit must pass `pnpm install --frozen-lockfile && pnpm -r build` before commit — a bundle break ships off the shared lockfile to every service (CLAUDE.md ship-path; W.681).
- **Ladder reframe.** L0→L5 is **one research arc with ~3 papers at the END** (dependency chain C2→D2→E), NOT 3 parallel paper tracks. L1→L2 is the real cost cliff (engineering→research), not an even rung.
- **L5 dataset (UNVERIFIED — highest-risk open assumption).** Name the citable quantitative *Nelumbo* dataset (petal Young's modulus, turgor pressure, bloom timelapse) **now**, or L5 is unreachable for this vehicle. Research check before L5 is promised.

**Next gate (post-B0):** re-run `/premortem` on the *revised* plan; `/journalist` to verify a real-solver receipt replays per line-95; `/deep-ratchet` once C2 has code; `/stub-audit` on new Biot/GRN traits.

---

## §0.7 FORWARD-SEQUENCE PREMORTEM — bigger-builds plan (2026-06-02)

A second `/premortem` ran on the *forward sequence* (the bigger builds past B0/B1-seam), repo-verified. It restructured the path and surfaced two facts that move the cheapest next build. Binding.

**Foundations now REAL on origin/main (this session):** A.5 SPR validation floor (`003b1262a`), B0 engine execution-site + createReplay fidelity fixes (`b0447893a`), fleet billing **fail-loud** (`d2b85457f`), B1 build-time seam — engine RD seed-pod under contract, deterministic + replayable receipt (`7ff229555`).

**Two repo-verified findings that reshape the sequence:**
1. **RD diffusion is a SILENT NO-OP in 2D — the real reason B1's bake was homogeneous (corrects the earlier "W.314 cost wall" diagnosis).** `ReactionDiffusionSolver.stepDiffusion` loops the 3-D interior `for (k=1; k<nz-1)`; on the lotus 2-D pod (`nz=1`) that loop is **empty**, so diffusion never runs — the perturbation decays via reaction only, with zero spatial coupling (the flat field observed). `ThermalSolver.stepImplicit`/`jacobiIteration` are likewise 3-D-interior-only. So Step 1 is not "add implicit diffusion to a working 2-D solver" — **2-D diffusion is absent entirely** and must be built (with no-flux BCs), *then* made implicit for the stiff regime. The W.314 explicit-CFL cost wall is still real for 3-D high-`d`, but it was NOT why the 2-D bake stayed flat.
2. **The fleet synthetic-billing hazard is already CLOSED** (`d2b85457f`, fail-loud `else` + test). The premortem's "fleet still synthetic" risk is stale.

**Hardened sequence (split at the L1→L2 engineering/research cliff §0.6 named):**
- **Step 1 (cheapest high-signal, RD-only):** make RD diffusion correct in 2-D (no-flux), then add an **implicit** (backward-Euler Jacobi) branch for the stiff regime. **Test-first, biting falsifier:** an analytical diffusion decay (single Fourier mode → `exp(-D k² t)`) validated **at canonical stiff params (`d=40`) and a `dt` past the explicit CFL limit**, asserting Jacobi actually converged — NOT "agrees with the explicit path" (that only tests the cheap regime — the premortem's #1 failure). Port the `jacobiIteration` pattern from `ThermalSolver` but make it 2-D-aware. Add W.314 cost cells.
- **Step 2:** saturate the seed-pod pattern on the fixed solver; bake the receipt-bearing field. **Render-consumption is collision-gated** — `services/holoscript-net/lotus-preview.tsx`/`LiquidBlobBackground.tsx` are live untracked peer files; `/room`-coordinate the baked-field interface (path+schema) before wiring, `git log -- services/holoscript-net/lotus-*` before every commit. **Stop the committed sequence here.**
- **HARD GATE → research track (NOT "Step 3/4"):** Phases C (morphoelastic Fg in TET10), D (Biot vs Terzaghi; auxin/PIN GRN), E (coupling) re-enter as a *separately-budgeted, founder-gated, multi-agent* research track only after ALL of: (a) EXP-2 finetune GPU budget de-conflicted (it shares the founder-gate), (b) the analytical bilayer-buckling falsifier's mesh cost checked against local-vs-fleet routing (if fleet → GPU-founder-gated from move one), (c) implementer ≠ falsifier-verifier (a passing gate isn't author-marked). Naming them "next steps" re-introduces the even-rung framing §0.6 already killed and converts a multi-month research cliff into a false momentum promise.

**Cheapest high-signal next build, named:** Step 1 (2-D + implicit RD diffusion, stiff-regime analytical falsifier) → Step 2 (saturate + bake, peer-coordinated). No GPU, no founder-gate, no open research — a citable receipt-bearing platform win. Re-gate before anything past the cliff.

**Step 1 — ✅ DONE (`23ed5da37`).** Root cause confirmed + fixed: `ReactionDiffusionSolver.stepDiffusion` looped the 3-D interior, so 2-D (`nz=1`) diffusion was a **silent no-op** and 3-D boundaries were frozen. Rewrote it to loop ALL cells with **reflect (no-flux) boundaries** — porting the proven core Schnakenberg stencil — and added an **implicit backward-Euler Gauss-Seidel branch** (`diffusionMode: 'implicit'|'auto'`) for the stiff regime past the explicit CFL limit. Biting falsifier shipped (`reaction-diffusion-diffusion.test.ts`): a cosine eigenmode decays to analytical `exp(−Dπ²t)` in 2-D (catches the no-op) and under implicit at `dt` ≫ CFL (catches the stiff regime), + mass conservation. 3/3 green; existing RD suite 12/12 (no regression). **Consequence:** the B1 bake now SATURATES — engine seed-pod relAmp 516%, real Turing spots, deterministic + replayable receipt (`pnpm --filter @holoscript/net-service lotus:bake-seedpod`). The engine (receipt-bearing) path now matches what the core path already did. **Remaining for Step 2:** γ-tune spot count to a lotus-realistic ~10–30 carpels (cosmetic), then render-consumption — collision-gated, `/room`-coordinate with the lotus peer.

**Generative-coupling finding (audit reconciliation, 2026-06-02).** Verified the live render's seed pod is **genuinely generatively coupled**, not just motion-modulated: [`SeedPodDots`](../../services/holoscript-net/src/components/LotusProgram.tsx) places each carpel at `lotusMorphogen2DPeaks(field)` coordinates (`mesh position = seed.x/seed.y`) and scales it by the peak's activator value — carpel count/spacing **emerge from the Turing field**, not an authored ring. Per-frame `stepLotusMorphogen2D` + `lotusMorphogen2DSampleAt` then modulate each carpel's glow. So for the seed pod it's "the simulation grows the structure" (placement is field-generated, computed once from the warm-started field, then live-modulated). The CORE trait's `stepLotusMorphogen2D` is a correct 2-D Schnakenberg with reflect no-flux — **it is the working live path** and was the reference ported into the engine fix above. Frontier that remains: (1) **petal form** still baked (`simulateLotusMorphogenesis/Phyllotaxis` called 0× live); (2) **turgor drives transforms, not mesh deformation** (no morph targets / per-vertex writes); (3) the live generative placement runs the core path with **no receipt** — the engine path that would anchor it is now viable (Step 1 done).

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
**A-VERIFIED reframe — ⚠️ GATE-CORRECTED (§0.6, 2026-06-02): the premise below is FALSE and must not be executed as written.** The original reframe routed high-fidelity solves through the render layer "which already depends on engine-capable code." **It does not.** `services/holoscript-net/package.json` depends on `@holoscript/core`, `@holoscript/mcp-server`, `@holoscript/r3f-renderer`, `@holoscript/runtime` — **there is no `@holoscript/engine` dependency** (and its `build:server` tsup externalizes core+mcp-server, not engine); `LotusProgram.tsx` imports only `@holoscript/core/traits/botanical-lotus` + three/r3f. Engine is reachable only *transitively*. **Phase B therefore cannot start until B0 (§0.6) establishes a verified engine-capable execution site** — recommended: the build-time `services/holoscript-net/scripts/compile-lotus-scene.mts` seam (engine runs at build time → bakes receipt+trajectory → browser replays, which IS the line-96 "baked-from-real-solver" strategy and sidesteps the browser-bundle question). Also note: `createLotusMorphogen2D` is REAL+unit-tested but **called only from tests** — it is *not* wired into the trait's render path or `LotusProgram.tsx`, so it is a tested library function, not a live "trait-level path." (Original now-falsified text retained below for audit:)

> ~~the engine solvers are real, but `BotanicalLotusTrait.ts` lives in `@holoscript/core` and **cannot import `@holoscript/engine`** (dependency inversion). So we do NOT replace the in-trait solvers with engine calls inside the trait. Instead the **renderer/compose layer** (`services/holoscript-net/.../LotusProgram.tsx`, which already depends on engine-capable code) drives the engine solver, and feeds resulting geometry/fields to the core trait. The core trait keeps its lightweight deterministic solvers (the `createLotusMorphogen2D` shipped this session is REAL and correct-by-layer) as the trait-level path; the engine path is the high-fidelity, receipt-bearing one.~~
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
- **C2.** **Morphoelasticity — ⚠️ GATE-CORRECTED: this is a ground-up BUILD, not an "extend."** multiplicative growth-tensor decomposition F = Fe·Fg in the FEM elasticity solver — growth Fg prescribed by a maturation field, elastic Fe carries residual stress; the petal curls/opens because growth incompatibility buckles it. This is the citable research core. **`grep` for growth-tensor / morphoelast / Fe·Fg across `packages/engine/src` + `packages/core/src` returns ZERO.** TET10's nonlinear path (`StructuralSolverTET10.ts:1140-1161`) is **St.Venant-Kirchhoff geometric nonlinearity** (large-displacement elasticity), NOT growth kinematics. C2 = a NEW growth-kinematics layer (prescribed Fg, intermediate config, Fe=F·Fg⁻¹, stress from Fe only) bolted into the Newton residual + tangent — built *on top of* the existing assembly, scoped as research-grade BUILD. **Falsifier upgrade:** acceptance is a morphoelastic bilayer matching its *analytical* critical-growth buckling threshold — not a lotus picture. (No lotus image is acceptance for C2.)
- **C3.** Acropetal growth front drives Fg over time → emergent unfurl kinematics.
- **Falsifier:** bloom kinematics (tip angle vs time, curvature distribution) emerge from the growth field with **no keyframe curve anywhere**; remove every hand-authored bloom constant.
- **Paper candidate:** "Morphoelastic petal bloom: emergent floral kinematics from differential growth" — feeds the papers program.

### Phase D — Mechanistic biology (L2→L3; research)
**Goal:** replace phenomenological pattern rules with causal biology.
- **D1.** **Auxin/PIN polar-transport GRN** for primordium initiation (Jönsson/Meyerowitz-class model) replacing the inhibitor-field/Turing analogue: auxin maxima self-organize via active polar transport on the growing meristem; the golden angle and Fibonacci parastichies emerge from transport dynamics, not a chiral search rule.
- **D2.** **Poroelastic turgor — BUILD a new Biot solver (A-VERIFIED: no existing solver fits).** `HydraulicSolver` is pipe-network hydraulics, not poroelasticity; nothing in the engine implements Biot coupled flow-deformation. So D2 is a genuine new engine solver: Biot consolidation (pore-pressure diffusion ⇄ effective-stress deformation) coupling water uptake → turgor pressure → tissue inflation, two-way coupled to C2's morphoelastic mechanics. Turgor stops being a scalar ODE. *Larger than originally scoped — promote to its own tracked research+build task.* **Falsifier (GATE-added):** the Biot solver validates against **Terzaghi's 1-D analytical consolidation solution** before any lotus coupling — analytical anchor first, flower second.
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
- **F1. ✅ DONE (2026-06-02).** `sim_run_paid` (local dispatch) now runs the REAL solver via `handleSimulationTool`, bills the MEASURED wall time (capped), and **fails loud** when the solver doesn't run — no more synthetic `estimate*0.8` placeholder, no more silently-swallowed solver failures. New test asserts fail-loud on an invalid mesh. The synthetic block survives only for the still-unwired `fleet` path (THIN, documented). `packages/mcp-server/src/simulation-billing-tools.ts` + test; 13/13 green. **⚠️ GATE-FLAG (§0.6): the fleet path is the one the expensive phases need.** Phases C2/D2/E require *large* 3-D coupled solves that won't fit local and will route to `dispatch_mode: 'fleet'` — which still returns `success: true` with the synthetic `estimate*0.8` placeholder (`simulation-billing-tools.ts:184-205`). A paid path returning synthetic success is a **treasury-class hazard (F.095)**, not a THIN footnote. **Binding rule: before any GPU-spend phase, either wire fleet for real OR make `dispatch_mode:'fleet'` fail loud (`success:false, error:'fleet dispatch unwired'`).** F1 closed the path that didn't matter yet; this closes the one that will.
- **F1b. ⚠️ GATE-CORRECTED — the 52% gap is a CORRECTNESS signal, not a "rigor footnote," and it must move EARLIER (see A.5 in §0.6).** `paper-nafems-le1.test.ts:405` asserts **only** `tet10Data[3].error < tet4Data[3].error` (TET10 beats TET4 — *relative*); the 92.7 MPa reference is `console.log`'d, never gated. A run 52% off the canonical FEM benchmark **passes green today.** Because morphoelasticity (C2) is built on this same TET10, the validation floor must be made an **absolute-tolerance gate** (`expect(finest-mesh TET10 σ_yy rel error).toBeLessThan(0.05)` + observed order ≥ ~1.8) and the 52% treated as a correctness investigation (suspects: element-average stress extraction w/ coarse 0.5 search radius near a stress concentration; curved-boundary point-load approximation; BC handling). **Binding rule: no paper may cite NAFEMS LE1 as "validated" until this absolute gate is green (F.037 — a paper claim is a product claim).** NS/Multiphase boundedness→analytical-convergence upgrade also lives here.
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

## 6. First moves
**Phase A: ✅ DONE** (solver-truth ledger §0.5). **Gate: ✅ DONE** (`/premortem`+`/critic`, findings repo-verified, §0.6). Next, in strict order:
1. **A.5 (BLOCKING):** make `paper-nafems-le1.test.ts` an absolute-tolerance gate (≤5% of 92.7 MPa). If red, it's a correctness defect — investigate stress-extraction/BC/search-radius (F.110), do NOT open C/D/E.
2. **B0:** prove one engine-capable execution site builds + replays a receipt bit-identical from a cold checkout (recommended: build-time `compile-lotus-scene.mts`). Only then open B1–B4.
3. **Before any GPU phase:** fail-loud the `fleet` billing path (or wire it real) — treasury-class (F.095).
4. Then B1 (cheapest high-signal proof), per the §0.6-corrected Phase B.

---

*Lotus L0→L1 wiring (Phase B) is the cheapest high-signal proof. But A1 (are the solvers real?) is the true unblock — do not build Phase B on an unaudited foundation (F.110).*
