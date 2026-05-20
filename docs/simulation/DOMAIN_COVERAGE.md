# Simulation Domain Coverage

> **SSOT for provability.** This file answers: "For capability X, can we produce a verifiable receipt?"
>
> Verification commands for counts — do not hardcode numbers in other docs, link here instead.
> Verify solver count: `find packages/engine/src/simulation -name "*Solver.ts" | grep -v test | grep -v Adapter`
> Verify trait count: `find packages/core/src/traits -name "*Trait.ts" | grep -v test`
> Last updated: 2026-05-19 (via /sim skill enumeration + live file verification)

---

## Status Legend

| Column | Meaning |
|--------|---------|
| **Solver shipped** | `.ts` file exists in `packages/engine/src/` |
| **Trait shipped** | Corresponding `*Trait.ts` or handler in `packages/core/src/traits/` |
| **Factory registered** | `SimulationSolverFactory.register()` call in `packages/engine/src/simulation/simulation-registry.ts` |
| **Runtime validated** | Benchmark test (`paper-*.test.ts` or `NAFEMS-*.test.ts`) covers solver output |
| **Receipt type** | Corresponding receipt type file in `packages/framework/src/board/` |
| **Paper citation** | Paper number that claims this capability |

**Pattern C registry note:** the old "factory has zero registrants" failure mode
is closed for the canonical engine init path by
`packages/engine/src/simulation/simulation-registry.ts`. It remains a runtime
readiness check, because `SimulationSolverFactory.clear()` or a consumer that
never calls `initSimulationSolvers()` still produces an empty registry.

---

## Layer 1 — Domain Solvers

| Solver | Solver shipped | Trait shipped | Factory registered | Runtime validated | Receipt type | Paper |
|--------|---------------|---------------|-------------------|-------------------|--------------|-------|
| `ThermalSolver` | ✅ `ThermalSolver.ts` | ✅ `thermalSimulationHandler` | ✅ `simulation-registry.ts` | ✅ `ThermalSolver.test.ts` | Generic `ValidationReceipt`; no thermal-specific module | Paper 4 |
| `StructuralSolver` (TET4) | ✅ `StructuralSolver.ts` | ✅ `structuralFEMHandler` | ✅ `simulation-registry.ts` | ✅ `NAFEMS-LE1.test.ts`, `paper-nafems-le1.test.ts` | Generic `ValidationReceipt`; no structural-specific module | Paper 4 |
| `StructuralSolverTET10` | ✅ `StructuralSolverTET10.ts` | ⚠️ via factory (verify trait name) | ✅ `simulation-registry.ts` | ✅ `StructuralSolverTET10.test.ts` | — (no dedicated receipt type found) | Paper 4 |
| `HydraulicSolver` | ✅ `HydraulicSolver.ts` | ✅ `hydraulicPipeHandler` | ✅ `simulation-registry.ts` | ✅ `HydraulicSolver.test.ts` | Generic `ValidationReceipt`; no hydraulic-specific module | Paper 4 |
| `AcousticSolver` + seismic | ✅ `AcousticSolver.ts` | ⚠️ verify trait name | ✅ `simulation-registry.ts` | ✅ `AcousticSolver.test.ts`, `SeismicSolver.test.ts` | Generic `ValidationReceipt`; no acoustic-specific module | Paper 4 |
| `FDTDSolver` (EM) | ✅ `FDTDSolver.ts` | ⚠️ verify trait name | ✅ `simulation-registry.ts` | ✅ `FDTDSolver.test.ts` | Generic `ValidationReceipt`; no EM-specific module | Paper 4 |
| `NavierStokesSolver` | ✅ `NavierStokesSolver.ts` | ⚠️ verify trait name | ✅ `simulation-registry.ts` | ✅ `NavierStokesSolver.test.ts` | Generic `ValidationReceipt`; no CFD-specific module | Paper 4 |
| `MultiphaseNSSolver` | ✅ `MultiphaseNSSolver.ts` | ⚠️ verify trait name | ✅ `simulation-registry.ts` | ✅ `Phase9-11-NewSolvers.test.ts` | Generic `ValidationReceipt`; no multiphase-specific module | Paper 4 |
| `MolecularDynamicsSolver` | ✅ `MolecularDynamicsSolver.ts` | ⚠️ verify trait name | ✅ `simulation-registry.ts` | ✅ `Phase9-11-NewSolvers.test.ts` | Generic `ValidationReceipt`; no MD-specific module | Papers 4, 16 |
| `ReactionDiffusionSolver` | ✅ `ReactionDiffusionSolver.ts` | ⚠️ verify trait name | ✅ `simulation-registry.ts` | ✅ `ReactionDiffusionSolver.test.ts` | Generic `ValidationReceipt`; no reaction-diffusion-specific module | Paper 4 |
| `UncertaintyQuantification` | ✅ `UncertaintyQuantification.ts` | ❌ no trait found | ❌ not a factory registrant | ✅ `UncertaintyQuantification.test.ts` | — | Paper 4 |
| `MLSMPMFluid` (browser-native MPM) | ✅ `physics/MLSMPMFluid.ts` | ⚠️ no trait handler | ✅ `simulation-registry.ts` (`mls-mpm-fluid`) | ✅ MLS-MPM bench in `packages/engine/src/physics/` | — | sovereign-race candidate (Paper TBD) |
| `AffinityODESolver` (relational dynamics) | ✅ `simulation/AffinityODESolver.ts` | ✅ `affinityHandler` (`AffinityTrait.ts`) | ✅ `simulation-registry.ts` (`affinity-ode`) | ✅ `simulation-registry.test.ts` (create + 2-step cycle) | — | D.027 Brittney, D.052 ConversationDaemon |

---

## Layer 2 — Physics Solvers

| Solver | Solver shipped | Trait shipped | Factory registered | Runtime validated | Receipt type | Paper |
|--------|---------------|---------------|-------------------|-------------------|--------------|-------|
| `PBDSolverCPU` | ✅ `PBDSolver.ts` | ✅ `RigidbodyTrait` / `AdvancedClothTrait` | ✅ (via engine init) | ✅ `paper-benchmarks.test.ts` | — | Paper 4 |
| `PBDSolverGPU` | ✅ `PBDSolver.ts` | ✅ `RigidbodyTrait` | ✅ (via engine init) | ✅ GPU path in `paper-benchmarks.test.ts` | — | Paper 4 |
| `ConstraintSolver` | ✅ `ConstraintSolver.ts` | ✅ `RigidbodyTrait` | ✅ (via engine init) | ✅ | — | Paper 4 |
| `SoftBodySolver` | ✅ `SoftBodySolver.ts` | ✅ `SoftBodyTrait` | ✅ (via engine init) | ✅ `SoftBodyTrait.test.ts` | — | Paper 4 |

---

## Layer 3 — GPU Sparse Solver

| Solver | Solver shipped | Trait shipped | Factory registered | Runtime validated | Notes |
|--------|---------------|---------------|-------------------|-------------------|-------|
| `SparseLinearSolver` | ✅ `gpu/SparseLinearSolver.ts` | ❌ no trait | N/A (direct use) | ✅ `SparseLinearSolver.test.ts` | Used by structural solvers |

---

## Layer 4 — Animation & Navigation

| Solver | Solver shipped | Trait shipped | Runtime validated | Notes |
|--------|---------------|---------------|-------------------|-------|
| `IKSolver` | ✅ `animation/IKSolver.ts` | ✅ (via animation system) | ✅ `IKLatencyBenchmark.test.ts` | Latency-probed |
| `NavMesh` + `AStarPathfinder` | ✅ `navigation/NavMesh.ts` | ✅ `NavmeshSolverTrait` (in core) | ⚠️ partial | Trait in core, solver in engine |

---

## Layer 5 — Quantum Chemistry Plugin

| Solver | Solver shipped | Factory registered | Runtime validated | Backends | Paper |
|--------|---------------|-------------------|-------------------|----------|-------|
| `QmSolver` | ✅ `plugins/qm-bridge/src/QmSolver.ts` | N/A (plugin, not factory) | ⚠️ integration-test only | Psi4, QE, TBLite | Papers 4, 17 |

---

## Layer 6 — SNN (Spiking Neural Networks)

| Component | Status | Notes |
|-----------|--------|-------|
| `snn-webgpu` runtime | ✅ `packages/snn-webgpu/` | LIF neurons on WebGPU; not a `SimSolver` implementor; Paper 2 substrate |

---

## Layer 7 — Multi-Physics & Orchestration

| Component | Shipped | Runtime validated | Notes |
|-----------|---------|-------------------|-------|
| `CouplingManagerV2` | ✅ | ✅ (integration tests) | Bidirectional field coupling |
| `SimulationContract` | ✅ | ✅ (via `SimulationContract.test.ts`) | 6-guarantee enforcement + ZK proof |
| `ExperimentOrchestrator` | ✅ | ✅ | Parameter sweeps |
| `AutoMesher` | ✅ | ✅ `AutoMesher.test.ts` | TET4+TET10 upgrade path |
| `ConvergenceControl` | ✅ | ✅ | Adaptive timestepping |
| `MaterialDatabase` | ✅ | ✅ | Unit-validated material properties |

---

## Layer 8 — CAEL Embodied Harness

| Component | Shipped | Notes |
|-----------|---------|-------|
| `CAELAgent` + `CAELAgentLoop` | ✅ | Embodied agent harness (I.011 LANDED 2026-05-03) |
| `CAELFork` / `CAELForkDream` | ✅ | Parallel simulation fork |
| `CAELRecorder` / `CAELReplayer` | ✅ | Deterministic replay |
| `CAELTrace` | ✅ | Trace export |
| `SNNCognitionEngine` | ✅ | SNN-backed cognition (Paper 2 bridge) |
| `CRDTCAELBridge` | ✅ | CRDT state sync for embodied agents |

---

## GpuBackedSolver Interface Status

> **Gap**: `GpuBackedSolver` mixin interface is defined in `SimSolver.ts` but **zero domain solvers currently implement `readbackOutput()`**.
> Wave 2 GPU kernel ports (FDTD, NavierStokes, MolecularDynamics) will close this gap.
> Track via: `grep -r "readbackOutput" packages/engine/src/ --include="*.ts" | grep -v interface | grep -v test`

---

## Evidence Readiness Scores

> **Evidence Readiness** = "can a third party reproduce the claim from shipped artifacts?"
> Distinct from paper-audit-matrix claim status (does the claim exist?).

| Domain | Claim exists | Benchmark shipped | Receipt type exists | Factory registered | Evidence Readiness |
|--------|-------------|-------------------|---------------------|-------------------|-------------------|
| Thermal | ✅ | ✅ | generic only | ✅ | 0.65 |
| Structural (TET4) | ✅ | ✅ NAFEMS LE1 | generic only | ✅ | 0.8 |
| Structural (TET10) | ✅ | ✅ | ❌ | ✅ | 0.65 |
| Hydraulic | ✅ | ✅ | generic only | ✅ | 0.75 |
| Acoustic + seismic | ✅ | ✅ | ❌ | ✅ | 0.65 |
| EM (FDTD) | ✅ | ✅ | ❌ | ✅ | 0.65 |
| CFD (NS) | ✅ | ✅ | ❌ | ✅ | 0.65 |
| Multiphase CFD | ✅ | ✅ | ❌ | ✅ | 0.65 |
| Molecular Dynamics | ✅ | ✅ | ❌ | ✅ | 0.65 |
| Reaction-Diffusion | ✅ | ✅ | generic only | ✅ | 0.75 |
| UQ | ✅ | ✅ | ❌ | ❌ | 0.55 |
| PBD (CPU+GPU) | ✅ | ✅ | ❌ | ✅ | 0.75 |
| Quantum Chemistry | ✅ | ⚠️ integration only | ❌ | N/A | 0.4 |
| SNN (WebGPU) | ✅ | ✅ | ❌ | N/A | 0.7 |

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
