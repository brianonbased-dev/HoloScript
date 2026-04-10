# The Great Refinement: V1-V5 Master Execution Plan

**Objective**: Systematically expand, reiterate, and deeply enhance the foundations built from HoloScript v1.0 through v5.0. No new paradigms; only stabilization, integration, and developer experience excellence.

---

## Track 1: Studio Quality & Developer Experience (DX)

_Focus: Eliminating friction from the primary authoring environments._

### Phase 1A: Visual Fidelity & Rendering

- **Identify & Fix Rendering Artifacts**: Audit the Studio rendering pipeline for z-fighting, anti-aliasing issues, and material clipping.
- **Implement Live 3D Previews**: Transition from static placeholders to real-time rendering of procedural geometry and GLB assets inside the Studio asset browser.
- **Lighting & Post-Processing Polish**: Ensure the default studio environment utilizes `post_processing_block` efficiently without dropping frames.

### Phase 1B: UX & Interaction Reliability

- **Click-to-Place Logic**: Overhaul the Raycaster implementation. Fix accidental placements that occur during camera orbital movements.
- **Gizmo Stability**: Ensure transformation gizmos strictly adhere to grid-snapping settings and do not desync from the underlying AST `position`/`rotation` vectors.

### Phase 1C: Tooling & Error Handling

- **Unified Error Classification**: Standardize parser, compiler, and runtime error schemas. Errors must provide exact AST line/column numbers and actionable fix suggestions.
- **CLI Robustness**: Audit `holoscript compile` and `holoscript preview` for silent failures or obscure stack traces.
- **Language Server Protocol (LSP)**: Ensure the VS Code extension provides near-instant IntelliSense for all 2,000+ traits.

---

## Track 2: Core Engine Hardening

_Focus: Perfecting the underlying execution and compilation environment._

### Phase 2A: Test Coverage Supremacy

- **Target**: Exceed 1,500 test cases with 100% coverage on pure logic sub-systems.
- **AI Subsystem**: Implement rigorous unit and integration tests for `BehaviorTree`, `GoalPlanner`, and `UtilityAI`.
- **Combat & Dialogue Systems**: Ensure state transitions, damage calculations, and branching narrative nodes are fully deterministic and covered.
- **Procedural Generation**: Test seed stability and output consistency across different hardware architectures.

### Phase 2B: Memory & Performance Optimization

- **OOM Bottleneck Resolution**: Investigate and eliminate Out-Of-Memory exceptions during large `.holo` compilation cycles (specifically in `GLTFPipeline.ts` and `R3FCompiler.ts`).
- **Incremental Compilation**: Optimize the AST diffing engine so that hot-reloads compute in sub-50ms times, maintaining the 60fps immersive editing goal.
- **Zero-Allocation Execution paths**: Refactor critical hot-paths in the runtime loop to eliminate garbage collection stutter.

---

## Track 3: Trait Ecosystem Integration

_Focus: Harmonizing the 2,000+ traits into a cohesive, uncrashable library._

### Phase 3A: Cross-Domain Interoperability Audits

- **Physics vs Networking**: Ensure `rigidbody_block` state syncs flawlessly across the `NetworkedTrait` without jitter or delta-compression desyncs.
- **AI vs Procedural**: Validate that `@agent` navigation completely respects dynamically generated `navmesh` data instantiated after load-time.
- **Audio vs Spatial**: Guarantee that occlusion algorithms properly attenuate sound behind dynamic objects instantiated via `#using "Template"`.

### Phase 3B: Industry Plugins Maturation

- **Medical Plugin (v2)**: Polish the `DICOM` viewer trait. Ensure smooth volumetric rendering and coordinate stability for surgical planning components.
- **Robotics Plugin (v2)**: Stabilize the URDF/SDF compiler. Guarantee that complex joint topologies (`@harmonic_drive`, `@force_torque_sensor`) map 1:1 with NVIDIA Isaac Sim expectations.

---

## Execution Methodology: HoloScript Absorb Integration

1. **Absorb Before Refactor**: Before touching any subsystem (e.g., `packages/studio`), the agent WILL run `holoscript absorb <path> > knowledge.holo` to generate an AST spatial graph.
2. **Graph RAG Querying**: We will utilize the generated `.holo` knowledge graph to trace call chains, identify circular dependencies, and map tight coupling prior to making code changes.
3. **Zero Degression Rule**: No refinement PR may lower existing test coverage.
4. **"No Fake Stubs" Rule**: All simulated network/crypto API calls remaining in the V1-V5 stack must be backed by real integration endpoints or aggressively flagged for removal.
5. **Documentation Parity**: If a system is touched during refinement, its Markdown documentation must be simultaneously updated.

---

## Weekly Execution Lanes (Now / Next / Blocked)

Use this section as the live weekly update scaffold. Keep entries short, outcome-focused, and tied to concrete files, tests, or artifacts.

### Week Of: YYYY-MM-DD

### Seeded Lane A: Studio UX and Orchestration

#### Seeded Lane A Now

1. [ ] Active item

#### Seeded Lane A Next

1. [ ] Planned item

#### Seeded Lane A Blocked

1. [ ] Blocker item (owner + unblock condition)

### Seeded Lane B: Core Parser / Runtime / Validation

#### Seeded Lane B Now

1. [ ] Active item

#### Seeded Lane B Next

1. [ ] Planned item

#### Seeded Lane B Blocked

1. [ ] Blocker item (owner + unblock condition)

### Seeded Lane C: MCP Toolchain and Agent Correction Loops

#### Seeded Lane C Now

1. [ ] Active item

#### Seeded Lane C Next

1. [ ] Planned item

#### Seeded Lane C Blocked

1. [ ] Blocker item (owner + unblock condition)

### Seeded Lane D: Test Expansion and Benchmark Stabilization

#### Seeded Lane D Now

1. [ ] Active item

#### Seeded Lane D Next

1. [ ] Planned item

#### Seeded Lane D Blocked

1. [ ] Blocker item (owner + unblock condition)

### Seeded Weekly Evidence

1. `git` milestone commits landed this week:
2. New or expanded tests added:
3. Benchmark or performance deltas observed:
4. Cross-repo dependencies touched (Hololand / orchestrator / AI_Workspace):

### Week Exit Criteria

1. At least one merged milestone per active lane.
2. No lane reports progress without linked artifact evidence.
3. Any blocker older than 7 days has explicit escalation owner.

---

## Seeded Current Week Snapshot (2026-03-12)

### Lane A: Studio UX and Orchestration

#### Lane A Now

1. [ ] Consolidate active Studio UI and orchestration edits into milestone batches (chat, wardrobe, shader, node graph, paint, wizard, stores, hotkeys).
2. [ ] Land one scoped PR for version-control UX surfacing (spatial blame overlay and related panel wiring).

#### Lane A Next

1. [ ] Stabilize orchestration keyboard and panel visibility behavior with scenario-level regression tests.

#### Lane A Blocked

1. [ ] Large mixed local diff increases review complexity; unblock by splitting per feature lane.

### Lane B: Core Parser / Runtime / Validation

#### Lane B Now

1. [ ] Integrate parser/material pipeline additions (knowledge parser, material parser/types) with runtime trait context and validation modules.
2. [ ] Define one pass/fail hardening checklist for new errors, io, and validation clusters.

#### Lane B Next

1. [ ] Convert broad local core changes into test-backed slices mapped to refinement milestones.

#### Lane B Blocked

1. [ ] Scope overlap across parser, runtime, and validation paths; unblock by introducing an integration acceptance matrix.

### Lane C: MCP Toolchain and Agent Correction Loops

#### Lane C Now

1. [ ] Wire and verify edit-holo and holotest tool paths end-to-end in MCP server tests.
2. [ ] Confirm source-preserving edit behavior for multi-edit sequences against representative scenes.

#### Lane C Next

1. [ ] Add guardrails for unsafe or ambiguous edits and expose deterministic failure responses.

#### Lane C Blocked

1. [ ] Tooling maturity depends on stable scene fixtures; unblock by pinning canonical test fixtures in packages/mcp-server tests.

### Lane D: Test Expansion and Benchmark Stabilization

#### Lane D Now

1. [ ] Triage and categorize expanded Studio and core tests into smoke, integration, scenario, and stress suites.
2. [ ] Stabilize benchmark runner and new scenario folders (high-complexity, robotics-sim, multiplayer-vr).

#### Lane D Next

1. [ ] Publish first weekly delta on test count growth and flaky-test burn-down.

#### Lane D Blocked

1. [ ] Temporary artifact volume obscures benchmark signal; unblock by moving transient outputs into cleaned, ignored paths.

### Weekly Evidence

1. Worktree concentration snapshot: 27 modified tracked files, 192 untracked files.
2. Untracked package concentration: packages/studio (64), packages/core (14), packages/test (10), packages/mcp-server (7).
3. Recent mainline commits are documentation-heavy while implementation intensity remains local and broad.
4. Cross-repo dependency touchpoints: Studio-first doctrine and roadmap alignment updates in AI_Workspace and Hololand.
