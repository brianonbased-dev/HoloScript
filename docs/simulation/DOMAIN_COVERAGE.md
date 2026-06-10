# Simulation Domain Coverage

> **SSOT for provability.** This file answers: "For capability X, can we produce a verifiable receipt?"
>
> Verification commands for counts — do not hardcode numbers in other docs, link here instead.
> Verify solver count: `find packages/engine/src/simulation -name "*Solver.ts" | grep -v test | grep -v Adapter`
> Verify trait count: `find packages/core/src/traits -name "*Trait.ts" | grep -v test`
> Last updated: 2026-06-10 (post physics/simsci full-surface sweep — whole-file audit of 95 files,
> 43 verified bug fixes, 2 new solvers; see §2026-06-10 Sweep below)

---

## Status Legend

| Column                 | Meaning                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| **Solver shipped**     | `.ts` file exists in `packages/engine/src/`                                                          |
| **Trait shipped**      | Corresponding `*Trait.ts` or handler in `packages/core/src/traits/`                                  |
| **Factory registered** | `SimulationSolverFactory.register()` call in `packages/engine/src/simulation/simulation-registry.ts` |
| **Runtime validated**  | Benchmark test (`paper-*.test.ts` or `NAFEMS-*.test.ts`) covers solver output                        |
| **Receipt type**       | Corresponding receipt type file in `packages/framework/src/board/`                                   |
| **Paper citation**     | Paper number that claims this capability                                                             |

**Pattern C registry note:** the old "factory has zero registrants" failure mode
is closed for the canonical engine init path by
`packages/engine/src/simulation/simulation-registry.ts`. It remains a runtime
readiness check, because `SimulationSolverFactory.clear()` or a consumer that
never calls `initSimulationSolvers()` still produces an empty registry.

---

## Layer 1 — Domain Solvers

| Solver                                    | Solver shipped                       | Trait shipped                             | Factory registered                            | Runtime validated                                        | Receipt type                                                       | Paper                                    |
| ----------------------------------------- | ------------------------------------ | ----------------------------------------- | --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| `ThermalSolver`                           | ✅ `ThermalSolver.ts`                | ✅ `thermalSimulationHandler`             | ✅ `simulation-registry.ts`                   | ✅ `ThermalSolver.test.ts`                               | Generic `ValidationReceipt`; no thermal-specific module            | Paper 4                                  |
| `StructuralSolver` (TET4)                 | ✅ `StructuralSolver.ts`             | ✅ `structuralFEMHandler`                 | ✅ `simulation-registry.ts`                   | ✅ `NAFEMS-LE1.test.ts`, `paper-nafems-le1.test.ts`      | Generic `ValidationReceipt`; no structural-specific module         | Paper 4                                  |
| `StructuralSolverTET10`                   | ✅ `StructuralSolverTET10.ts`        | ⚠️ via factory (verify trait name)        | ✅ `simulation-registry.ts`                   | ✅ `StructuralSolverTET10.test.ts`                       | — (no dedicated receipt type found)                                | Paper 4                                  |
| `HydraulicSolver`                         | ✅ `HydraulicSolver.ts`              | ✅ `hydraulicPipeHandler`                 | ✅ `simulation-registry.ts`                   | ✅ `HydraulicSolver.test.ts`                             | Generic `ValidationReceipt`; no hydraulic-specific module          | Paper 4                                  |
| `AcousticSolver` + seismic                | ✅ `AcousticSolver.ts`               | ⚠️ verify trait name                      | ✅ `simulation-registry.ts`                   | ✅ `AcousticSolver.test.ts`, `SeismicSolver.test.ts`     | Generic `ValidationReceipt`; no acoustic-specific module           | Paper 4                                  |
| `FDTDSolver` (EM)                         | ✅ `FDTDSolver.ts`                   | ⚠️ verify trait name                      | ✅ `simulation-registry.ts`                   | ✅ `FDTDSolver.test.ts`                                  | Generic `ValidationReceipt`; no EM-specific module                 | Paper 4                                  |
| `NavierStokesSolver`                      | ✅ `NavierStokesSolver.ts`           | ⚠️ verify trait name                      | ✅ `simulation-registry.ts`                   | ✅ `NavierStokesSolver.test.ts`                          | Generic `ValidationReceipt`; no CFD-specific module                | Paper 4                                  |
| `MultiphaseNSSolver`                      | ✅ `MultiphaseNSSolver.ts`           | ⚠️ verify trait name                      | ✅ `simulation-registry.ts`                   | ✅ `Phase9-11-NewSolvers.test.ts`                        | Generic `ValidationReceipt`; no multiphase-specific module         | Paper 4                                  |
| `MolecularDynamicsSolver`                 | ✅ `MolecularDynamicsSolver.ts`      | ⚠️ verify trait name                      | ✅ `simulation-registry.ts`                   | ✅ `Phase9-11-NewSolvers.test.ts`                        | Generic `ValidationReceipt`; no MD-specific module                 | Papers 4, 16                             |
| `ReactionDiffusionSolver`                 | ✅ `ReactionDiffusionSolver.ts`      | ⚠️ verify trait name                      | ✅ `simulation-registry.ts`                   | ✅ `ReactionDiffusionSolver.test.ts`                     | Generic `ValidationReceipt`; no reaction-diffusion-specific module | Paper 4                                  |
| `UncertaintyQuantification`               | ✅ `UncertaintyQuantification.ts`    | ❌ no trait found                         | ❌ not a factory registrant                   | ✅ `UncertaintyQuantification.test.ts`                   | —                                                                  | Paper 4                                  |
| `MLSMPMFluid` (browser-native MPM)        | ✅ `physics/MLSMPMFluid.ts`          | ⚠️ no trait handler                       | ✅ `simulation-registry.ts` (`mls-mpm-fluid`) | ✅ MLS-MPM bench in `packages/engine/src/physics/`       | —                                                                  | sovereign-race candidate (Paper TBD)     |
| `AffinityODESolver` (relational dynamics) | ✅ `simulation/AffinityODESolver.ts` | ✅ `affinityHandler` (`AffinityTrait.ts`) | ✅ `simulation-registry.ts` (`affinity-ode`)  | ✅ `simulation-registry.test.ts` (create + 2-step cycle) | —                                                                  | D.027 Brittney, D.052 ConversationDaemon |
| `DEMSolver` (granular, new 2026-06-10)    | ✅ `simulation/DEMSolver.ts`         | ❌ no trait yet                           | ✅ `simulation-registry.ts` (`dem-granular`)  | ✅ `DEMSolver.test.ts` (restitution/momentum/determinism) | —                                                                  | Paper 4 candidate                        |
| `AdjointHeatSolver` (differentiable, new 2026-06-10) | ✅ `simulation/AdjointHeatSolver.ts` | ❌ library API (not registry)  | N/A (direct use)                              | ✅ `AdjointHeatSolver.test.ts` (FD-verified gradients to 1e-8) | —                                                             | differentiable+surrogate+receipts triple (Wave 3 slot) |

---

## Layer 2 — Physics Solvers

| Solver             | Solver shipped           | Trait shipped                              | Factory registered   | Runtime validated                         | Receipt type | Paper   |
| ------------------ | ------------------------ | ------------------------------------------ | -------------------- | ----------------------------------------- | ------------ | ------- |
| `PBDSolverCPU`     | ✅ `PBDSolver.ts`        | ✅ `RigidbodyTrait` / `AdvancedClothTrait` | ✅ (via engine init) | ✅ `paper-benchmarks.test.ts`             | —            | Paper 4 |
| `PBDSolverGPU`     | ✅ `PBDSolver.ts`        | ✅ `RigidbodyTrait`                        | ✅ (via engine init) | ✅ GPU path in `paper-benchmarks.test.ts` | —            | Paper 4 |
| `ConstraintSolver` | ✅ `ConstraintSolver.ts` | ✅ `RigidbodyTrait`                        | ✅ (via engine init) | ✅                                        | —            | Paper 4 |
| `SoftBodySolver`   | ✅ `SoftBodySolver.ts`   | ✅ `SoftBodyTrait`                         | ✅ (via engine init) | ✅ `SoftBodyTrait.test.ts`                | —            | Paper 4 |

---

## Layer 3 — GPU Sparse Solver

| Solver               | Solver shipped                 | Trait shipped | Factory registered | Runtime validated               | Notes                      |
| -------------------- | ------------------------------ | ------------- | ------------------ | ------------------------------- | -------------------------- |
| `SparseLinearSolver` | ✅ `gpu/SparseLinearSolver.ts` | ❌ no trait   | N/A (direct use)   | ✅ `SparseLinearSolver.test.ts` | Used by structural solvers |

---

## Layer 4 — Animation & Navigation

| Solver                        | Solver shipped             | Trait shipped                     | Runtime validated               | Notes                           |
| ----------------------------- | -------------------------- | --------------------------------- | ------------------------------- | ------------------------------- |
| `IKSolver`                    | ✅ `animation/IKSolver.ts` | ✅ (via animation system)         | ✅ `IKLatencyBenchmark.test.ts` | Latency-probed                  |
| `NavMesh` + `AStarPathfinder` | ✅ `navigation/NavMesh.ts` | ✅ `NavmeshSolverTrait` (in core) | ⚠️ partial                      | Trait in core, solver in engine |

---

## Layer 5 — Quantum Chemistry Plugin

| Solver     | Solver shipped                         | Factory registered        | Runtime validated        | Backends         | Paper        |
| ---------- | -------------------------------------- | ------------------------- | ------------------------ | ---------------- | ------------ |
| `QmSolver` | ✅ `plugins/qm-bridge/src/QmSolver.ts` | N/A (plugin, not factory) | ⚠️ integration-test only | Psi4, QE, TBLite | Papers 4, 17 |

---

## Layer 6 — SNN (Spiking Neural Networks)

| Component            | Status                    | Notes                                                                   |
| -------------------- | ------------------------- | ----------------------------------------------------------------------- |
| `snn-webgpu` runtime | ✅ `packages/snn-webgpu/` | LIF neurons on WebGPU; not a `SimSolver` implementor; Paper 2 substrate |

---

## Layer 7 — Multi-Physics & Orchestration

| Component                | Shipped | Runtime validated                     | Notes                              |
| ------------------------ | ------- | ------------------------------------- | ---------------------------------- |
| `CouplingManagerV2`      | ✅      | ✅ (integration tests)                | Bidirectional field coupling       |
| `SimulationContract`     | ✅      | ✅ (via `SimulationContract.test.ts`) | 6-guarantee enforcement + ZK proof |
| `ExperimentOrchestrator` | ✅      | ✅                                    | Parameter sweeps                   |
| `AutoMesher`             | ✅      | ✅ `AutoMesher.test.ts`               | TET4+TET10 upgrade path            |
| `ConvergenceControl`     | ✅      | ✅                                    | Adaptive timestepping              |
| `MaterialDatabase`       | ✅      | ✅                                    | Unit-validated material properties |

---

## Layer 8 — CAEL Embodied Harness

| Component                       | Shipped | Notes                                            |
| ------------------------------- | ------- | ------------------------------------------------ |
| `CAELAgent` + `CAELAgentLoop`   | ✅      | Embodied agent harness (I.011 LANDED 2026-05-03) |
| `CAELFork` / `CAELForkDream`    | ✅      | Parallel simulation fork                         |
| `CAELRecorder` / `CAELReplayer` | ✅      | Deterministic replay                             |
| `CAELTrace`                     | ✅      | Trace export                                     |
| `SNNCognitionEngine`            | ✅      | SNN-backed cognition (Paper 2 bridge)            |
| `CRDTCAELBridge`                | ✅      | CRDT state sync for embodied agents              |

---

## GpuBackedSolver Interface Status

> **Updated 2026-06-10**: `readbackOutput()` is now implemented by `StructuralSolver`,
> `StructuralSolverTET10`, and the GPU adapters in `simulation/adapters/SolverAdapters.ts`
> (thermal/acoustic stencil + structural CG), with contract integration covered by
> `SimulationContractWebGpu.test.ts`. The remaining gap is GPU-resident kernels for
> FDTD, NavierStokes, and MolecularDynamics (still CPU-only).
> Track via: `grep -r "readbackOutput" packages/engine/src/ --include="*.ts" | grep -v interface | grep -v test`

---

## 2026-06-10 Sweep — audit verdicts and fixes

Whole-file audit of 95 physics/simsci files (9 subsystem auditors), then verified fixes
(failing-test-first; ~20% of audit claims rejected as false positives on re-verification).

**Fixed (43 verified bugs, all with regression tests):**

- `PBDSolver` — true XPBD lambda accumulation (CPU + WGSL; was iteration-count-dependent PBD mislabeled XPBD), SPH neighbor-lambda, valid constraint graph coloring, **signed** SDF via 3-axis ray-parity, GPU normals binding
- `PhysicsWorldImpl` — rotation-aware AABBs and GJK/EPA, **angular impulse** in contact resolution (off-center hits now induce spin), hinge/ball-socket wired through the previously-orphaned `ConstraintSolver`
- `JointSystem` — velocity-proportional damping (was force-proportional), distance-joint rest length (force was always zero); `VehicleSystem` — heading integration (forward vector was derived from angular velocity); `SoftBodyAdapter` — rest lengths from actual geometry (was hardcoded 0.1); `DeformableMesh` — rotational shape matching (polar decomposition)
- `NavierStokesSolver` — viscous CFL substepping + post-advect BCs; `MultiphaseNSSolver` — level-set reinit guard band + grid-relative eps; `FluidSim` — SPH mass from rest density + SpatialHash neighbors (was O(N²)); `HydraulicSolver` — fundamental-cycle construction
- `FDTDSolver` — bounded `point_current` source (was DC injection → unbounded energy); GPU stencils — CFL guards (thermal + acoustic)
- `StructuralSolver` — surface-face pressure loads (was element-index-as-face + pressure/6 scaling); `MolecularDynamicsSolver` — LJ cutoff energy shift + 3(N−1) DoF temperature; `ThermalSolver` — anisotropic implicit Jacobi (default grid is non-cubic; was cubic-only); `SpatialHash.update()` — radius preservation
- qm-bridge (psi4/tblite/quantum-espresso) — real binary spawn reachable (was unconditional mock fallthrough — the bridge never bridged); configured-but-failing spawn throws loudly instead of silently mocking
- energy-grid-plugin — DC load flow rewritten to B'·θ = P susceptance-matrix form (was sequential propagation, wrong for meshed networks)
- mcp-server `solve_structural`/`solve_thermal` — real geometry digests + state digests in CAEL traces (was `geometryHash: 'geo-unavailable'` + empty stateDigests)

**Honest labels (THIN by design or known debt — do not claim these capabilities):**

- `TetGenWasmMesher` — no-op initialize, returns box mesh regardless of input (AutoMesher structured path is the real mesher)
- `ZKSimContractProof` — salted **hash commitment** (binding + hiding), NOT a zk-SNARK; docs corrected 2026-06-10, class name kept for API stability
- `fenicsx-bridge` — stub returning TODO receipts; `structural-biology` docking/admet — heuristics, not RDKit/ML
- `FlowFieldCompute` — claims WebGPU, computes on CPU
- `VehicleSystem` suspension raycast — flat-plane-only; `JointSystem` — not coupled to a rigid-body world; `PhysicsStep` — standalone lightweight engine with Euler-angle rotation

**New capabilities:**

- `DEMSolver` (`dem-granular`) — Cundall–Strack granular DEM, uniform-grid neighbors, configurable gravity vector (G.GOLD.485)
- `AdjointHeatSolver` — discrete-adjoint gradients (dJ/dS, dJ/dT0) for thermal diffusion, FD-verified to 1e-8; seed of the differentiable+surrogate+receipts wedge
- `jacobiIterationAnisotropic` (`ConvergenceControl`) — implicit diffusion on non-cubic grids

---

## Manufacturing Lane (CAD / 3D printing — added 2026-06-10)

> CADAM-parity engine path, sovereign (HoloScript SDF kernel, no external CAD dependency).
> Board task task_1781125573775_6m2u. All under `packages/engine/src/simulation/`.

| Component | What it does | Validation |
|---|---|---|
| `SDFPointEvaluator` (pre-existing) | CSG kernel: 21 primitives, boolean + smooth ops, twist/bend/repeat; JS evaluation + grid sampling | conjecture probes + manufacturing tests |
| `manufacturing/MarchingCubes` | SDF → watertight `SurfaceMesh` (256-case tables, edge-keyed welding, outward winding) | sphere volume 0.6% of 4π/3, CSG box−cylinder 1% of analytic, watertight edge check, resolution convergence |
| `export/STLExporter` | `SurfaceMesh` → binary/ASCII STL with computed unit normals, scale option | closed-loop round trip through `import/STLParser`, normal correctness |
| `manufacturing/PrintabilityAnalyzer` | watertight/manifold check, signed volume + orientation, overhang detection vs build direction (`bedEpsilon` first-layer tolerance), build-volume fit, thin-wall heuristic (honestly named — sampling, not medial-axis) | 37 analytic tests on hand-built meshes |
| `ManufacturingLane.e2e` | parametric part → mesh → pre-flight → STL → reimport → re-verify; parameter change reproduces analytic volume delta | 6 e2e tests |

Pipeline: `.holo`/SDFNode → `marchingCubes()` → `analyzePrintability()` → `exportSTLBinary()` — composes with
`AutoMesher`/FEM (same `SurfaceMesh` contract) so a printed part can also be structurally verified with receipts —
the composition CADAM-class tools do not have (W.902).

Open (board-filed): Studio parametric sliders (task_1781125573776_tq83), OpenSCAD-WASM bridge decision
(task_1781125573776_gsri), GCode slicer phase 1 (task_1781125573776_suzq).

---

## Evidence Readiness Scores

> **Evidence Readiness** = "can a third party reproduce the claim from shipped artifacts?"
> Distinct from paper-audit-matrix claim status (does the claim exist?).

| Domain             | Claim exists | Benchmark shipped   | Receipt type exists | Factory registered | Evidence Readiness |
| ------------------ | ------------ | ------------------- | ------------------- | ------------------ | ------------------ |
| Thermal            | ✅           | ✅                  | generic only        | ✅                 | 0.65               |
| Structural (TET4)  | ✅           | ✅ NAFEMS LE1       | generic only        | ✅                 | 0.8                |
| Structural (TET10) | ✅           | ✅                  | ❌                  | ✅                 | 0.65               |
| Hydraulic          | ✅           | ✅                  | generic only        | ✅                 | 0.75               |
| Acoustic + seismic | ✅           | ✅                  | ❌                  | ✅                 | 0.65               |
| EM (FDTD)          | ✅           | ✅                  | ❌                  | ✅                 | 0.65               |
| CFD (NS)           | ✅           | ✅                  | ❌                  | ✅                 | 0.65               |
| Multiphase CFD     | ✅           | ✅                  | ❌                  | ✅                 | 0.65               |
| Molecular Dynamics | ✅           | ✅                  | ❌                  | ✅                 | 0.65               |
| Reaction-Diffusion | ✅           | ✅                  | generic only        | ✅                 | 0.75               |
| UQ                 | ✅           | ✅                  | ❌                  | ❌                 | 0.55               |
| PBD (CPU+GPU)      | ✅           | ✅                  | ❌                  | ✅                 | 0.75               |
| Quantum Chemistry  | ✅           | ⚠️ integration only | ❌                  | N/A                | 0.4                |
| SNN (WebGPU)       | ✅           | ✅                  | ❌                  | N/A                | 0.7                |

> **Target for Paper gate**: Evidence Readiness ≥ 0.9 for each claimed domain.
> **Next highest-leverage action**: Add receipt types for FDTD, NavierStokes, MultiphaseNS, MolecularDynamics (these are the solvers with runtime-validated benchmarks but no receipt type — closing the receipt gap raises Evidence Readiness from 0.65 → ~0.85 for 5 domains simultaneously).

---

## Verification Commands

```bash
# Count domain solvers
find packages/engine/src/simulation -name "*Solver.ts" | grep -v test | grep -v Adapter | grep -v "__tests__"

# Count physics solvers
find packages/engine/src/physics -name "*Solver.ts" | grep -v test

# Check factory registrations
grep -c "SimulationSolverFactory.register(" packages/engine/src/simulation/simulation-registry.ts

# Check GpuBackedSolver implementors
grep -r "readbackOutput" packages/engine/src/ --include="*.ts" | grep -v interface | grep -v test

# Check receipt types
find packages/framework/src/board -name "*receipts*" | grep -v test

# Check simulation traits
grep -r "thermalSimulationHandler\|structuralFEMHandler\|hydraulicPipeHandler" packages/core/src/ --include="*.ts" -l
```
