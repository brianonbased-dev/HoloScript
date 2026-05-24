# Deep-Ratchet — HoloScript core, 2026-05-24

Code-substance audit (not test runs) of the highest-leverage capability claims in
HoloScript core: every claim mapped to production code, each read in full, verdict
REAL / THIN / OVERCLAIMED with file:line. Method per `/deep-ratchet` (F.075). HoloGraph
was stale + on the wrong filesystem and the local rebuild is broken (see §Tooling), so
location used grep on the local checkout; the load-bearing work is full-file reading.

## Scope ratcheted (15 claims)

- **Solvers (Tier 1):** Structural, NavierStokes, Thermal, FDTD, MolecularDynamics,
  MultiphaseNS, Acoustic, ReactionDiffusion, PBD/SoftBody, QmSolver, SimSolver,
  SparseLinear (GPU), Hydraulic, AffinityODE, ConstraintSolver.
- **Algorithm-named traits (Tier 2):** ObjectTracking, Astar, Optimization, TensorOp,
  NavmeshSolver.
- **NOT yet ratcheted:** compilers (61, Tier 3), integration traits (Slack/S3/etc, Tier 4),
  and ~88 remaining `/stub-audit` POTENTIAL traits.

## Headline result

Tier-1 numerics are **genuinely real** — real FEM/CFD/FDTD/MD/PBD/Hardy-Cross/RK4 with
verifiers that compare against analytical solutions. The one solver overclaim is
**ConstraintSolver**. The algorithm-named traits are a uniform **OVERCLAIMED echo-stub
family**, each with a real seam sitting next to it (F.068 wire-don't-duplicate).

## LANDED this pass (real fixes, committed)

- **TensorOpTrait** → real Float32 add/matmul via new pure module `traits/engines/tensor-ops.ts`
  (commit `7bec450b7`). Was: echoed operands.
- **NavmeshSolverTrait** → real `deriveWalkableNavmesh` + `findReachablePath` wiring
  (commit `ba7712a76`). Was: counter + echo.

---

## Enhancement backlog (specs — NOT silently rewritten)

Each touches shared production behavior, is unbounded, or needs a contract/design call.
RISK lines name founder-gate items (shared doctrine / paper-program / spend).

### E1 — ConstraintSolver is OVERCLAIMED (no impulse resolution)
- **CONTEXT.** `engine/src/physics/ConstraintSolver.ts`. Iteration loop (`:207-212`),
  per-joint dispatch (`:247-294`), warm-start (`:553-562`), break-force (`:215-224`) are
  real scaffold. But every joint computes `correction = positionError * baumgarte / dt`
  (`:310,400,432,457,496,525-542`) — a Baumgarte position-bias applied identically to both
  bodies regardless of mass. There is **no mass / inverse-mass / inertia** anywhere
  (`IRigidBodyState` has no mass field), **no Jacobian**, **no effective-mass denominator**
  `J M⁻¹ Jᵀ`, **no contact constraints** (claim names contacts; only 8 joint types exist).
  `accumulatedImpulse` is never read back into the solve, so the 10-iteration loop is a no-op
  multiplier. Verifier asserts only `corrections.size > 0`.
- **INTENT.** A real sequential-impulse / PGS solver: `lambda = -(J·v + bias)/(J·M⁻¹·Jᵀ)`,
  mass-weighted application, impulse clamping, warm-start re-injected into the solve, plus
  real contact constraints (normal/penetration/restitution/friction).
- **PATH.** Add inverse-mass/inertia to `IRigidBodyState`; rewrite the 8 `solve*` bodies to
  compute effective mass + impulse; feed `accumulatedImpulse` back per iteration; add a
  contact constraint type. Then a verifier asserting momentum conservation + convergence.
- **RISK / OWNER.** **Founder-gate-adjacent** — changes shared rigid-body physics behavior
  other consumers depend on. Bounded in effort but not safe to land silently.

### E2 — FDTDSolver PML is a stub ("absorbing boundary" overclaims)
- **CONTEXT.** `engine/src/simulation/FDTDSolver.ts`. Yee grid (`:144-172`), curl stencils
  (`:229-304`), CFL + lossy coeffs are REAL. But `createPMLFields` (`:483`) returns only
  `{thickness}` and `applyPML_*`/`applyDamping` (`:361-404`) apply ad-hoc cubic exponential
  damping — NOT a matched layer (the file itself comments "Stub PML"). No test checks PML
  absorption efficacy or propagation speed = c.
- **INTENT.** A true split-field or CPML absorbing layer (auxiliary ψ / conductivity arrays
  per Taflove), and a verifier measuring reflection coefficient + propagation speed.
- **PATH.** Implement CPML auxiliary updates localized to the PML functions (algorithm is
  in the cited Taflove reference); add a reflection-efficacy benchmark. Maxwell core needs
  no change.
- **RISK / OWNER.** Bounded, localized to PML functions. Tighten the "absorbing boundary"
  claim to "damping heuristic" until landed. Low blast radius.

### E3 — NavierStokes / MultiphaseNS Poisson coefficient consistency
- **CONTEXT.** NavierStokes `:253-262` uses `rhs = -ρ/dt·div(u)` but Jacobi solves with
  `alpha = dx²`, `beta = 6` — dimensionally loose vs the (ρ/dt) RHS, which is why the
  verifier needed an ~20,000× tolerance window (Poiseuille `:91-92`). MultiphaseNS `:228`
  passes `alpha = dx*dx` to a constant-coefficient Jacobi that ignores the variable-density
  operator (density only enters the RHS) — first-order approximate variable-density
  projection. Both solvers are REAL; this is accuracy, not facade.
- **INTENT.** Dimensionally consistent pressure-Poisson (correct RHS/coefficient coupling;
  true variable-coefficient operator for multiphase) + quantitative verifier assertions
  (analytical Poiseuille profile, not a 20,000× bound).
- **PATH.** Fix RHS/coefficient consistency in the Poisson setup; add a quantitative profile
  assertion; for multiphase, fold density into the LHS operator.
- **RISK / OWNER.** **Shared numerics** — changes results for every consumer of these
  solvers. Spec, don't silently retune. Tightening the verifier assertion alone is safe and
  can land independently.

### E4 — QmSolver generic-molecule Hamiltonian is a placeholder
- **CONTEXT.** `plugins/qm-bridge` (`quantum_execute.py`). H₂ is real + correct: true
  STO-3G Z₂-reduced Pauli Hamiltonian (`:398-409`), real VQE over `EfficientSU2` +
  `StatevectorEstimator` expectation (`:431-447`), genuine IBM hardware pass-through +
  `cael-quantum-v1` receipt (`:448-706`), exact-diagonalization accuracy check (`:677-680`).
  But for non-H₂ molecules the Hamiltonian (`:410-417`) is an admitted placeholder ZZ-chain
  — generic-molecule energies are physically meaningless (flagged in-code `:411-412`, not
  concealed).
- **INTENT.** A real electronic-structure Hamiltonian for arbitrary molecules
  (PySCF → OpenFermion → qubit mapping), so generic-molecule VQE is chemically meaningful.
- **PATH.** Land the noted PySCF→OpenFermion integration; validate ≥1 non-H₂ molecule vs
  literature ground-state to chemical accuracy.
- **RISK / OWNER.** **Founder-gate** — paper-37 (quantum track, F.066); paid IBM QPU runs
  are founder-gated (F.071/F.072). Simulator-first.

### E5 — ObjectTrackingTrait OVERCLAIMED (Pattern B + E), fix is UNBOUNDED
- **CONTEXT.** `core/src/traits/ObjectTrackingTrait.ts`. Docstring claims "Tracks and
  anchors using ARCore/RealityKit" but `onUpdate` (`:78-90`) only accumulates counters and
  `onEvent` (`:99-113`) flips booleans on externally-supplied events — no pose math, no
  anchor computation. 5 production compilers dispatch it as live (Babylon `:487`, Godot
  `:591`, R3F `:3285`, Unity `:723`, ThreeJS `:392`) as a config passthrough; all 4 emitted
  `tracking:*` events have **zero consumers**.
- **INTENT.** Either (a) real tracking-state bookkeeping fed by a platform AR session +
  wired consumers for the events, with the claim narrowed to that; or (b) genuine
  anchor/pose computation, which needs platform sensor ingress the runtime doesn't surface.
- **PATH.** Narrow the docstring to "tracking-state bookkeeping fed by an external AR
  session"; surface AR session pose into `TraitContext`; wire ≥1 consumer for the 4 events.
- **RISK / OWNER.** UNBOUNDED (needs sensor ingress in the runtime). Tighten the claim now;
  build behind the runtime AR-session work.

### E6 — AstarTrait OVERCLAIMED — wire to engine AStarPathfinder (dep-cycle caution)
- **CONTEXT.** `core/src/traits/AstarTrait.ts` echoes `from`/`to` on `astar:find_path`
  (`:21-34`), no search. A full A* exists at `engine/src/navigation/AStarPathfinder.ts`
  (`findPath` `:64-193`, open/closed/g/h/f + reconstruction).
- **INTENT.** Trait delegates to `AStarPathfinder.findPath` over a NavMesh from context;
  emit the real path/cost.
- **PATH.** Wire the call + harden the test to assert a computed path.
- **RISK / OWNER.** `@holoscript/core` and `@holoscript/engine` already declare each other
  as workspace deps (circular). Importing `AStarPathfinder` into a core trait risks a
  **module-level import cycle** — verify cycle-safety (or relocate the pathfinder to core)
  before landing. That dep check is why this is a spec, not a same-pass land.

### E7 — OptimizationTrait OVERCLAIMED — needs a computable-objective contract
- **CONTEXT.** `core/src/traits/OptimizationTrait.ts` echoes the objective on `opt:solve`
  (`:21-39`), no solve. `max_iterations`/`tolerance` are never read by any algorithm. The
  event passes `objective` as a **string label** (`'minimize_cost'`) — there is nothing
  computable to minimize. No general `minimize()` seam exists in core (`std/src/math.ts`
  has none; the physics ConstraintSolver/IK solvers are not general objective minimizers).
- **INTENT.** A real iterative minimizer (projected/gradient descent over decision vars,
  capped by `max_iterations`, exit on `tolerance`) — but FIRST a contract where `objective`
  is computable (coefficients or a function), not a string.
- **PATH.** Define the computable-objective event contract; implement a small real minimizer
  in-place; harden the test to assert a minimized value + convergence.
- **RISK / OWNER.** Bounded once the contract is decided; the contract change is a public
  trait-interface design call.

---

## Tooling finding — local HoloGraph rebuild is broken

`scripts/recreate-graph-cache.mjs` aborts on the `absorb-service` shard:
`GraphRAG embedding provider must be holoembed; embeddingProvider argument requested openai`
(`packages/absorb-service/dist/mcp/index.js:946`, `requireNativeGraphRAGProvider`). HoloEmbed
is misconfigured and the rebuild refuses to fall back to openai (correctly). The remote
graph (mcp.holoscript.net) is stale (77.8h) and runs on Railway `/app`, so it can't see the
local checkout either. Net: HoloGraph/HoloEmbed are currently unusable as a fresh local
handle. Worth its own fix so future ratchets get the exact graph handle (F.068) instead of
grep fallback.

## Next breadth pass

Tier 3 (61 compilers) and the ~88 remaining POTENTIAL traits are un-ratcheted. The compiler
tier is the next-highest leverage surface (each `compile_to_*` claims a working emit target).
