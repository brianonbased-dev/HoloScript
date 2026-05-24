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

## Tier-3 compilers — 12 of 61 ratcheted (2026-05-24, batches 1-2)

Verdict: **11 REAL, 1 THIN, 0 OVERCLAIMED.** The compiler tier genuinely traverses the
scene-graph AST and emits input-varying output (verifiers assert structural faithfulness,
not just non-empty). The recurring weakness is a **silent-degradation anti-pattern** —
unhandled cases drop to a comment / a default primitive / a hardcoded constant with no
warning — masked by verifiers that only assert token-presence.

| Compiler | Verdict | Note |
|---|---|---|
| R3FCompiler | REAL | 93 trait branches, faithful; unknown traits flagged not dropped |
| UnityCompiler | REAL | ~50 traits; AR/XR/AI/FX/timeline-bodies emit config-preserving comments (no runtime behavior) |
| UnrealCompiler | REAL | geometry/state/physics/domain real; ~7 interaction traits + timeline/action bodies stubbed; object children NOT recursed (flat actor list) |
| GaussianSplattingCompiler | REAL | real Jacobi-PCA splats + GLB; claim wording wrong (glTF `KHR_gaussian_splatting`, not .ply/.splat); constant demo-grid fallback when no splat trait; weak verifier |
| URDFCompiler | REAL | 6 joint types, real inertia tensors, strong verifier |
| WebGPUCompiler | REAL | ~85% input-driven; emitted code calls `generateSphereVertices` etc. never defined/imported → won't run standalone (bounded) |
| NIRCompiler | REAL | genuine neuromorphic NIR lowering + composite sub-nodes; weights are honest deterministic placeholders (untrained) |
| NIRToWGSLCompiler | REAL | 14 op generators, Euler/RK4 divergence; Conv2d/pooling hardcode 28×28 dims; no double-buffering |
| SDFRayMarchCompiler | REAL | real per-primitive SDF + CSG + raymarch; 6 primitives silently degrade to unit sphere (no warning) |
| QuantumCircuitCompiler | REAL | qubit/gate count scale with molecule, real OpenQASM 3.0; VQE/QAOA variational params hardcoded (`ry(0.1)`, γ/β=0.5), not bindable |
| USDPhysicsCompiler | REAL | node tree→prim hierarchy + UsdPhysics; joint body0/body1 paths may dangle in Isaac; geometry size/radius never emitted; flat prim list |
| WASMCompiler | **THIN** | real input-driven WAT *text* (state→memory, objects→fns) but per-object update bodies are empty stubs and it never produces WASM bytes (no wabt/binaryen, format option unread); verifier never instantiates. "working WebAssembly module" overclaims. |

Cross-cutting: most compiler verifiers assert token presence, not faithful structure/behavior
— they would not catch the silent-degradation cases above. Filed to the board:
C-WASM (P3), C-FIDELITY (P4), breadth-2 (P5).

### Batches 3-4 — 12 more (24 of 61 total): 22 REAL, 1 THIN, 1 OVERCLAIMED-vs-claim

| Compiler | Verdict | Note |
|---|---|---|
| ThreeJSCompiler | REAL | full AST traversal, strong fidelity verifier; honest comment-degradation (gltf/text/unknown-trait) |
| BabylonCompiler | REAL | golden-snapshot verifier; ~7 AI/XR traits comment-stubs |
| GodotCompiler | REAL | 50+ fidelity assertions; **claim wording: ".tscn/GDScript" but only runtime-building GDScript emitted, no .tscn** |
| IOSCompiler | REAL | genuine scene translation BUT **no verifier exists AND no dispatch path wired** in checkout; mesh dims hardcoded, placeObject non-deterministic |
| AndroidCompiler | REAL | scene→Kotlin real BUT **per-object factories never wired — `placeObject` only creates one default node → multi-object scenes collapse to one node**; verifier is SHA hash-lock (stability, not fidelity) |
| VisionOSCompiler | REAL | 75 trait mappings, faithful; **no verifier exists**; cylinder/cone/torus→box |
| PlayCanvasCompiler | REAL | faithful; **docstring overclaims "Animation via Anim component" — not delivered** (timelines comments only); verifier thin (toContain only) |
| DTDLCompiler | REAL | faithful DTDL v3, fidelity verifier asserts schema inference; bounded silent env-key/trait drop |
| A2AAgentCardCompiler | REAL | 11 skill compilers, strong 1148-line fidelity verifier |
| USDZExportCompiler | REAL | spec-correct CRC-32 + 64-byte-aligned ZIP, fidelity verifier; rotation degrees→radians **unit bug** (label says convert, value passed through) |
| OpenXRCompiler | REAL | scene→C++ real; **action-sets fixed boilerplate (not input-derived)**, unhandled traits silently dropped, domain blocks comment-only; thin verifier |
| MCPConfigCompiler | **OVERCLAIMED-vs-claim** | emits MCP *client* connection config (`mcpServers` block), NOT a server config with tools/input-schemas/resources as `compile_to_mcp_config` implies; zero tool/resource emission; no fidelity verifier. REAL against its own docstring, OVERCLAIMED against the tool framing. |

New cross-cutting findings (filed to board): (a) **native-platform compilers lack fidelity verifiers** — iOS/VisionOS have none, Android only a SHA hash-lock; iOS has no wired dispatch path. (b) **AndroidCompiler functional defect** — emitted per-object code is dead (placeObject ignores it). (c) **claim-wording drift** — MCPConfig (client vs server), PlayCanvas (animation), Godot (.tscn). (d) USDZ rotation unit bug.

### Batch 5 — 6 more (30 of 61 total): 6 REAL, 0 THIN/OVERCLAIMED-in-code

| Compiler | Verdict | Note |
|---|---|---|
| TSLCompiler | REAL | input-faithful shader compiler, strong 903-line verifier; **claim-wording: emits WGSL modules + TS pipeline, not Three.js TSL node-graph JS** |
| SDFCompiler | REAL | **NAME COLLISION: this is Gazebo *Simulation Description Format* (XML), NOT signed-distance-field** (that's SDFRayMarchCompiler). Faithful Gazebo exporter w/ real inertia tensors + 52-assertion fidelity verifier. `compile_to_sdf` framing misleads. |
| Native2DCompiler | REAL | HTML/Tailwind or React .tsx, input-driven (~85%); **no fidelity verifier** (only a latency bench) |
| MultiLayerCompiler | REAL | genuinely fans out to AR/VRR/Babylon sub-compilers on one composition; verifier asserts per-target output |
| NFTMarketplaceCompiler | REAL | full conditional ERC-1155 Solidity emission (royalties/lazy-mint/access-control/maxSupply/marketplace), dedicated 498-line fidelity verifier; honest stubs (abi:[], cost-est) |
| HoloGramMLSCompiler | REAL | **MLS = Multiple Listing Service (real-estate photos→3D gallery), NOT multi-layer-stereo/MV-HEVC**. Real input-driven layout; `compile()` intentionally throws (use `compileBundle()` — verified, not a bug); depth deferred to real @depth_estimation runtime trait |

Batch-5 findings are claim-wording/terminology + verifier-coverage only — no code stubs.
Filed to board: claim/terminology disambiguation + Native2D verifier (C-DISAMBIG).

### Batch 6 — 6 more (36 of 61 total): 2 REAL, 1 THIN, 3 OVERCLAIMED

The first batch with substantive OVERCLAIMED findings (the niche/product-edge surface).

| Compiler | Verdict | Note |
|---|---|---|
| ShaderGraphCompiler | REAL | 97 node-type generateCode closures, real topo-sort + edge→variable wiring; bounded: fixed Cook-Torrance PBR tail, fidelity-blind verifier |
| StateCompiler | REAL | fully data-driven state extraction + fidelity verifier; bounded: MCP passes HoloComposition but class reads HSPlusAST (shape mismatch, end-to-end untested) |
| QuiltCompiler | **THIN** | computes real per-tile camera params, but its emitted R3F renderer string is a non-functional stub; the REAL multi-view rendering lives in `BrowserQuiltRenderer.ts` (separate) — the named compiler should delegate to it |
| ARCompiler | **OVERCLAIMED** | `compile_to_ar` emits a near-fixed Three.js skeleton; reads only `@ar_beacon` as a 1-bit toggle (one global handler regardless of count), `@overlay` extracted-but-unused; `@geo_anchor`/`@qr_scan`/`@ar_portal`/`@camera_overlay`/`@x402_paywall` silently dropped (~95% of scene semantics). Verifier passes against the fixed template. BOUNDED (traverser exists; gap is per-node codegen + plumbing) |
| MVHEVCCompiler | **OVERCLAIMED** | produces Swift/ffmpeg scaffold *strings* + metadata, NO actual MV-HEVC encoding/bytes; emitted ffmpeg cmd yields single-view HEVC mislabeled. UNBOUNDED (real encoder, platform-gated). Truthfully a planner; mislabeled as "compiles to MV-HEVC artifact" |
| ProceduralCompiler | **OVERCLAIMED** | a string formatter — echoes `skill.code`, wraps `move/attack/craft` lines in `ensure_safety()`; zero procedural generation; the `ProceduralSkill` interface has no rules/grammar/params. Self-described MVP; tautological test. BOUNDED (additive) |

Filed to board: C-AR (P3), C-HOLOGRAM (MVHEVC+Quilt, P3), C-PROCEDURAL (P4).

## Tally so far (36 of 61 compilers + 15 solvers/traits)

Compilers: **30 REAL, 2 THIN (WASM, Quilt), 4 OVERCLAIMED (MCPConfig-vs-claim, AR, MVHEVC,
Procedural)**. The flagship/sovereign/format tiers are genuinely real codegen; the OVERCLAIMED
cases concentrate at the **niche/product-edge** (AR runtime, MV-HEVC codec, procedural-gen) —
exactly where a verifier asserting only token-presence lets a near-fixed-template or
scaffold-string compiler pass. Findings cluster in: (1) silent-degradation of unhandled cases,
(2) thin/absent fidelity verifiers, (3) claim/terminology drift, (4) product-edge overclaims.

### Batch 7 — 6 more (42 of 61 total): 5 REAL, 1 THIN/OVERCLAIMED

The AR-family overclaim did NOT generalize — the XR/glasses/sleeve siblings are REAL.

| Compiler | Verdict | Note |
|---|---|---|
| AndroidXRCompiler | REAL | faithful Jetpack-XR codegen, ~12 trait handlers, 533-line fidelity verifier; honest comment-degradation (~5-10%) |
| AIGlassesCompiler | REAL | data-driven HUD, ~60 trait mappings, fidelity verifier; emits a UI skeleton w/ handler stubs (matches "runtime structure" claim) |
| PhoneSleeveVRCompiler | REAL | genuine Cardboard stereo (StereoEffect, IPD, barrel-distortion K1/K2, 3-DOF head tracking), fidelity verifier; AI/SNN/Brittney modules opt-in stubbed (default false) |
| OpenXRSpatialEntitiesCompiler | REAL | faithful entity mapping + fidelity verifier; **spec-shape bug**: `eulerToQuaternion` returns `{0,1,2,w}` not `{x,y,z,w}`, pose position a bare array vs `XrVector3f` — values correct, JSON off-spec, tests entrench it. BOUNDED |
| VRChatCompiler | REAL | genuine Udon/C# emission (state→UdonSynced, timelines→coroutine delays, traits→per-trait scripts); transform/geometry props + timeline `animate` not emitted (bounded). **CLAUDE.md "known-failing" caveat is STALE — fixed by commit 381b7ea05, all 155 VRChat tests green** |
| NodeGraphCompiler | **THIN/OVERCLAIMED** | extracts state/event/timer scaffolding but MathAdd/Multiply/Branch emit comments only, edge port-wiring dropped (no value flow), and it does NOT use the real topo-sort+evaluator that exists in `NodeGraph.ts`. "real executable logic, topo-sorts" overclaims. BOUNDED (route through existing evaluator) |

Filed to board: C-NODEGRAPH (P4), C-OPENXR-POSE + VRChat-stale-doc (P4/P5).

## Tally so far (42 of 61 compilers + 15 solvers/traits)

Compilers: **35 REAL, 3 THIN (WASM, Quilt, NodeGraph), 4 OVERCLAIMED (MCPConfig-vs-claim, AR,
MVHEVC, Procedural)**. Overclaims concentrate at the product-edge/scaffold-only surface; the
flagship/sovereign/format/XR tiers are genuinely real codegen. Recurring clusters:
(1) silent-degradation, (2) thin/absent fidelity verifiers, (3) claim/terminology drift,
(4) product-edge overclaims, (5) spec-shape bugs the tests entrench.

### Batch 8 — 6 more (48 of 61 total): 4 REAL, 1 THIN, 1 OVERCLAIMED

| Compiler | Verdict | Note |
|---|---|---|
| TraitCompositionCompiler | REAL | delegates to ProvenanceSemiring (real commutative-semiring conflict resolver: per-property strategies, authority-weighting, deterministic tie-break); strong fidelity verifier. Minor: authority≥100 conflict-bypass, dropped diamond warnings |
| PipelineCompiler | REAL | per-element generators (source/transform/filter/validate/branch/sink), real cross-stage data-flow wiring, fidelity verifier (~1.0) |
| IncrementalCompiler | REAL | genuine SHA-256 change-detection + dependency invalidation + cache-skip; verifier asserts skips/hits ADVERSARIALLY (counts compiler invocations) — strongest verifier in the tier |
| NextJSCompiler | REAL | wraps Native2DCompiler's real React codegen, input-driven, fidelity verifier; single-page (bounded, matches claim) |
| NodeServiceCompiler | **THIN** | real route/method/path/middleware/deps scaffold varying with input, but **handler bodies are 100% `501 not_implemented` stubs** — no logic/state synthesis (honestly labeled "skeleton"). BOUNDED (`@handler` seam exists) |
| GraphCompiler (scripting) | **OVERCLAIMED** | faithful graph→ordered-wired-IR sequencer (USES topo-sort, WIRES edges — better than NodeGraphCompiler) but emits NO executable logic (wire value hardcoded `null`, no operation semantics). An IR compiler mislabeled "real executable script/logic". BOUNDED |

Filed to board: C-GRAPHLOGIC (GraphCompiler + NodeService + relates to NodeGraph, P4).

## FINAL TALLY (48 of 61 compilers + 15 solvers/traits = 63 claims ratcheted)

**Compilers: 39 REAL, 4 THIN (WASM, Quilt, NodeGraph, NodeService), 5 OVERCLAIMED (MCPConfig-vs-claim,
AR, MVHEVC, Procedural, GraphCompiler-scripting).**
**Solvers/traits (prior): 13 REAL solvers, ConstraintSolver OVERCLAIMED, 5 algorithm-traits OVERCLAIMED
(2 fixed: TensorOp, Navmesh).**

Headline: HoloScript core is **overwhelmingly real codegen and real numerics**. Overclaims are
not fabrications across the board — they concentrate in three recognizable shapes:
1. **Product-edge scaffold-only** (AR runtime, MV-HEVC codec, procedural-gen) — emit a near-fixed
   skeleton or scaffold strings instead of compiling the input.
2. **Graph→logic compilers that stop at structure** (NodeGraph, GraphCompiler) — wire/sequence
   but emit no executable behavior.
3. **Echo-stub traits** (TensorOp/Navmesh/Astar/Optimization/ObjectTracking) — the original
   trait-tier finding; real seams sit next to them (F.068).
The common enabler is **verifiers that assert token-presence, not faithful behavior** — a real
fidelity verifier (counts/values/adversarial skip-counts) is the single highest-leverage
preventive (Incremental/A2A/NFTMarketplace/StructuralSolver show what good looks like).

## Stopped here (breadth saturated)

Remaining **~13 compilers** are pure infra/niche (FlatSemantic/Context/Holob/SCM/NextJSAPI/
Matterpak/LLMProviderCapabilities/CodebaseScene/PlatformConditional/studio useCompiler+
nodeGraphCompiler) — low leverage, on the board as breadth-2. The **~88 POTENTIAL trait stubs +
Tier-4 integration traits** also remain on the board. All deep-ratchet findings (19 board tasks)
are filed and reference this doc.

## Reconciliation landed / in-flight (2026-05-24)

- **TensorOpTrait** (mine, `7bec450b7`), **NavmeshSolverTrait** (mine, `ba7712a76`),
  **ARCompiler C-AR** (mine, `911e12619` — per-beacon + overlay registries, fidelity-tested).
- **ConstraintSolver E1** (`0c88c4bbb`) + **AstarTrait E6** (`73cb47de5`) — landed by a Codex peer
  off the board tasks.

## Founder direction — VRChat target = compile to bytecode ("Byte")

Founder 2026-05-24: VRChatCompiler's plan is to **compile to Udon bytecode** (Udon Assembly /
"Byte"), NOT keep emitting UdonSharp C# *source*. Today it emits UdonSharp `.cs` scripts
(`useUdonSharp: true`) that still need the external UdonSharp compiler to reach Udon bytecode;
the plan is to lower HoloScript → Udon bytecode directly. **Consequence:** the bounded C#-path
gaps flagged above (transform/geometry props, timeline `animate`) are **NOT worth patching** —
they'd be superseded by the bytecode target. Tracked as a new build task (C-VRCHAT-BYTECODE).
NOTE: the stale "VRChatCompiler = known test fail" caveat lives only in the global
`~/.claude/CLAUDE.md` (not the repo) — founder to retire it (VRChat tests are green,
`381b7ea05`).
